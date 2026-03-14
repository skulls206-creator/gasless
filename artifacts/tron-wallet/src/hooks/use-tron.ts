import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTronWeb, getUSDTBalance, USDT_CONTRACT_ADDRESS, TRONGRID_API_URL } from "@/lib/tron";

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
        `${TRONGRID_API_URL}/v1/accounts/${address}/transactions/trc20?contract_address=${USDT_CONTRACT_ADDRESS}&limit=20`
      );
      const json = await res.json();
      
      if (!json.success) return [];
      
      return json.data as Trc20Transaction[];
    },
    enabled: !!address,
    refetchInterval: 30000,
  });
}

export function useSendUSDT() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      privateKey,
      toAddress,
      amount,
    }: {
      privateKey: string;
      toAddress: string;
      amount: number;
    }) => {
      const tronWeb = getTronWeb(privateKey);
      
      // Amount in sun (6 decimals for USDT)
      const amountInSun = tronWeb.toBigNumber(amount).multipliedBy(1_000_000).toString();
      
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      const transaction = await contract.transfer(toAddress, amountInSun).send();
      
      if (!transaction) {
        throw new Error("Transaction failed or rejected.");
      }
      
      return transaction; // Usually returns the tx hash
    },
    onSuccess: (_, variables) => {
      const address = getTronWeb(variables.privateKey).defaultAddress.base58;
      // Invalidate queries to refresh balance and history
      queryClient.invalidateQueries({ queryKey: ["usdt-balance", address] });
      queryClient.invalidateQueries({ queryKey: ["tron-resources", address] });
      queryClient.invalidateQueries({ queryKey: ["usdt-transactions", address] });
    },
  });
}
