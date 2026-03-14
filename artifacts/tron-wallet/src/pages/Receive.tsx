import { useWallet } from "@/context/WalletContext";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function Receive() {
  const { address } = useWallet();
  const { toast } = useToast();

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "Share this to receive USDT." });
    }
  };

  return (
    <div className="space-y-6 flex flex-col items-center">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-display font-bold">Receive USDT</h2>
        <p className="text-muted-foreground mt-2">TRON Network (TRC-20)</p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-white/10 dark:border-white/5">
        <QRCodeSVG 
          value={address || ""} 
          size={220} 
          level="H"
          includeMargin={true}
          fgColor="#000000"
          bgColor="#ffffff"
        />
      </div>

      <div className="w-full max-w-sm bg-card border border-border p-5 rounded-2xl shadow-lg mt-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your TRON Address</p>
        <p className="font-mono text-sm sm:text-base break-all text-foreground bg-background py-3 px-4 rounded-xl border border-white/5 mb-4">
          {address}
        </p>
        
        <Button onClick={handleCopy} className="w-full" variant="secondary">
          <Copy className="w-4 h-4 mr-2" /> Copy Address
        </Button>
      </div>

      <div className="w-full max-w-sm flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive-foreground/90">
        <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
        <p className="text-xs leading-relaxed">
          <strong>Important:</strong> Send ONLY USDT on the TRON (TRC-20) network to this address. Sending other tokens may result in permanent loss.
        </p>
      </div>
    </div>
  );
}
