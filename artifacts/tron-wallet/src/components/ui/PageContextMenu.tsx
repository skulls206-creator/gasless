import { useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  RefreshCw,
  RotateCcw,
  Copy,
  ExternalLink,
  ArrowUpRight,
  ArrowDownToLine,
  QrCode,
  Wallet,
  Repeat,
} from "lucide-react";

function hardReload() {
  // Force a fresh load from the server, bypassing service-worker cache
  if ("caches" in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }
  window.location.reload();
}

interface PageContextMenuProps {
  children: React.ReactNode;
}

export function PageContextMenu({ children }: PageContextMenuProps) {
  const [location] = useLocation();
  const { address } = useWallet();

  const path = location.split("?")[0];
  const isLoggedInPage = path.startsWith("/dashboard") || path.startsWith("/send") || path.startsWith("/receive") || path.startsWith("/swap") || path.startsWith("/pay") || path.startsWith("/history") || path.startsWith("/backup") || path.startsWith("/setup-pin");

  const pageLabel =
    path === "/dashboard" ? "Dashboard" :
    path === "/send" ? "Send" :
    path === "/receive" ? "Receive" :
    path === "/swap" ? "Swap" :
    path === "/pay" ? "Buy" :
    path === "/history" ? "History" :
    path === "/backup" ? "Backup" :
    "Page";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* ── Page-specific items ── */}
        {path === "/dashboard" && address && (
          <>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Wallet Address
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.open(`https://tronscan.org/#/address/${address}`, "_blank", "noreferrer")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View on Tronscan
            </ContextMenuItem>
          </>
        )}

        {path === "/send" && address && (
          <>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy My Address
            </ContextMenuItem>
            <ContextMenuItem
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  const input = document.querySelector<HTMLInputElement>("input[placeholder*='T']");
                  if (input) { input.value = text; input.dispatchEvent(new Event("input", { bubbles: true })); }
                } catch {}
              }}
            >
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Paste Recipient
            </ContextMenuItem>
          </>
        )}

        {path === "/receive" && address && (
          <>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Address
            </ContextMenuItem>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(`https://gasless.khurk.xyz/pay/${address}`)}>
              <QrCode className="w-4 h-4 mr-2" />
              Copy Payment Link
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.open(`https://tronscan.org/#/address/${address}`, "_blank", "noreferrer")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View on Tronscan
            </ContextMenuItem>
          </>
        )}

        {path === "/pay" && address && (
          <>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
              <Wallet className="w-4 h-4 mr-2" />
              Copy Wallet Address
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => window.open(`https://global.transak.com/?defaultCryptoCurrency=USDT&networks=tron&walletAddress=${address}&productsAvailed=BUY`, "_blank", "noreferrer")}>
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Open Transak
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.open(`https://buy.moonpay.com/?defaultCurrencyCode=usdt_tron&walletAddress=${address}`, "_blank", "noreferrer")}>
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Open MoonPay
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.open(`https://p2p.binance.com/en/trade/buy/USDT?fiat=USD&payment=ALL`, "_blank", "noreferrer")}>
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Open Binance P2P
            </ContextMenuItem>
          </>
        )}

        {path === "/swap" && address && (
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Wallet Address
          </ContextMenuItem>
        )}

        {path === "/backup" && address && (
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(address)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Wallet Address
          </ContextMenuItem>
        )}

        {/* ── Separator before global items ── */}
        {(path === "/dashboard" || path === "/receive" || path === "/pay" || path === "/swap" || path === "/backup" || path === "/send") && <ContextMenuSeparator />}

        {/* ── Global navigation shortcuts ── */}
        {isLoggedInPage && (
          <>
            <ContextMenuItem onClick={() => window.location.href = "/dashboard"}>
              <Wallet className="w-4 h-4 mr-2" />
              Go to Dashboard
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.location.href = "/swap"}>
              <Repeat className="w-4 h-4 mr-2" />
              Go to Swap
            </ContextMenuItem>
            <ContextMenuItem onClick={() => window.location.href = "/history"}>
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              Go to History
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />

        {/* ── Refresh actions ── */}
        <ContextMenuItem onClick={() => window.location.reload()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh {pageLabel}
        </ContextMenuItem>
        <ContextMenuItem onClick={hardReload}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Hard Refresh (clear cache)
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
