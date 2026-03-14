import { useWallet } from "@/context/WalletContext";
import { useUSDTTransactions } from "@/hooks/use-tron";
import { ArrowUpRight, ArrowDownLeft, ExternalLink } from "lucide-react";
import { formatAddress } from "@/lib/utils";

export function History() {
  const { address } = useWallet();
  const { data: transactions, isLoading } = useUSDTTransactions(address);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-display font-bold mb-6">History</h2>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-card border border-white/5 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Transaction History</h2>
      
      {!transactions || transactions.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
          No USDT transactions found for this wallet.
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const isReceive = tx.to === address;
            const amount = parseFloat(tx.value) / 1_000_000;
            const date = new Date(tx.block_timestamp).toLocaleDateString(undefined, { 
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return (
              <a 
                key={tx.transaction_id}
                href={`https://tronscan.org/#/transaction/${tx.transaction_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between bg-card border border-border hover:border-primary/30 hover:bg-card/80 p-4 rounded-2xl transition-all duration-200 group"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isReceive ? 'bg-success/10' : 'bg-secondary'}`}>
                    {isReceive ? (
                      <ArrowDownLeft className="w-5 h-5 text-success" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {isReceive ? "Received USDT" : "Sent USDT"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {date} • {isReceive ? `From ${formatAddress(tx.from)}` : `To ${formatAddress(tx.to)}`}
                    </p>
                  </div>
                </div>
                
                <div className="text-right flex items-center gap-3">
                  <span className={`font-bold font-mono ${isReceive ? 'text-success' : 'text-foreground'}`}>
                    {isReceive ? '+' : '-'}{amount.toFixed(2)}
                  </span>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
