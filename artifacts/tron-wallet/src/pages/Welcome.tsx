import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Wallet, KeyRound, ShieldCheck, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

export function Welcome() {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-6 bg-background text-foreground overflow-hidden">
      {/* Background Visuals */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Hero Background" 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 1 }}
          className="mb-8"
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.png`} 
            alt="Gasless" 
            className="w-24 h-24 rounded-[22%] drop-shadow-2xl" 
          />
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-display font-bold mb-4 text-white">
            Gasless
          </h1>
          <p className="text-muted-foreground text-lg">
            Secure, anonymous, and browser-based. <br />No emails. No passwords. No servers.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-[#00d4f5] shrink-0" />
            USDT · TRC-20 · TRON Network only
          </div>
        </motion.div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full space-y-4"
        >
          <Link href="/create" className="block w-full">
            <Button size="lg" className="w-full text-lg h-16 group">
              <Wallet className="mr-2 w-5 h-5 transition-transform group-hover:scale-110" />
              Create New Wallet
            </Button>
          </Link>

          <Link href="/recover" className="block w-full">
            <Button size="lg" variant="glass" className="w-full text-lg h-16 group">
              <RotateCcw className="mr-2 w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              Enter Account Number
            </Button>
          </Link>
          
          <Link href="/import" className="block w-full">
            <Button size="lg" variant="ghost" className="w-full h-12 text-sm text-muted-foreground group">
              <KeyRound className="mr-2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              Recover from Private Key
            </Button>
          </Link>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground bg-secondary/50 py-2 px-4 rounded-full border border-white/5"
        >
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Keys never leave your device. 100% self-custodial.</span>
        </motion.div>
      </div>
    </div>
  );
}
