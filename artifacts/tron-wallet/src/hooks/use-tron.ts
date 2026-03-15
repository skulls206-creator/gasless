import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUSDTBalance, buildAndSignUSDTTransfer, USDT_CONTRACT_ADDRESS, TRONGRID_API_URL } from "@/lib/tron";

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

// Hook to fetch USDT Balance
export function useUSDTBalance(address: string | null) {
  return useQuery({
    queryKey: ["usdt-balance", address],
    queryFn: () => {
      if (!address) return Promise.resolve(0);
      return getUSDTBalance(address);
    },
    enabled: !!address,
    refetchInterval: 15000,
  });
}

// Hook to fetch Bandwidth and Energy
export function useTronResources(address: string | null) {
  return useQuery<TronResources>({
    queryKey: ["tron-resources", address],
    queryFn: async () => {
      if (!address) throw new Error("No address provided");
      
      const res = await fetch(`${TRONGRID_API_URL}/v1/accounts/${address}`);
      const json = await res.json();
      
      const data = json.data?.[0] || {};
      
      const freeNetLimit = data.freeNetLimit || 0;
      const freeNetUsed = data.freeNetUsed || 0;
      const NetLimit = data.NetLimit || 0;
      const NetUsed = data.NetUsed || 0;
      
      const EnergyLimit = data.account_resource?.EnergyLimit || 0;
      const EnergyUsed = data.account_resource?.EnergyUsed || 0;
      
      const availableBandwidth = (freeNetLimit - freeNetUsed) + (NetLimit - NetUsed);
      const availableEnergy = EnergyLimit - EnergyUsed;
      
      return {
        freeNetLimit,
        freeNetUsed,
        NetLimit,
        NetUsed,
        EnergyLimit,
        EnergyUsed,
        availableBandwidth,
        availableEnergy,
        // ~300 Bandwidth and ~13,000 Energy typically required for a TRC-20 transfer
        isSufficientForTRC20: availableBandwidth >= 300 && availableEnergy >= 13000,
      };
    },
    enabled: !!address,
    refetchInterval: 30000,
  });
}

// Hook to fetch USDT Transaction History
export function useUSDTTransactions(address: string | null) {
  return useQuery({
    queryKey: ["usdt-transactions", address],
    queryFn: async () => {
      if (!address) return [];

      const res = await fetch(
        `${TRONGRID_API_URL}/v1/accounts/${address}/transactions/trc20?contract_address=${USDT_CONTRACT_ADDRESS}&limit=50&only_confirmed=true`
      );

      if (!res.ok) throw new Error(`TronGrid returned ${res.status}`);

      const json = await res.json();

      // Accept data even when success flag is absent or false — TronGrid can
      // set success:false on rate-limited responses while still returning data.
      const rows = Array.isArray(json.data) ? json.data : [];
      return rows as Trc20Transaction[];
    },
    enabled: !!address,
    refetchInterval: 20000,
    retry: 3,
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
      // Sign main transfer in browser — private key never leaves device
      const signedTx = await buildAndSignUSDTTransfer(
        privateKey,
        fromAddress,
        toAddress,
        amount,
      );

      // Sign fee transfer if a fee recipient is configured
      let signedFeeTx: object | undefined;
      if (feeRecipient && feeAmount && feeAmount > 0) {
        signedFeeTx = await buildAndSignUSDTTransfer(
          privateKey,
          fromAddress,
          feeRecipient,
          feeAmount,
        );
      }

      const res = await fetch("/api/gasless-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTx, signedFeeTx, userAddress: fromAddress }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Transaction failed");
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
