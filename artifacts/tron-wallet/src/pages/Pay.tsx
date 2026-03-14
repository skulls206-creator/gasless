import { useWallet } from "@/context/WalletContext";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function Pay() {
  const { address } = useWallet();
  const { toast } = useToast();

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied" });
    }
  };

  // Peer.xyz URL composition - assuming standard iframe integration
  // The actual URL parameters depend on peer.xyz docs, but this represents the requested pre-configuration
  const widgetUrl = `https://widget.peer.xyz/?network=TRON&token=USDT&to=${address}`;

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-140px)]">
      <div>
        <h2 className="text-2xl font-display font-bold">Fund Wallet via Peer.xyz</h2>
        <p className="text-muted-foreground text-sm mt-1">Buy USDT directly into your TRON wallet.</p>
      </div>

      <div className="flex justify-between items-center bg-secondary/50 p-3 rounded-xl border border-white/5">
        <div className="truncate font-mono text-sm text-foreground/80 mr-4">
          Dest: {address}
        </div>
        <Button size="sm" variant="ghost" onClick={handleCopy} className="shrink-0 h-8">
          <Copy className="w-4 h-4 mr-2" /> Copy
        </Button>
      </div>

      <div className="flex-1 bg-card border border-border rounded-3xl overflow-hidden shadow-2xl relative">
        {/* Loading placeholder underneath iframe */}
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm -z-10 animate-pulse">
          Loading Peer.xyz Widget...
        </div>
        <iframe 
          src={widgetUrl}
          className="w-full h-full border-0 bg-transparent"
          allow="camera; microphone; payment"
        />
      </div>
    </div>
  );
}
