import { useWallet } from "@/context/WalletContext";
import { useUSDTTransactions } from "@/hooks/use-tron";
import { ArrowUpRight, ArrowDownLeft, ExternalLink, RefreshCw, AlertCircle, Copy } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";

export function History() {
  const { address } = useWallet();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useUSDTTransactions(address);

  // Flatten all pages into a single transaction list
  const transactions = data?.pages.flatMap((p) => p.data) ?? [];
  const isEmpty = transactions.length === 0;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Transaction History</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 p-1"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p>Failed to load transactions: {(error as Error)?.message ?? "Unknown error"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-card border border-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !isError && isEmpty && (
        <div className="bg-card border border-border rounded-3xl p-12 text-center space-y-3">
          <p className="text-muted-foreground">No USDT transactions found for this wallet.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Check Again
          </Button>
        </div>
      )}

      {!isLoading && !isError && !isEmpty && (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const isReceive = tx.to?.toLowerCase() === address?.toLowerCase();
            const amount = parseFloat(tx.value) / Math.pow(10, tx.token_info?.decimals ?? 6);
            const date = new Date(tx.block_timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const tronscanUrl = `https://tronscan.org/#/transaction/${tx.transaction_id}`;

            return (
              <ContextMenu key={tx.transaction_id}>
                <ContextMenuTrigger asChild>
                  <a
                    href={tronscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between bg-card border border-border hover:border-primary/30 hover:bg-card/80 p-4 rounded-2xl transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isReceive ? "bg-success/10" : "bg-secondary"}`}>
                        {isReceive ? (
                          <ArrowDownLeft className="w-5 h-5 text-success" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">
                          {isReceive ? "Received USDT" : "Sent USDT"}
                        </p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                        <p className="text-xs text-muted-foreground">
                          {isReceive ? `From ${formatAddress(tx.from)}` : `To ${formatAddress(tx.to)}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className={`font-bold font-mono text-sm ${isReceive ? "text-success" : "text-foreground"}`}>
                          {isReceive ? "+" : "-"}{amount.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">USDT</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </a>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={(e) => { e.preventDefault(); copy(tx.transaction_id, "Transaction hash"); }}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Copy TX hash
                  </ContextMenuItem>
                  <ContextMenuItem onClick={(e) => { e.preventDefault(); copy(isReceive ? tx.from : tx.to, "Address"); }}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Copy {isReceive ? "sender" : "recipient"} address
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={(e) => { e.preventDefault(); window.open(tronscanUrl, "_blank", "noreferrer"); }}>
                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                    View on Tronscan
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {/* Load more */}
          {hasNextPage && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading…</>
              ) : (
                "Load More"
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
