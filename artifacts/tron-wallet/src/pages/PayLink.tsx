import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Zap, ShieldCheck } from "lucide-react";

interface PayLinkProps {
  toAddress?: string;
}

export function PayLink({ toAddress }: PayLinkProps) {
  const { isLoggedIn } = useWallet();
  const [, setLocation] = useLocation();

  // If logged in, redirect straight to send with address pre-filled
  useEffect(() => {
    if (isLoggedIn && toAddress) {
      setLocation(`/send?to=${encodeURIComponent(toAddress)}`);
    }
  }, [isLoggedIn, toAddress, setLocation]);

  const handleLogin = () => {
    if (toAddress) {
      sessionStorage.setItem("gasless_pay_to", toAddress);
    }
    setLocation("/login");
  };

  const handleCreate = () => {
    if (toAddress) {
      sessionStorage.setItem("gasless_pay_to", toAddress);
    }
    setLocation("/create");
  };

  const short = toAddress
    ? `${toAddress.slice(0, 8)}…${toAddress.slice(-6)}`
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-8">
      {/* Logo */}
      <img
        src="/images/logo.png"
        alt="Gasless"
        className="w-20 h-20 rounded-[22%] drop-shadow-xl"
      />

      {/* Card */}
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 text-center space-y-4 shadow-xl">
        <div className="flex justify-center">
          <div className="bg-primary/10 border border-primary/20 rounded-2xl px-4 py-2">
            <p className="text-xs text-muted-foreground">Sending to</p>
            <p className="font-mono text-sm font-semibold text-foreground mt-1">{short}</p>
          </div>
        </div>

        <h1 className="text-2xl font-display font-bold">Pay with Gasless</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Send USDT on TRON — no gas fees, no account required.<br />
          Log in or create a free wallet to continue.
        </p>

        <div className="space-y-3 pt-2">
          <Button className="w-full h-12" onClick={handleLogin}>
            Log In &amp; Send <ArrowUpRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" className="w-full h-12" onClick={handleCreate}>
            Create Wallet &amp; Send
          </Button>
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span>Gasless — network fees sponsored for you</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span>Keys stay on your device — never sent anywhere</span>
        </div>
      </div>
    </div>
  );
}
