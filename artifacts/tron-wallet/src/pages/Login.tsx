import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAccountNumberInput } from "@/lib/utils";
import { Lock, ArrowRight, PlusCircle, Key, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const PIN_LEN = 6;

function PinPad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
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
        disabled={disabled}
        className="absolute inset-0 w-full opacity-0 cursor-text disabled:cursor-not-allowed"
        aria-label="PIN"
      />
      <div className="flex justify-between gap-2 pointer-events-none">
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 aspect-square max-w-[3.5rem] rounded-2xl border-2 flex items-center justify-center text-2xl font-mono font-bold transition-all ${
              i === value.length && !disabled
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

export function Login() {
  const [, setLocation] = useLocation();
  const { login, hasPin, unlockWithPin } = useWallet();
  const { toast } = useToast();

  // Default to PIN entry when a PIN is configured; user can switch to
  // the long account number any time.
  const [mode, setMode] = useState<"pin" | "acct">(hasPin ? "pin" : "acct");
  const [accountNum, setAccountNum] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAcctLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountNum.length !== 23) {
      toast({ variant: "destructive", title: "Incomplete account number" });
      return;
    }
    setIsLoading(true);
    try {
      const success = await login(accountNum);
      if (success) {
        toast({ title: "Welcome back!" });
        setLocation("/dashboard");
      } else {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "Incorrect account number or wallet data corrupted.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-submit PIN once 6 digits are entered
  useEffect(() => {
    if (mode !== "pin" || pin.length !== PIN_LEN || isLoading) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const result = await unlockWithPin(pin);
        if (cancelled) return;
        if (result.ok) {
          toast({ title: "Welcome back!" });
          setLocation("/dashboard");
          return;
        }
        if (result.wiped) {
          toast({
            variant: "destructive",
            title: "PIN locked",
            description: "Too many wrong attempts. Use your 20-digit number.",
          });
          setMode("acct");
          setPin("");
          return;
        }
        toast({
          variant: "destructive",
          title: "Wrong PIN",
          description: result.attemptsRemaining != null
            ? `${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} remaining.`
            : undefined,
        });
        setPin("");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pin, mode, isLoading, unlockWithPin, toast, setLocation]);

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="relative z-10 flex items-center gap-3 mb-4">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Gasless"
            className="w-8 h-8 rounded-[22%] drop-shadow-md"
          />
          <span className="font-display font-bold text-xl tracking-tight text-white">Gasless</span>
        </Link>
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Hero Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-2xl" />
      </div>

      <div className="relative z-10 flex-1 w-full max-w-md mx-auto flex flex-col justify-center py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
            {mode === "pin" ? <ShieldCheck className="w-8 h-8 text-primary" /> : <Lock className="w-8 h-8 text-primary" />}
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              {mode === "pin" ? "Enter PIN" : "Unlock Wallet"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {mode === "pin"
                ? "Enter your 6-digit PIN to unlock."
                : "Enter your 20-digit account number to decrypt your private key locally."}
            </p>
          </div>

          {mode === "pin" ? (
            <div className="space-y-6">
              <PinPad value={pin} onChange={setPin} disabled={isLoading} />
              {isLoading && (
                <p className="text-center text-xs text-muted-foreground">Decrypting…</p>
              )}
              {hasPin && (
                <button
                  onClick={() => { setMode("acct"); setPin(""); }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-primary"
                >
                  Use 20-digit account number instead
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleAcctLogin} className="space-y-6">
              <div className="space-y-2">
                <Input
                  type="tel"
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  value={accountNum}
                  onChange={(e) => setAccountNum(formatAccountNumberInput(e.target.value))}
                  className="font-mono text-center text-lg tracking-widest h-16 bg-background border-white/10 focus-visible:border-primary focus-visible:ring-primary/30"
                  maxLength={23}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-14"
                disabled={accountNum.length < 23 || isLoading}
              >
                {isLoading ? "Decrypting..." : "Unlock"}
                {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
              </Button>

              {hasPin && (
                <button
                  type="button"
                  onClick={() => { setMode("pin"); setAccountNum(""); }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-primary"
                >
                  Use 6-digit PIN instead
                </button>
              )}
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Lost your number? <span className="text-primary/80">Funds cannot be recovered.</span>
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
            <p className="text-xs text-muted-foreground text-center mb-4">Or start fresh</p>
            <Button variant="outline" className="w-full h-12" onClick={() => setLocation("/create")}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Create New Wallet
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/import")}
            >
              <Key className="w-4 h-4 mr-2" />
              Recover from Private Key
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
