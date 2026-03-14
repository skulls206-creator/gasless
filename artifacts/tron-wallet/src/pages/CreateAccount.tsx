import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { generateAccountNumber } from "@/lib/utils";
import { Copy, ArrowRight, ShieldAlert, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export function CreateAccount() {
  const [, setLocation] = useLocation();
  const { createWallet } = useWallet();
  const { toast } = useToast();
  
  const [accountNum, setAccountNum] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setAccountNum(generateAccountNumber());
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(accountNum);
    toast({
      title: "Copied to clipboard",
      description: "Paste it somewhere secure.",
    });
  };

  const handleContinue = () => {
    setIsCreating(true);
    // Slight delay for UX feeling
    setTimeout(() => {
      createWallet(accountNum);
      toast({
        title: "Wallet created successfully!",
        description: "Your keys are secured locally.",
      });
      setLocation("/dashboard");
    }, 1000);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-center py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          
          <div>
            <h1 className="text-3xl font-display font-bold mb-3 text-gradient">Save Your Account Number</h1>
            <p className="text-muted-foreground">
              This 20-digit number is your unique key. We use it to encrypt your wallet on this device. <strong className="text-foreground">We cannot recover this for you.</strong>
            </p>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-xl mt-8">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Account Number</p>
            
            <div className="font-mono text-2xl sm:text-3xl font-bold tracking-widest text-primary text-center py-4 bg-background rounded-xl border border-primary/20 mb-4 select-all">
              {accountNum || "..."}
            </div>

            <Button variant="outline" className="w-full" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Account Number
            </Button>
          </div>

          <div className="bg-secondary/40 p-4 rounded-xl border border-white/5 flex gap-3 items-start cursor-pointer" onClick={() => setIsSaved(!isSaved)}>
            <div className="mt-1">
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSaved ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                {isSaved && <CheckSquare className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <p className="text-sm text-foreground/90 select-none">
              I have securely saved this 20-digit number offline or in a password manager. I understand that losing it means losing my funds forever.
            </p>
          </div>

          <div className="pt-6">
            <Button 
              size="lg" 
              className="w-full h-14 text-lg" 
              disabled={!isSaved || isCreating}
              onClick={handleContinue}
            >
              {isCreating ? "Encrypting Wallet..." : "Create Wallet"}
              {!isCreating && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
