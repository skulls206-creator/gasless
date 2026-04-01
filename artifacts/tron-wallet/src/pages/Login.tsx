import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAccountNumberInput } from "@/lib/utils";
import { Lock, ArrowRight, PlusCircle, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export function Login() {
  const [, setLocation] = useLocation();
  const { login } = useWallet();
  const { toast } = useToast();
  
  const [accountNum, setAccountNum] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      {/* Clickable logo header */}
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

      {/* Background Visuals */}
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
            <Lock className="w-8 h-8 text-primary" />
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">Unlock Wallet</h1>
            <p className="text-muted-foreground text-sm">
              Enter your 20-digit account number to decrypt your private key locally.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
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
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Lost your number? <span className="text-primary/80">Funds cannot be recovered.</span>
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
            <p className="text-xs text-muted-foreground text-center mb-4">Or start fresh</p>
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => setLocation("/create")}
            >
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
