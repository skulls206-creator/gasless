import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ArrowLeft, KeyRound } from "lucide-react";
import { motion } from "framer-motion";

const PIN_LEN = 6;

function PinInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative">
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={PIN_LEN}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LEN))}
        className="absolute inset-0 w-full opacity-0 cursor-text"
        aria-label="PIN"
      />
      <div className="flex justify-between gap-2 pointer-events-none">
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 aspect-square max-w-[3.5rem] rounded-2xl border-2 flex items-center justify-center text-2xl font-mono font-bold transition-all ${
              i === value.length
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                : value[i]
                ? "border-primary/40 bg-secondary text-foreground"
                : "border-white/10 bg-secondary/40 text-muted-foreground"
            }`}
          >
            {value[i] ? "•" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SetupPin() {
  const [, setLocation]      = useLocation();
  const { setupPin, hasPin, removePin, isLoggedIn } = useWallet();
  const { toast }            = useToast();

  const [step, setStep]      = useState<"enter" | "confirm">("enter");
  const [pin, setPin]        = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy]      = useState(false);

  // Auto-advance to confirm when PIN is fully entered
  useEffect(() => {
    if (step === "enter" && pin.length === PIN_LEN) {
      setStep("confirm");
    }
  }, [pin, step]);

  if (!isLoggedIn) {
    setLocation("/login");
    return null;
  }

  const handleSave = async () => {
    if (pin.length !== PIN_LEN) {
      toast({ variant: "destructive", title: "PIN must be 6 digits" });
      return;
    }
    if (pin !== confirm) {
      toast({ variant: "destructive", title: "PINs don't match", description: "Please re-enter." });
      setStep("enter");
      setPin("");
      setConfirm("");
      return;
    }
    setBusy(true);
    const ok = await setupPin(pin);
    setBusy(false);
    if (!ok) {
      toast({ variant: "destructive", title: "Could not save PIN" });
      return;
    }
    toast({ title: "PIN set", description: "You can now unlock with 6 digits." });
    setLocation("/dashboard");
  };

  const handleRemove = () => {
    removePin();
    toast({ title: "PIN removed" });
    setLocation("/dashboard");
  };

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <button
        onClick={() => setLocation("/dashboard")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-3xl p-8 shadow-xl"
      >
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-bold mb-2">
            {hasPin ? "Change PIN" : "Set a 6-Digit PIN"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step === "enter"
              ? "Quick-unlock without typing your full 20-digit account number. Your account number stays the master key."
              : "Re-enter your PIN to confirm."}
          </p>
        </div>

        <div className="space-y-6">
          <PinInput
            value={step === "enter" ? pin : confirm}
            onChange={step === "enter" ? setPin : setConfirm}
            autoFocus
          />

          {step === "confirm" && (
            <Button
              className="w-full h-12"
              onClick={handleSave}
              disabled={confirm.length !== PIN_LEN || busy}
            >
              {busy ? "Saving…" : "Save PIN"}
            </Button>
          )}

          {step === "confirm" && (
            <button
              onClick={() => { setStep("enter"); setPin(""); setConfirm(""); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Start over
            </button>
          )}

          <div className="text-xs text-muted-foreground/70 leading-relaxed bg-secondary/40 rounded-xl p-3 border border-white/5">
            <strong className="text-foreground/80">How it works:</strong> Your 6-digit PIN encrypts your account number on this device only. After 10 wrong PINs, the PIN is wiped and you'll need your 20-digit number to unlock.
          </div>
        </div>

        {hasPin && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleRemove}
            >
              <KeyRound className="w-4 h-4 mr-2" /> Remove PIN
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
