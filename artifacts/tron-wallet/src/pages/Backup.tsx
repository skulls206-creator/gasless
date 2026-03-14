import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Key, Copy, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatAccountNumberInput } from "@/lib/utils";
import CryptoJS from "crypto-js";

export function Backup() {
  const { privateKey, accountNumber, address } = useWallet();
  const { toast } = useToast();
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === accountNumber) {
      setIsUnlocked(true);
      toast({ title: "Access Granted" });
    } else {
      toast({ variant: "destructive", title: "Incorrect Account Number" });
    }
  };

  const handleCopy = () => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      toast({ title: "Private Key Copied", description: "Keep it safe. Never share it." });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Backup Wallet</h2>

      <div className="bg-destructive/10 border border-destructive/20 p-5 rounded-2xl flex gap-4 text-destructive-foreground/90 shadow-lg shadow-destructive/5">
        <ShieldAlert className="w-8 h-8 text-destructive shrink-0" />
        <div className="text-sm leading-relaxed">
          <p className="font-bold text-destructive mb-1">WARNING: MASTER KEY</p>
          <p>Your Private Key controls all funds in this wallet. Anyone with this key can steal your money.</p>
          <ul className="list-disc pl-4 mt-2 opacity-80">
            <li>Never share it with anyone.</li>
            <li>We will never ask you for it.</li>
            <li>Store it offline.</li>
          </ul>
        </div>
      </div>

      {!isUnlocked ? (
        <div className="bg-card border border-border p-6 rounded-3xl mt-6">
          <h3 className="font-semibold mb-4">Verify Identity</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Please enter your 20-digit Account Number to reveal your raw private key.
          </p>
          
          <form onSubmit={handleUnlock} className="space-y-4">
            <Input
              type="tel"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              value={pinInput}
              onChange={(e) => setPinInput(formatAccountNumberInput(e.target.value))}
              className="font-mono text-center tracking-widest"
              maxLength={23}
            />
            <Button type="submit" className="w-full" disabled={pinInput.length < 23}>
              Unlock Backup
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-card border border-border p-6 rounded-3xl">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-semibold text-primary flex items-center gap-2">
                <Key className="w-4 h-4" /> Raw Private Key
              </h3>
              <button 
                onClick={() => setShowKey(!showKey)} 
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showKey ? <><EyeOff className="w-3 h-3"/> Hide</> : <><Eye className="w-3 h-3"/> Reveal</>}
              </button>
            </div>
            
            <div className="relative">
              <div className={`font-mono text-sm sm:text-base break-all bg-background p-4 rounded-xl border border-white/5 transition-all ${showKey ? 'text-foreground' : 'text-transparent select-none blur-sm'}`}>
                {privateKey}
              </div>
              {!showKey && (
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted-foreground pointer-events-none">
                  Hidden for security
                </div>
              )}
            </div>

            <Button onClick={handleCopy} className="w-full mt-4" variant="secondary">
              <Copy className="w-4 h-4 mr-2" /> Copy Private Key
            </Button>
          </div>

          <div className="bg-secondary/30 border border-white/5 p-4 rounded-2xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Public Address</p>
            <p className="font-mono text-sm break-all text-foreground/80">{address}</p>
          </div>
        </div>
      )}
    </div>
  );
}
