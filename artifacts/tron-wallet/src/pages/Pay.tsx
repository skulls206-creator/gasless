import { useState, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { Copy, ExternalLink, Download, Zap, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { formatAddress } from "@/lib/utils";
import { peerExtensionSdk } from "@zkp2p/sdk";

type PeerState = "checking" | "needs_install" | "needs_connection" | "ready" | "error";

const BACKUP_ONRAMPS = [
  {
    name: "Transak",
    description: "Card, bank transfer · 160+ countries",
    logo: "T",
    color: "from-blue-600 to-blue-400",
    buildUrl: (address: string) =>
      `https://global.transak.com/?defaultCryptoCurrency=USDT&networks=tron&walletAddress=${address}&productsAvailed=BUY`,
  },
  {
    name: "MoonPay",
    description: "Card, Apple Pay · instant",
    logo: "M",
    color: "from-violet-600 to-violet-400",
    buildUrl: (address: string) =>
      `https://buy.moonpay.com/?defaultCurrencyCode=usdt_tron&walletAddress=${address}`,
  },
  {
    name: "Binance P2P",
    description: "Peer-to-peer · lowest fees",
    logo: "B",
    color: "from-yellow-600 to-yellow-400",
    buildUrl: () =>
      `https://p2p.binance.com/en/trade/buy/USDT?fiat=USD&payment=ALL`,
  },
];

export function Pay() {
  const { address } = useWallet();
  const { toast } = useToast();
  const [peerState, setPeerState] = useState<PeerState>("checking");
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkPeer() {
      try {
        const state = await peerExtensionSdk.getState();
        if (!cancelled) setPeerState(state as PeerState);
      } catch {
        if (!cancelled) setPeerState("error");
      }
    }
    checkPeer();
    return () => { cancelled = true; };
  }, []);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "Paste it into the on-ramp checkout." });
    }
  };

  const handlePeerLaunch = async () => {
    if (peerState === "needs_install") {
      peerExtensionSdk.openInstallPage();
      return;
    }

    if (peerState === "needs_connection") {
      setIsConnecting(true);
      try {
        const approved = await peerExtensionSdk.requestConnection();
        if (approved) {
          setPeerState("ready");
        } else {
          toast({ variant: "destructive", title: "Peer connection declined", description: "Approve the connection in the Peer side panel." });
        }
      } catch {
        toast({ variant: "destructive", title: "Connection failed", description: "Make sure the Peer extension is active." });
      } finally {
        setIsConnecting(false);
      }
      return;
    }

    if (peerState === "ready") {
      // TRON is not in Peer's chain list — open without toToken so user picks chain in panel
      peerExtensionSdk.onramp({
        referrer: "TRON USDT Wallet",
        callbackUrl: window.location.origin,
      });
    }
  };

  const peerButtonLabel = () => {
    if (isConnecting) return "Connecting…";
    if (peerState === "checking") return "Checking…";
    if (peerState === "needs_install") return "Install Peer Extension";
    if (peerState === "needs_connection") return "Connect Peer Extension";
    if (peerState === "ready") return "Open Peer Onramp";
    return "Peer Unavailable";
  };

  const peerButtonIcon = () => {
    if (isConnecting || peerState === "checking") return <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    if (peerState === "needs_install") return <Download className="w-4 h-4 mr-2" />;
    if (peerState === "needs_connection") return <Zap className="w-4 h-4 mr-2" />;
    if (peerState === "ready") return <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />;
    return <AlertCircle className="w-4 h-4 mr-2" />;
  };

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Buy USDT</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Purchase USDT and receive it directly to your wallet.
        </p>
      </div>

      {/* Peer.xyz — featured */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-950/60 to-card border border-emerald-500/30 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-lg shrink-0">
            P
          </div>
          <div>
            <p className="font-bold text-sm">Peer.xyz <span className="text-xs font-normal text-emerald-400 ml-1">Recommended</span></p>
            <p className="text-xs text-muted-foreground">P2P via Venmo, Revolut, Cash App & more</p>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-300">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Peer's extension opens in a Chrome side panel. TRON is not yet in their chain list —
            you can buy USDT on BNB or Polygon and bridge to TRON, or use a backup below.
          </span>
        </div>

        <Button
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          onClick={handlePeerLaunch}
          disabled={isConnecting || peerState === "checking" || peerState === "error"}
        >
          {peerButtonIcon()}
          {peerButtonLabel()}
        </Button>

        {peerState === "needs_install" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Requires the free Peer Chrome extension · Desktop only
          </p>
        )}
        {peerState === "error" && (
          <p className="text-[11px] text-red-400 text-center">
            Could not detect Peer extension. Try Chrome desktop with the extension installed.
          </p>
        )}
      </motion.div>

      {/* Wallet address card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-4"
      >
        <div className="bg-white p-3 rounded-xl">
          <QRCodeSVG value={address || ""} size={110} />
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Your TRON (TRC-20) Address</p>
          <p className="font-mono text-sm text-foreground/90">{formatAddress(address || "")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleCopy} className="w-full">
          <Copy className="w-4 h-4 mr-2" /> Copy Full Address
        </Button>
      </motion.div>

      {/* Backup on-ramps */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
          Other options — open in new tab
        </p>
        <div className="space-y-3">
          {BACKUP_ONRAMPS.map((ramp, i) => (
            <motion.a
              key={ramp.name}
              href={ramp.buildUrl(address || "")}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4 hover:border-white/20 hover:bg-secondary/50 transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ramp.color} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                {ramp.logo}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{ramp.name}</p>
                <p className="text-xs text-muted-foreground truncate">{ramp.description}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </motion.a>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
        Always verify you're using the TRON (TRC-20) network when sending USDT to this address.
      </p>
    </div>
  );
}
