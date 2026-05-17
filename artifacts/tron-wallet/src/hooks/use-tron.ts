import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { buildAndSignUSDTTransfer } from "@/lib/tron";
import { apiUrl } from "@/lib/api";

export interface TronResources {
  freeNetLimit: number;
  freeNetUsed: number;
  NetLimit: number;
  NetUsed: number;
  EnergyLimit: number;
  EnergyUsed: number;
  availableBandwidth: number;
  availableEnergy: number;
  isSufficientForTRC20: boolean;
}

export interface SponsorInfo {
  configured: boolean;
  active: boolean;
  estimatedSendsRemaining?: number | null;
}

export type SponsorHealth = "active" | "degraded" | "unavailable" | "off";

/** Threshold below which gasless is shown as "degraded" rather than "active". */
const DEGRADED_SENDS_THRESHOLD = 5;

export function deriveSponsorHealth(info: SponsorInfo | undefined): SponsorHealth {
  if (!info || !info.configured) return "off";
  if (!info.active) return "unavailable";
  const remaining = info.estimatedSendsRemaining;
  if (typeof remaining === "number" && remaining > 0 && remaining < DEGRADED_SENDS_THRESHOLD) {
    return "degraded";
  }
  return "active";
}

/**
 * Public sponsor readiness. Auto-refreshes every 60s so the dashboard and
 * Send page proactively reflect when the sponsor wallet can't cover sends.
 */
export function useSponsorInfo() {
  return useQuery<SponsorInfo>({
    queryKey: ["sponsor-info"],
    queryFn: async ({ client }): Promise<SponsorInfo> => {
      try {
        const res = await fetch(apiUrl("/api/sponsor-info"));
        if (!res.ok) throw new Error(`sponsor-info HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        // Transient API failure: don't silently degrade to "off" (which hides
        // the pill). If we previously knew the sponsor was configured, treat
        // this as "unavailable" so the user is warned rather than misled.
        const prev = client.getQueryData<SponsorInfo>(["sponsor-info"]);
        if (prev?.configured) {
          return { configured: true, active: false };
        }
        throw err;
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export interface Trc20Transaction {
  transaction_id: string;
  token_info: { symbol: string; address: string; decimals: number };
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
}

// Balance — proxied through backend
export function useUSDTBalance(address: string | null) {
  return useQuery({
    queryKey: ["usdt-balance", address],
    queryFn: async () => {
      if (!address) return 0;
      const res = await fetch(apiUrl(`/api/tron/balance/${encodeURIComponent(address)}`));
      if (!res.ok) return 0;
      const { balance } = await res.json();
      return typeof balance === "number" ? balance : 0;
    },
    enabled: !!address,
    refetchInterval: 45_000,
  });
}

// Resources — proxied through backend (no more direct TronGrid from browser)
export function useTronResources(address: string | null) {
  return useQuery<TronResources>({
    queryKey: ["tron-resources", address],
    queryFn: async () => {
      if (!address) throw new Error("No address");
      const res = await fetch(apiUrl(`/api/tron/resources/${encodeURIComponent(address)}`));
      if (!res.ok) throw new Error(`Resources fetch failed (${res.status})`);
      return res.json();
    },
    enabled: !!address,
    refetchInterval: 60_000,
    retry: 2,
  });
}

// Transaction history — proxied through backend, paginated
export function useUSDTTransactions(address: string | null) {
  return useInfiniteQuery({
    queryKey: ["usdt-transactions", address],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!address) return { data: [] as Trc20Transaction[], meta: {} };
      let url = `/api/tron/transactions/${encodeURIComponent(address)}?limit=50`;
      if (pageParam) url += `&fingerprint=${encodeURIComponent(pageParam)}`;
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(`Transaction fetch failed (${res.status})`);
      return res.json() as Promise<{ data: Trc20Transaction[]; meta: { fingerprint?: string } }>;
    },
    getNextPageParam: (lastPage) => lastPage.meta?.fingerprint ?? undefined,
    enabled: !!address,
    refetchInterval: 60_000,
    retry: 2,
  });
}

export interface AppConfig {
  feeAmount: number;
  feeRecipient: string | null;
  feesEnabled: boolean;
}

export interface GaslessSendResult {
  txid: string;
  /** null when the fee tx could not be broadcast (see feeError). */
  feeTxid?: string | null;
  /** Set when the main tx succeeded but the $1 service-fee transfer failed. */
  feeError?: string;
  sponsored: boolean;
}

export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/config"));
      if (!res.ok) return { feeAmount: 1, feeRecipient: null, feesEnabled: false };
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useSendUSDT() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      privateKey,
      fromAddress,
      toAddress,
      amount,
      feeRecipient,
      feeAmount,
    }: {
      privateKey: string;
      fromAddress: string;
      toAddress: string;
      amount: number;
      feeRecipient?: string | null;
      feeAmount?: number;
    }): Promise<GaslessSendResult> => {
      const signedTx = await buildAndSignUSDTTransfer(privateKey, fromAddress, toAddress, amount);

      let signedFeeTx: object | undefined;
      if (feeRecipient && feeAmount && feeAmount > 0) {
        signedFeeTx = await buildAndSignUSDTTransfer(privateKey, fromAddress, feeRecipient, feeAmount);
      }

      const res = await fetch(apiUrl("/api/gasless-send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTx, signedFeeTx, userAddress: fromAddress }),
      });

      const json = await res.json();
      if (!res.ok) {
        // 502 from /gasless-send means broadcast succeeded but the contract
        // reverted on-chain. Preserve the txid so the UI can link to Tronscan
        // and explain what happened.
        const err: any = new Error(json.error || "Transaction failed");
        if (json.txid) err.txid = json.txid;
        if (json.unconfirmed) err.unconfirmed = true;
        throw err;
      }
      return json as GaslessSendResult;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["usdt-balance", variables.fromAddress] });
      queryClient.invalidateQueries({ queryKey: ["tron-resources", variables.fromAddress] });
      queryClient.invalidateQueries({ queryKey: ["usdt-transactions", variables.fromAddress] });
    },
  });
}
