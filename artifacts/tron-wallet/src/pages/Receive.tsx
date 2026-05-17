import { useWallet } from "@/context/WalletContext";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, AlertTriangle, ExternalLink, Share2, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

function getPaymentLink(address: string): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${window.location.origin}${base}/pay/${address}`;
}

export function Receive() {
  const { address } = useWallet();
  const { toast } = useToast();

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "Share this to receive USDT." });
    }
  };

  const handleCopyLink = () => {
    if (!address) return;
    const link = getPaymentLink(address);
    navigator.clipboard.writeText(link);
    toast({ title: "Payment Link Copied", description: "Anyone can open this to send you USDT." });
  };

  const handleShare = async () => {
    if (!address) return;
    const link = getPaymentLink(address);
    if (navigator.share) {
      await navigator.share({
        title: "Send me USDT via Gasless",
        text: "Use this link to send me USDT (TRC-20) — no gas fees needed.",
        url: link,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="space-y-6 flex flex-col items-center">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-display font-bold">Receive USDT</h2>
        <p className="text-muted-foreground mt-2">TRON Network (TRC-20)</p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-white/10 dark:border-white/5">
        {address ? (
          <QRCodeCanvas
            value={getPaymentLink(address)}
            size={220}
            level="H"
            marginSize={2}
            fgColor="#000000"
            bgColor="#ffffff"
          />
        ) : (
          <div className="w-[220px] h-[220px] flex items-center justify-center bg-gray-100 rounded-xl">
            <span className="text-gray-400 text-sm">Loading…</span>
          </div>
        )}
      </div>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="w-full max-w-sm bg-card border border-border p-5 rounded-2xl shadow-lg mt-4 text-center cursor-context-menu">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your TRON Address</p>
            <p className="font-mono text-sm sm:text-base break-all text-foreground bg-background py-3 px-4 rounded-xl border border-white/5 mb-4">
              {address}
            </p>
            <Button onClick={handleCopy} className="w-full" variant="secondary">
              <Copy className="w-4 h-4 mr-2" /> Copy Address
            </Button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy address
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => address && window.open(`https://tronscan.org/#/address/${address}`, "_blank", "noreferrer")}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            View on Tronscan
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* TRON network warning — right under the address so users see it before sending */}
      <div className="w-full max-w-sm flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground/90">
        <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
        <p className="text-xs leading-relaxed">
          <strong>Important:</strong> Send ONLY USDT on the TRON (TRC-20) network to this address. Sending other tokens may result in permanent loss.
        </p>
      </div>

      {/* Payment link card */}
      {address && (
        <div className="w-full max-w-sm bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Link className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-semibold text-foreground">Shareable Payment Link</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Share this link so anyone can send you USDT directly — no account needed on their end.
          </p>
          <p className="font-mono text-[11px] text-primary/80 bg-primary/5 rounded-lg px-3 py-2 break-all border border-primary/10">
            {getPaymentLink(address)}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 border-primary/20 text-primary hover:bg-primary/10" onClick={handleCopyLink}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Link
            </Button>
            <Button variant="outline" size="sm" className="flex-1 border-primary/20 text-primary hover:bg-primary/10" onClick={handleShare}>
              <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
            </Button>
          </div>
        </div>
      )}


    </div>
  );
}
