import { X, Battery, Zap, Info } from "lucide-react";
import { Button } from "./button";

interface GaslessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GaslessModal({ isOpen, onClose }: GaslessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-card border border-border shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3 text-primary">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Info className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-foreground">How TRON Fees Work</h2>
            </div>
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-2 -mr-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5 text-sm text-muted-foreground">
            <p>
              TRON doesn't use "gas" like Ethereum. Instead, it uses two resources: <strong className="text-foreground">Bandwidth</strong> and <strong className="text-foreground">Energy</strong>.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2 text-foreground font-semibold mb-2">
                  <Battery className="w-4 h-4 text-blue-400" /> Bandwidth
                </div>
                <p className="text-xs">You get ~1500 free daily. Sending USDT costs ~300 bandwidth.</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2 text-foreground font-semibold mb-2">
                  <Zap className="w-4 h-4 text-yellow-400" /> Energy
                </div>
                <p className="text-xs">Needed for smart contracts (like USDT). Costs ~13,000 per transfer.</p>
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-primary-foreground/90">
              <h4 className="font-semibold text-primary mb-1">What this means for you:</h4>
              <p>
                If your wallet has enough free bandwidth and energy, transfers are completely free. If not, a tiny TRX fee applies — usually $0.05 to $0.15.
              </p>
            </div>
            
            <p className="text-xs">
              <strong>New wallets:</strong> Your very first USDT send will likely cost a small amount of TRX since you have no energy staked yet. This is normal.
            </p>
          </div>

          <div className="mt-8 flex gap-3">
            <Button className="w-full" onClick={onClose}>Understood</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
