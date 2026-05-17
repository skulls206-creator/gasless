import { useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAccountNumberInput } from "@/lib/utils";
import { sha256Hex } from "@/lib/crypto";
import { apiUrl } from "@/lib/api";
import { KeyRound, ArrowRight, ArrowLeft, ServerCrash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export function RecoverWallet() {
  const [, setLocation] = useLocation();
  const { login, importWallet } = useWallet();
  const { toast } = useToast();

  const [accountNum, setAccountNum] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountNum.length !== 23) {
      toast({ variant: "destructive", title: "Enter your full 20-digit account number" });
      return;
    }

    setIsLoading(true);
    setNotFound(false);

    try {
      const hash = await sha256Hex(accountNum);

      const res = await fetch(apiUrl("/api/wallet/recover"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountHash: hash }),
      });

      if (res.status === 404) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Server error during recovery");
      }

      const { encryptedPk, address } = await res.json();

      // Re-store the encrypted key in this browser's localStorage
      localStorage.setItem("tron_wallet_encrypted_pk", encryptedPk);
      localStorage.setItem("tron_wallet_address", address);

      // Now log in by decrypting it
      const success = await login(accountNum);

      if (success) {
        toast({ title: "Wallet Recovered!", description: "Welcome back." });
        setLocation("/dashboard");
      } else {
        toast({
          variant: "destructive",
          title: "Decryption Failed",
          description: "Account number did not match the stored wallet.",
        });
        localStorage.removeItem("tron_wallet_encrypted_pk");
        localStorage.removeItem("tron_wallet_address");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recovery Failed",
        description: err.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt=""
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
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              Recover Wallet
            </h1>
            <p className="text-muted-foreground text-sm">
              Enter your 20-digit account number to restore access on this device.
            </p>
          </div>

          <form onSubmit={handleRecover} className="space-y-6">
            <div className="space-y-2">
              <Input
                type="tel"
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                value={accountNum}
                onChange={(e) => {
                  setAccountNum(formatAccountNumberInput(e.target.value));
                  setNotFound(false);
                }}
                className="font-mono text-center text-lg tracking-widest h-16 bg-background border-white/10 focus-visible:border-primary focus-visible:ring-primary/30"
                maxLength={23}
                autoFocus
              />
            </div>

            {notFound && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 p-4 rounded-xl text-sm"
              >
                <ServerCrash className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive mb-1">No wallet found</p>
                  <p className="text-muted-foreground text-xs">
                    This account number wasn't found on our servers. If you created your wallet
                    before cloud sync was added, recover using your private key instead.
                  </p>
                </div>
              </motion.div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-14"
              disabled={accountNum.length < 23 || isLoading}
            >
              {isLoading ? "Recovering…" : "Recover Wallet"}
              {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/10 text-center space-y-2">
            <p className="text-xs text-muted-foreground">Don't have your account number?</p>
            <Button
              variant="ghost"
              className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/import")}
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Recover from Private Key
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
