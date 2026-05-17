import { useState } from "react";
import { Link } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { useUSDTBalance, useTronResources, useSponsorInfo, deriveSponsorHealth, type SponsorHealth } from "@/hooks/use-tron";
import { formatAddress, formatCurrency } from "@/lib/utils";
import { Copy, ArrowUpRight, ArrowDownToLine, Zap, Battery, AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { GaslessModal } from "@/components/ui/GaslessModal";

export function Dashboard() {
  const { address, hasPin } = useWallet();
  const { toast } = useToast();

  const { data: balance, isLoading: isLoadingBalance } = useUSDTBalance(address);
  const { data: resources, isLoading: isLoadingResources } = useTronResources(address);
  const { data: sponsor } = useSponsorInfo();
  const sponsorHealth = deriveSponsorHealth(sponsor);

  const [showEduModal, setShowEduModal] = useState(false);
  const [pinPromptDismissed, setPinPromptDismissed] = useState(
    () => localStorage.getItem("tron_wallet_pin_prompt_dismissed") === "1",
  );

  const dismissPinPrompt = () => {
    localStorage.setItem("tron_wallet_pin_prompt_dismissed", "1");
    setPinPromptDismissed(true);
  };
  const showPinPrompt = !hasPin && !pinPromptDismissed;

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "TRON address copied to clipboard." });
    }
  };

  const showResourceWarning = resources && !resources.isSufficientForTRC20;

  return (
    <div className="space-y-6">
      {showPinPrompt && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Set up a 6-digit PIN</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quick-unlock without typing your full 20-digit account number.
            </p>
            <div className="flex gap-2 mt-3">
              <Link href="/setup-pin">
                <Button size="sm" className="h-8 text-xs">Set up PIN</Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={dismissPinPrompt}
              >
                Not now
              </Button>
            </div>
          </div>
          <button onClick={dismissPinPrompt} className="text-muted-foreground/60 hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Bar: Address */}
      <div className="flex justify-between items-center bg-secondary/50 rounded-full py-2 px-4 border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="font-mono text-sm text-foreground/90">{formatAddress(address || "")}</span>
        </div>
        <div className="flex items-center gap-2">
          <GaslessPill health={sponsorHealth} />
          <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {sponsorHealth === "unavailable" && (
        <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-destructive leading-relaxed">
            <p className="font-semibold mb-0.5">Gasless sending temporarily unavailable</p>
            <p className="text-destructive/80">
              The sponsor wallet can't cover network fees right now — we're
              auto-checking every minute. Try again in a few minutes.
            </p>
          </div>
        </div>
      )}

      {/* Main Balance Card */}
      <div className="glass-panel rounded-3xl p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-success/20 blur-[50px] -mr-10 -mt-10 pointer-events-none" />
        
        <p className="text-muted-foreground font-medium mb-2">Total USDT Balance</p>
        
        {isLoadingBalance ? (
          <div className="h-16 w-48 bg-white/5 animate-pulse rounded-xl mx-auto" />
        ) : (
          <h2 className="text-5xl font-display font-bold text-foreground tracking-tight">
            <span className="text-success mr-2">$</span>
            {formatCurrency(balance || 0)}
          </h2>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mt-8">
          <Link href="/send" className="block">
            <Button className="w-full h-14 bg-white/10 hover:bg-white/20 text-foreground border border-white/10 shadow-none">
              <ArrowUpRight className="mr-2 w-5 h-5 text-primary" /> Send
            </Button>
          </Link>
          <Link href="/receive" className="block">
            <Button className="w-full h-14 bg-success/10 hover:bg-success/20 text-success border border-success/20 shadow-none">
              <ArrowDownToLine className="mr-2 w-5 h-5" /> Receive
            </Button>
          </Link>
        </div>
      </div>

      {/* Resources Card */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-lg">Network Resources</h3>
          <button onClick={() => setShowEduModal(true)} className="text-xs text-primary hover:underline font-medium">
            How fees work
          </button>
        </div>

        {isLoadingResources ? (
          <div className="space-y-4">
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bandwidth */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Battery className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Bandwidth</p>
                  <p className="text-xs text-muted-foreground">Needed: ~300</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold">{resources?.availableBandwidth.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Available</p>
              </div>
            </div>

            {/* Energy */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Energy</p>
                  <p className="text-xs text-muted-foreground">Needed: ~13,000</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold">{resources?.availableEnergy.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Available</p>
              </div>
            </div>

            {/* Warning if insufficient */}
            {showResourceWarning && (
              <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary-foreground/90 leading-relaxed">
                  Low network resources — if Gasless can't sponsor your send, the network will charge ~1–3 TRX (~$0.10–$0.30) from your wallet. Top up TRX or the sponsor covers it automatically.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <GaslessModal isOpen={showEduModal} onClose={() => setShowEduModal(false)} />
    </div>
  );
}

function GaslessPill({ health }: { health: SponsorHealth }) {
  if (health === "off") return null;

  const styles: Record<Exclude<SponsorHealth, "off">, { dot: string; text: string; label: string }> = {
    active:      { dot: "bg-success",     text: "text-success",     label: "Gasless: active" },
    degraded:    { dot: "bg-yellow-400 animate-pulse", text: "text-yellow-400", label: "Gasless: degraded" },
    unavailable: { dot: "bg-destructive animate-pulse", text: "text-destructive", label: "Gasless: unavailable" },
  };
  const s = styles[health];

  return (
    <div
      className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-background/40 border border-white/5 ${s.text}`}
      title={s.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </div>
  );
}
