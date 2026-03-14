import { useState } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateAccountNumber, formatAccountNumberInput } from "@/lib/utils";
import { KeyRound, ArrowLeft, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { getAddressFromPrivateKey } from "@/lib/tron";

export function ImportWallet() {
  const [, setLocation] = useLocation();
  const { importWallet, hasWallet } = useWallet();
  const { toast } = useToast();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [privateKey, setPrivateKey] = useState("");
  const [accountNum, setAccountNum] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleValidateKey = () => {
    const address = getAddressFromPrivateKey(privateKey);
    if (!address) {
      toast({ variant: "destructive", title: "Invalid Private Key", description: "Could not derive a TRON address." });
      return;
    }
    setAccountNum(generateAccountNumber());
    setStep(2);
  };

  const handleImport = () => {
    setIsImporting(true);
    setTimeout(() => {
      const success = importWallet(privateKey, accountNum);
      setIsImporting(false);
      
      if (success) {
        toast({ title: "Wallet imported successfully!" });
        setLocation("/dashboard");
      } else {
        toast({ variant: "destructive", title: "Import failed" });
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <button
        onClick={() => setLocation(hasWallet ? "/login" : "/")}
        className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8 mt-4 w-fit"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </button>

      <div className="flex-1 w-full max-w-md mx-auto">
        <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-6 border border-white/5">
          <KeyRound className="w-8 h-8 text-foreground" />
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div>
              <h1 className="text-3xl font-display font-bold mb-3 text-gradient">Import Wallet</h1>
              <p className="text-muted-foreground">
                Paste your TRON private key below. We will immediately encrypt it with a new account number.
              </p>
            </div>

            {hasWallet && (
              <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-400">
                <span className="mt-0.5 shrink-0">⚠️</span>
                <p>
                  <strong>This will replace your existing wallet.</strong> Make sure you've backed up your private key from the Backup tab first.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Private Key</label>
              <Input
                type="password"
                placeholder="Enter 64-character hex key..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="font-mono"
              />
            </div>

            <Button 
              size="lg" 
              className="w-full h-14" 
              onClick={handleValidateKey}
              disabled={privateKey.length < 60}
            >
              Verify Key
            </Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div>
              <h1 className="text-2xl font-display font-bold mb-3">Secure Your Import</h1>
              <p className="text-muted-foreground">
                We've generated a new 20-digit Account Number to lock your imported key. Save it now.
              </p>
            </div>

            <div className="bg-card border border-border p-6 rounded-2xl shadow-xl mt-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your New Account Number</p>
              <div className="font-mono text-2xl font-bold tracking-widest text-primary text-center py-4 bg-background rounded-xl border border-primary/20 mb-4 select-all">
                {accountNum}
              </div>
            </div>

            <div className="bg-secondary/40 p-4 rounded-xl border border-white/5 flex gap-3 items-start cursor-pointer" onClick={() => setIsSaved(!isSaved)}>
              <div className="mt-1">
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSaved ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                  {isSaved && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                </div>
              </div>
              <p className="text-sm text-foreground/90 select-none">
                I have saved this number. I understand that if I lose it, I cannot access this wallet here again.
              </p>
            </div>

            <Button 
              size="lg" 
              className="w-full h-14" 
              disabled={!isSaved || isImporting}
              onClick={handleImport}
            >
              {isImporting ? "Encrypting & Importing..." : "Complete Import"}
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
