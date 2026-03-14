import { useWallet } from "@/context/WalletContext";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { formatAddress } from "@/lib/utils";

const ONRAMPS = [
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
    name: "Peer.xyz",
    description: "P2P via Venmo, Revolut & more · desktop only",
    logo: "P",
    color: "from-emerald-600 to-emerald-400",
    buildUrl: () => `https://peer.xyz`,
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

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast({ title: "Address Copied", description: "Paste it into the on-ramp checkout." });
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Buy USDT</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Purchase USDT and receive it directly to your wallet.
        </p>
      </div>

      {/* Address card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-4"
      >
        <div className="bg-white p-3 rounded-xl">
          <QRCodeSVG value={address || ""} size={120} />
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Your TRON (TRC-20) Address</p>
          <p className="font-mono text-sm text-foreground/90">{formatAddress(address || "")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleCopy} className="w-full">
          <Copy className="w-4 h-4 mr-2" /> Copy Full Address
        </Button>
      </motion.div>

      {/* On-ramp options */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
          Choose a provider — opens in a new tab
        </p>
        <div className="space-y-3">
          {ONRAMPS.map((ramp, i) => (
            <motion.a
              key={ramp.name}
              href={ramp.buildUrl(address || "")}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
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
        These are third-party services. Always verify you're using the correct TRON (TRC-20) network and paste your address carefully.
      </p>
    </div>
  );
}
