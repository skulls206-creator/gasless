import { useState, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { useUSDTBalance, useTronResources, useSendUSDT, useAppConfig } from "@/hooks/use-tron";
import { validateAddress } from "@/lib/tron";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Info,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ExternalLink,
  Receipt,
  Camera,
} from "lucide-react";
import { GaslessModal } from "@/components/ui/GaslessModal";
import { QRScanner } from "@/components/ui/QRScanner";
import { useQuery } from "@tanstack/react-query";

function useSponsorStatus() {
  return useQuery({
    queryKey: ["sponsor-status"],
    queryFn: async () => {
      const res = await fetch("/api/sponsor-info");
      if (!res.ok) return { configured: false };
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
}

const PENDING_LABELS = [
  "Preparing transaction…",
  "Sponsoring energy…",
  "Broadcasting…",
];

export function Send() {
  const { address, privateKey } = useWallet();
  const { toast } = useToast();

  const { data: balance } = useUSDTBalance(address);
  const { data: resources } = useTronResources(address);
  const { data: sponsor } = useSponsorStatus();
  const { data: config } = useAppConfig();
  const sendMutation = useSendUSDT();

  const feeAmount = config?.feeAmount ?? 1;
  const feeRecipient = config?.feeRecipient ?? null;
  const feesEnabled = config?.feesEnabled ?? false;

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [isValidAddress, setIsValidAddress] = useState<boolean | null>(null);
  const [showEduModal, setShowEduModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [wasSponsored, setWasSponsored] = useState(false);
  const [pendingStep, setPendingStep] = useState(0);

  // Pre-fill address from payment link query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const to = params.get("to");
    if (to) setToAddress(to);
  }, []);

  // First-visit education modal
  useEffect(() => {
    if (!localStorage.getItem("tron_gasless_explained")) {
      setShowEduModal(true);
      localStorage.setItem("tron_gasless_explained", "true");
    }
  }, []);

  // Cycling progress steps during send
  useEffect(() => {
    if (!sendMutation.isPending) {
      setPendingStep(0);
      return;
    }
    const t1 = setTimeout(() => setPendingStep(1), 1_500);
    const t2 = setTimeout(() => setPendingStep(2), 7_500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [sendMutation.isPending]);

  const isEthAddress = toAddress.startsWith("0x") && toAddress.length >= 10;
  const mightBeTron = toAddress.startsWith("T");

  useEffect(() => {
    if (isEthAddress) { setIsValidAddress(false); return; }
    if (toAddress.length >= 34) validateAddress(toAddress).then(setIsValidAddress);
    else setIsValidAddress(null);
  }, [toAddress, isEthAddress]);

  const handleMax = () => {
    if (!balance) return;
    const max = feesEnabled ? Math.max(0, balance - feeAmount) : balance;
    setAmount(max > 0 ? String(max) : "0");
  };

  const handleSend = () => {
    if (!privateKey || !address) return;
    const numAmount = parseFloat(amount);
    const totalRequired = feesEnabled ? numAmount + feeAmount : numAmount;

    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ variant: "destructive", title: "Invalid amount" });
      return;
    }
    if (totalRequired > (balance || 0)) {
      toast({
        variant: "destructive",
        title: "Insufficient balance",
        description: feesEnabled
          ? `You need ${numAmount} + ${feeAmount} USDT service fee = ${totalRequired} USDT total.`
          : "Not enough USDT.",
      });
      return;
    }
    if (!isValidAddress) {
      toast({ variant: "destructive", title: "Invalid destination address" });
      return;
    }

    sendMutation.mutate(
      {
        privateKey,
        fromAddress: address,
        toAddress,
        amount: numAmount,
        feeRecipient: feesEnabled ? feeRecipient : null,
        feeAmount: feesEnabled ? feeAmount : 0,
      },
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
            Network fee sponsored by Gasless — no TRX needed
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
            onClick={() => { setTxHash(null); setToAddress(""); setAmount(""); setWasSponsored(false); }}
          >
            Send Another
          </Button>
        </div>
      </div>
    );
  }

  const numAmount = parseFloat(amount) || 0;
  const totalRequired = feesEnabled ? numAmount + feeAmount : numAmount;
  const userHasEnergy = resources?.isSufficientForTRC20;
  const sponsorActive = sponsor?.configured && sponsor?.active;
  const networkFeeIsFree = userHasEnergy || sponsorActive;
  const hasEnoughBalance = totalRequired > 0 && totalRequired <= (balance || 0);
  const isFormValid = isValidAddress && numAmount > 0 && hasEnoughBalance;

  return (
    <>
      {showQR && (
        <QRScanner
          onScan={(val) => {
            setToAddress(val);
            setShowQR(false);
          }}
          onClose={() => setShowQR(false)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-display font-bold">Send USDT</h2>
          <div className="text-sm bg-secondary px-3 py-1 rounded-full text-success font-medium border border-success/20">
            Available: ${balance?.toFixed(2) || "0.00"}
          </div>
        </div>

        <div className="space-y-6 bg-card border border-border p-6 rounded-3xl shadow-xl">
          {/* Address field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground ml-1">
              Recipient Address (TRON)
            </label>
            <div className="relative">
              <Input
                placeholder="T…"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                className={`font-mono text-sm pr-20 ${
                  isValidAddress === false
                    ? "border-destructive focus-visible:ring-destructive/20"
                    : isValidAddress === true
                    ? "border-success focus-visible:ring-success/20"
                    : ""
                }`}
              />
              {/* QR scan button */}
              <button
                type="button"
                onClick={() => setShowQR(true)}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1"
                title="Scan QR code"
              >
                <Camera className="w-4 h-4" />
              </button>
              {isValidAddress === true && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success pointer-events-none" />
              )}
              {isValidAddress === false && toAddress.length > 0 && (
                <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive pointer-events-none" />
              )}
            </div>
            {isValidAddress === false && toAddress.length > 0 && (
              <p className="text-xs text-destructive mt-1 ml-1">
                {isEthAddress
                  ? "This looks like an Ethereum address. TRON addresses start with T"
                  : !mightBeTron && toAddress.length > 2
                  ? "TRON addresses always start with T"
                  : "Invalid TRON address"}
              </p>
            )}
          </div>

          {/* Amount field */}
          <div className="space-y-2">
            <div className="flex justify-between items-end ml-1">
              <label className="text-sm font-medium text-foreground">Amount (USDT)</label>
              <button onClick={handleMax} className="text-xs text-primary font-medium hover:underline">
                MAX
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
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

          {/* Cost breakdown */}
          <div className="mt-8 bg-secondary/50 rounded-2xl p-4 border border-white/5 space-y-3">
            {feesEnabled && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Service fee
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="hover:text-foreground transition-colors" type="button">
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-center text-xs leading-relaxed">
                        This $1 covers network energy for other users — it keeps Gasless free for everyone.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-sm font-semibold text-foreground">{feeAmount.toFixed(2)} USDT</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                Network fee
                <button onClick={() => setShowEduModal(true)} className="hover:text-primary">
                  <Info className="w-4 h-4" />
                </button>
              </span>
              {networkFeeIsFree ? (
                <span className="text-sm font-bold text-success flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Free
                </span>
              ) : (
                <span className="text-sm font-bold text-primary flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> ~1–3 TRX
                </span>
              )}
            </div>

            {feesEnabled && numAmount > 0 && (
              <>
                <div className="border-t border-white/5 pt-2 mt-1 flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">Total deducted</span>
                  <span className="text-sm font-bold text-foreground">{totalRequired.toFixed(2)} USDT</span>
                </div>
                {!hasEnoughBalance && numAmount > 0 && (
                  <p className="text-xs text-destructive">
                    Insufficient balance — you need {totalRequired.toFixed(2)} USDT (including fee).
                  </p>
                )}
              </>
            )}

            <div className="text-xs text-muted-foreground/60 leading-relaxed pt-1">
              {sponsorActive && !userHasEnergy ? (
                <span className="flex items-center gap-1 text-primary/70">
                  <Zap className="w-3 h-3 flex-shrink-0" />
                  Gasless sponsors the network fee — no TRX needed.
                  {sponsor?.estimatedSendsRemaining != null &&
                    ` (~${sponsor.estimatedSendsRemaining} sponsored sends remaining)`}
                </span>
              ) : userHasEnergy ? (
                "You have enough Energy to cover the network fee for free."
              ) : (
                "Network resources are low. A small amount of TRX (1–3 TRX) may be required."
              )}
            </div>
          </div>

          <Button
            className="w-full h-14 text-lg mt-4"
            disabled={!isFormValid || sendMutation.isPending}
            onClick={handleSend}
          >
            {sendMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {PENDING_LABELS[pendingStep]}
              </span>
            ) : (
              <>Send USDT <ArrowUpRight className="w-5 h-5 ml-2" /></>
            )}
          </Button>
        </div>

        <GaslessModal isOpen={showEduModal} onClose={() => setShowEduModal(false)} />
      </div>
    </>
  );
}
