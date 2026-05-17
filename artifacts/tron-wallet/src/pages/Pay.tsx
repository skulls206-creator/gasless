import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { Copy, ExternalLink, Download, Zap, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QRCodeCanvas } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { formatAddress } from "@/lib/utils";
import { createPeerExtensionSdk } from "@zkp2p/sdk";

// TRON mainnet chain ID · USDT TRC-20 contract
const TRON_CHAIN_ID = "728126428";
const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_USDT_TOKEN = `${TRON_CHAIN_ID}:${TRON_USDT_CONTRACT}`;

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
    buildUrl: () => `https://p2p.binance.com/en/trade/buy/USDT?fiat=USD&payment=ALL`,
  },
];

export function Pay() {
  const { address } = useWallet();
  const { toast } = useToast();
  const sdkRef = useRef(createPeerExtensionSdk({ window }));

  const [peerState, setPeerState] = useState<PeerState>("checking");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sdkRef.current.getState().then((s) => {
      if (!cancelled) setPeerState(s as PeerState);
    }).catch(() => {
      if (!cancelled) setPeerState("error");
    });
    return () => { cancelled = true; };
  }, []);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "Paste it into the on-ramp checkout." });
    }
  };

  const handlePeerLaunch = async () => {
    const state = await sdkRef.current.getState();
    setPeerState(state as PeerState);

    if (state === "needs_install") {
      setShowInstallModal(true);
      return;
    }

    if (state === "needs_connection") {
      setIsConnecting(true);
      try {
        const approved = await sdkRef.current.requestConnection();
        if (!approved) {
          toast({ variant: "destructive", title: "Connection declined", description: "Approve the connection in the Peer side panel to continue." });
          return;
        }
        setPeerState("ready");
      } catch {
        toast({ variant: "destructive", title: "Connection failed", description: "Make sure the Peer extension is active in Chrome." });
        return;
      } finally {
        setIsConnecting(false);
      }
    }

    // Launch with TRON USDT pre-selected and deposit address pre-filled
    sdkRef.current.onramp({
      referrer: "gasless.khurk.xyz",
      callbackUrl: window.location.origin,
      toToken: TRON_USDT_TOKEN,
      ...(address ? { recipientAddress: address } : {}),
    });
  };

  const statusIcon = () => {
    if (isConnecting || peerState === "checking") return <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    if (peerState === "needs_install") return <Download className="w-4 h-4 mr-2" />;
    if (peerState === "needs_connection") return <Zap className="w-4 h-4 mr-2" />;
    if (peerState === "ready") return <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />;
    return null;
  };

  const statusLabel = () => {
    if (isConnecting) return "Connecting…";
    if (peerState === "checking") return "Checking…";
    if (peerState === "needs_install") return "Install Peer Extension";
    if (peerState === "needs_connection") return "Connect Peer Extension";
    if (peerState === "ready") return "Buy USDT on Peer";
    return "Unavailable";
  };

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Buy USDT</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Purchase USDT (TRC-20) and receive it directly to your wallet.
        </p>
      </div>

      {/* Peer.xyz — featured */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-950/60 to-card border border-emerald-500/30 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-lg shrink-0">
              P
            </div>
            <div>
              <p className="font-bold text-sm">
                Peer.xyz <span className="text-xs font-normal text-emerald-400 ml-1">Recommended</span>
              </p>
              <p className="text-xs text-muted-foreground">P2P via Venmo, Revolut, Cash App & more</p>
            </div>
          </div>
          {peerState === "ready" && (
            <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
              Extension ready
            </span>
          )}
        </div>

        <div className="bg-black/20 rounded-xl p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Will pre-fill</p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Token</span>
            <span className="text-xs font-mono text-emerald-400">USDT (TRC-20)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Deposit address</span>
            <span className="text-xs font-mono text-emerald-400">{formatAddress(address || "")}</span>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          onClick={handlePeerLaunch}
          disabled={isConnecting || peerState === "checking" || peerState === "error"}
        >
          {statusIcon()}
          {statusLabel()}
        </Button>

        {peerState === "needs_install" && (
          <p className="text-[11px] text-muted-foreground text-center">
            Requires the free Peer Chrome extension · Desktop only
          </p>
        )}
        {peerState === "error" && (
          <p className="text-[11px] text-red-400 text-center">
            Could not detect Peer extension — try Chrome desktop with the extension installed.
          </p>
        )}
      </motion.div>

      {/* QR / address card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-4"
      >
        <div className="bg-white p-3 rounded-xl">
          {address ? (
            <QRCodeCanvas
              value={address}
              size={110}
              level="H"
              marginSize={1}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          ) : (
            <div className="w-[110px] h-[110px] flex items-center justify-center bg-gray-100 rounded-lg">
              <span className="text-gray-400 text-xs">Loading…</span>
            </div>
          )}
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
        Always verify you're using the TRON (TRC-20) network when sending USDT.
      </p>

      {/* Install modal */}
      <AnimatePresence>
        {showInstallModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowInstallModal(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-xl">P</div>
                <button onClick={() => setShowInstallModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div>
                <h3 className="font-bold text-lg">Install Peer Extension</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Peer lets you go from fiat to USDT in seconds — no extra verification required. Works via Venmo, Revolut, Cash App and more.
                </p>
              </div>
              <Button
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => {
                  sdkRef.current.openInstallPage();
                  setShowInstallModal(false);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Get Peer on Chrome Web Store
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">Desktop Chrome only · Free to install</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
