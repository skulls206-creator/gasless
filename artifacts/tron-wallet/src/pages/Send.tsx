import { useState, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { useUSDTBalance, useTronResources, useSendUSDT } from "@/hooks/use-tron";
import { validateAddress } from "@/lib/tron";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Info, ArrowUpRight, CheckCircle2, AlertTriangle, Zap, ExternalLink } from "lucide-react";
import { GaslessModal } from "@/components/ui/GaslessModal";
import { useQuery } from "@tanstack/react-query";

function useSponsorStatus() {
  return useQuery({
    queryKey: ["sponsor-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/status");
      if (!res.ok) return { configured: false };
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function Send() {
  const { address, privateKey } = useWallet();
  const { toast } = useToast();

  const { data: balance } = useUSDTBalance(address);
  const { data: resources } = useTronResources(address);
  const { data: sponsor } = useSponsorStatus();
  const sendMutation = useSendUSDT();

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
  const [showEduModal, setShowEduModal] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [wasSponsored, setWasSponsored] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem("tron_gasless_explained");
    if (!hasSeen) {
      setShowEduModal(true);
      localStorage.setItem("tron_gasless_explained", "true");
    }
  }, []);

  useEffect(() => {
    if (toAddress.length >= 34) {
      validateAddress(toAddress).then(setIsValidAddress);
    } else {
      setIsValidAddress(null);
    }
  }, [toAddress]);

  const handleMax = () => {
    if (balance) setAmount(balance.toString());
  };

  const handleSend = () => {
    if (!privateKey || !address) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0 || numAmount > (balance || 0)) {
      toast({ variant: "destructive", title: "Invalid amount" });
      return;
    }

    if (!isValidAddress) {
      toast({ variant: "destructive", title: "Invalid destination address" });
      return;
    }

    sendMutation.mutate(
      { privateKey, fromAddress: address, toAddress, amount: numAmount },
      {
        onSuccess: (result) => {
          setTxHash(result.txid);
          setWasSponsored(result.sponsored);
          toast({ title: "Transaction Sent!" });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Transaction Failed",
            description: err.message || "Check your balance and try again.",
          });
        },
      },
    );
  };

  if (txHash) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
        <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h2 className="text-3xl font-display font-bold">Transfer Sent</h2>
        <p className="text-muted-foreground">Your USDT is on the way.</p>

        {wasSponsored && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-medium px-4 py-2 rounded-full">
            <Zap className="w-4 h-4" />
            Fee sponsored by gasless.one — no TRX charged
          </div>
        )}

        <div className="bg-secondary p-4 rounded-xl border border-white/5 break-all w-full text-xs font-mono text-muted-foreground mt-6">
          {txHash}
        </div>

        <div className="flex gap-4 w-full mt-8">
          <a
            href={`https://tronscan.org/#/transaction/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1"
          >
            <Button variant="outline" className="w-full">
              View on Tronscan <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </a>
          <Button
            className="flex-1"
            onClick={() => {
              setTxHash(null);
              setToAddress("");
              setAmount("");
              setWasSponsored(false);
            }}
          >
            Send Another
          </Button>
        </div>
      </div>
    );
  }

  const userHasEnergy = resources?.isSufficientForTRC20;
  const sponsorActive = sponsor?.configured && (sponsor?.availableEnergy ?? 0) > 0;
  const isFree = userHasEnergy || sponsorActive;
  const isFormValid =
    isValidAddress && amount && parseFloat(amount) > 0 && parseFloat(amount) <= (balance || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-display font-bold">Send USDT</h2>
        <div className="text-sm bg-secondary px-3 py-1 rounded-full text-success font-medium border border-success/20">
          Available: ${balance?.toFixed(2) || "0.00"}
        </div>
      </div>

      <div className="space-y-6 bg-card border border-border p-6 rounded-3xl shadow-xl">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground ml-1">
            Recipient Address (TRON)
          </label>
          <Input
            placeholder="T..."
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className={`font-mono text-sm ${isValidAddress === false ? "border-destructive focus-visible:ring-destructive/20" : ""}`}
          />
          {isValidAddress === false && (
            <p className="text-xs text-destructive mt-1 ml-1">Invalid TRON address format</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-end ml-1">
            <label className="text-sm font-medium text-foreground">Amount (USDT)</label>
            <button onClick={handleMax} className="text-xs text-primary font-medium hover:underline">
              MAX
            </button>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              $
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-8 text-lg font-semibold"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="mt-8 bg-secondary/50 rounded-2xl p-4 border border-white/5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              Network Fee
              <button onClick={() => setShowEduModal(true)} className="hover:text-primary">
                <Info className="w-4 h-4" />
              </button>
            </span>
            {isFree ? (
              <span className="text-sm font-bold text-success flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Free
              </span>
            ) : (
              <span className="text-sm font-bold text-primary flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> ~1–3 TRX
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed">
            {sponsorActive && !userHasEnergy ? (
              <span className="flex items-center gap-1 text-primary/80">
                <Zap className="w-3 h-3 flex-shrink-0" />
                gasless.one will sponsor this send. No TRX needed in your wallet.
              </span>
            ) : userHasEnergy ? (
              "You have enough Bandwidth and Energy to cover this transfer for free."
            ) : (
              "Your free resources are insufficient. You will need a small amount of TRX, or the sponsor wallet can cover it."
            )}
          </div>

          {sponsorActive && (
            <div className="text-xs text-muted-foreground/60 flex items-center gap-1 pt-1 border-t border-white/5">
              <Zap className="w-3 h-3" />
              Sponsor has ~{sponsor?.estimatedSendsRemaining ?? 0} sponsored send
              {sponsor?.estimatedSendsRemaining !== 1 ? "s" : ""} remaining
            </div>
          )}
        </div>

        <Button
          className="w-full h-14 text-lg mt-4"
          disabled={!isFormValid || sendMutation.isPending}
          onClick={handleSend}
        >
          {sendMutation.isPending ? (
            sponsorActive ? "Sponsoring & Sending…" : "Broadcasting…"
          ) : (
            <>
              Send USDT <ArrowUpRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </div>

      <GaslessModal isOpen={showEduModal} onClose={() => setShowEduModal(false)} />
    </div>
  );
}
