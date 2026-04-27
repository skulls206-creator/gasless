import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { buildAndSignUSDTTransfer } from "@/lib/tron";

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
      const res = await fetch(`/api/tron/balance/${encodeURIComponent(address)}`);
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
      const res = await fetch(`/api/tron/resources/${encodeURIComponent(address)}`);
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
      const res = await fetch(url);
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
  feeTxid?: string;
  sponsored: boolean;
}

export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
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

      const res = await fetch("/api/gasless-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTx, signedFeeTx, userAddress: fromAddress }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transaction failed");
      return json as GaslessSendResult;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["usdt-balance", variables.fromAddress] });
      queryClient.invalidateQueries({ queryKey: ["tron-resources", variables.fromAddress] });
      queryClient.invalidateQueries({ queryKey: ["usdt-transactions", variables.fromAddress] });
    },
  });
}
