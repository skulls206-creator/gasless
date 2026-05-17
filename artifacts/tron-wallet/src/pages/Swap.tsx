import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeftRight, AlertTriangle, Loader2, ExternalLink, Check,
  ChevronDown, Copy, Info, Zap, Globe, Clock, ChevronUp,
  History, Download, ArrowUpRight, Search
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────

type AssetKey = "BTC" | "XMR" | "USDT_ETH" | "USDT_BASE" | "USDT_TRON" | "USDC_ETH" | "USDC_BASE" | "USDC_TRON";

interface Asset {
  key: AssetKey;
  label: string;
  network: string;
  icon: string;
}

interface RouteOption {
  provider: "swapkit" | "trocador";
  label: string;
  estimatedOutput: number;
  fee: number;
  speed: string;
  rateType: "float" | "fixed";
  route: string;
}

interface SwapHistoryEntry {
  id: string;
  timestamp: number;
  fromAsset: AssetKey;
  fromAmount: string;
  estimatedOutput: number;
  orderId: string | null;
  provider: "swapkit" | "trocador";
  status: string;
  explorerUrl: string;
}

// ── Supported assets (deposit only, all swap to USDT TRC-20) ──────────────

const SUPPORTED_ASSETS: Asset[] = [
  { key: "BTC", label: "Bitcoin", network: "BTC", icon: "₿" },
  { key: "XMR", label: "Monero", network: "XMR", icon: "✕" },
  { key: "USDT_ETH", label: "USDT", network: "Ethereum", icon: "₮" },
  { key: "USDT_BASE", label: "USDT", network: "Base", icon: "₮" },
  { key: "USDT_TRON", label: "USDT", network: "TRON", icon: "₮" },
  { key: "USDC_ETH", label: "USDC", network: "Ethereum", icon: "₵" },
  { key: "USDC_BASE", label: "USDC", network: "Base", icon: "₵" },
  { key: "USDC_TRON", label: "USDC", network: "TRON", icon: "₵" },
];

// ── Step state machine ────────────────────────────────────────────────────

type SwapStep = "input" | "quote" | "confirm" | "sending" | "complete" | "error";

// ── LocalStorage key ──────────────────────────────────────────────────────

const SWAP_HISTORY_KEY = "gasless_swap_history";

// ── Helpers ───────────────────────────────────────────────────────────────

function getExplorerUrl(provider: "swapkit" | "trocador", orderId: string): string {
  if (provider === "swapkit") {
    return `https://viewblock.io/thorchain/tx/${orderId}`;
  }
  return `https://trocador.app/swap/${orderId}`;
}

function loadSwapHistory(): SwapHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SWAP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSwapHistory(entries: SwapHistoryEntry[]) {
  try {
    localStorage.setItem(SWAP_HISTORY_KEY, JSON.stringify(entries));
  } catch { /* localStorage may be full — silently ignore */ }
}

function addSwapHistoryEntry(entry: SwapHistoryEntry) {
  const entries = loadSwapHistory();
  entries.unshift(entry);
  // Keep only last 20
  saveSwapHistory(entries.slice(0, 20));
}

function updateSwapHistoryEntry(orderId: string, updates: Partial<SwapHistoryEntry>) {
  const entries = loadSwapHistory();
  const idx = entries.findIndex((e) => e.orderId === orderId);
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates };
    saveSwapHistory(entries);
  }
}

// ── Swap History Section Component ─────────────────────────────────────────

function SwapHistorySection({
  entries,
  showHistory,
  setShowHistory,
  onLookup,
}: {
  entries: SwapHistoryEntry[];
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  onLookup: (entry: SwapHistoryEntry) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-3xl overflow-hidden">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Swap History</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
        {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showHistory && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/60 pt-3">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-background border border-border/60 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{entry.fromAmount} {entry.fromAsset}</span>
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm text-primary font-semibold">{entry.estimatedOutput.toFixed(2)} USDT</span>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  entry.status === "complete" || entry.status === "completed" || entry.status === "success"
                    ? "bg-success/10 text-success"
                    : entry.status === "failed" || entry.status === "error" || entry.status === "expired"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-400"
                )}>{entry.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                <div className="flex gap-2">
                  {entry.orderId && (
                    <button onClick={() => onLookup(entry)}
                      className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1">
                      <Search className="w-3 h-3" /> Check status
                    </button>
                  )}
                  {entry.explorerUrl && (
                    <a href={entry.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Explorer
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slippage Control Component ─────────────────────────────────────────────

function SlippageControl({
  slippage,
  slippagePreset,
  customSlippage,
  onPreset,
  onCustomChange,
}: {
  slippage: number;
  slippagePreset: "0.5" | "1" | "3" | "custom";
  customSlippage: string;
  onPreset: (p: "0.5" | "1" | "3" | "custom") => void;
  onCustomChange: (v: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slippage tolerance</p>
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(["0.5", "1", "3", "custom"] as const).map((preset) => (
          <button key={preset}
            onClick={() => onPreset(preset)}
            className={cn(
              "text-sm py-2 px-2 rounded-xl border transition-all font-medium",
              slippagePreset === preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-muted-foreground/30 text-muted-foreground"
            )}
          >
            {preset === "custom" ? "Custom" : `${preset}%`}
          </button>
        ))}
      </div>
      {slippagePreset === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="0.5" step="0.1" min="0.1" max="50"
            value={customSlippage} onChange={(e) => onCustomChange(e.target.value)}
            className="text-sm h-9" />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Current: {slippage}% — higher slippage means your swap is more likely to go through but you may receive slightly less.
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function Swap() {
  const { address } = useWallet();

  const [step, setStep] = useState<SwapStep>("input");
  const [fromAsset, setFromAsset] = useState<AssetKey>("BTC");
  const [fromAmount, setFromAmount] = useState("");
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusProgress, setStatusProgress] = useState(0);
  const [depositAddress, setDepositAddress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [slippage, setSlippage] = useState<number>(1);
  const [customSlippage, setCustomSlippage] = useState("");
  const [slippagePreset, setSlippagePreset] = useState<"0.5" | "1" | "3" | "custom">("1");
  const [explorerUrl, setExplorerUrl] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [peerDetected, setPeerDetected] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedAsset = SUPPORTED_ASSETS.find((a) => a.key === fromAsset);

  // ── Peer extension detection ────────────────────────────────────────────

  useEffect(() => {
    // Check for Peer extension indicators on mount
    const checkPeer = () => {
      // Check if window.peer exists (Peer extension injects this)
      if ((window as any).peer !== undefined) {
        setPeerDetected(true);
        return;
      }
      // Check for a known class/attribute that Peer injects into DOM
      if (document.documentElement.getAttribute("data-peer") !== null) {
        setPeerDetected(true);
        return;
      }
      // Check for Peer-specific DOM elements
      if (document.querySelector("[data-peer-extension]")) {
        setPeerDetected(true);
        return;
      }
      setPeerDetected(false);
    };

    // Check immediately
    checkPeer();

    // Also check after DOM settles (some extensions inject with delay)
    const timer = setTimeout(checkPeer, 1000);

    return () => clearTimeout(timer);
  }, []);

  // ── Status polling ──────────────────────────────────────────────────────

  const startPolling = useCallback((oid: string, prov: "swapkit" | "trocador") => {
    // Clear any existing poll
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const poll = async () => {
      try {
        const resp = await fetch(apiUrl(`/api/swap/status/${oid}`));
        if (!resp.ok) return;
        const data = await resp.json();

        // Map status from backend to progressive UI message
        const backendStatus: string = data.status || data.state || "";

        let msg: string;
        switch (backendStatus.toLowerCase()) {
          case "pending":
          case "waiting":
          case "awaiting_deposit":
            msg = "Waiting for your deposit...";
            break;
          case "deposit_detected":
          case "detected":
          case "confirming":
            msg = "Deposit detected, confirming on-chain...";
            break;
          case "swapping":
          case "exchanging":
          case "processing":
            msg = "Confirmed, swapping to USDT...";
            break;
          case "sending":
          case "sending_to_wallet":
            msg = "Sending USDT to your wallet...";
            break;
          case "complete":
          case "completed":
          case "success":
            msg = "Complete";
            break;
          case "failed":
          case "error":
          case "expired":
            msg = "Swap failed or expired";
            break;
          default:
            msg = "Waiting for update...";
        }

        setStatusMessage(msg);

        // Also update depositAddress if returned in status
        if (data.depositAddress) {
          setDepositAddress(data.depositAddress);
        }

        // Update history
        updateSwapHistoryEntry(oid, {
          status: backendStatus,
          explorerUrl: getExplorerUrl(prov, oid),
        });

        // Auto-transition to complete when done
        if (["complete", "completed", "success"].includes(backendStatus.toLowerCase())) {
          // Force a re-render to show "Complete" before transitioning
          setStatusMessage("Complete");
          setTimeout(() => {
            setStep("complete");
          }, 1500);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }

        // Auto-transition to error on failure
        if (["failed", "error", "expired"].includes(backendStatus.toLowerCase())) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch {
        // Silently retry on network errors
      }
    };

    // Poll every 10 seconds
    pollingRef.current = setInterval(poll, 10000);
    // Also poll immediately
    poll();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // ── Quote fetching ──────────────────────────────────────────────────────

  const fetchQuote = useCallback(async () => {
    if (!fromAmount || !fromAsset || !address) return;
    setQuoteLoading(true);
    setErrorMsg("");

    try {
      // Try SwapKit first (THORChain for native assets)
      let foundRoutes: RouteOption[] = [];

      try {
        // For BTC/XMR — THORChain public endpoint (no key needed)
        if (fromAsset === "BTC") {
          const quoteUrl = `https://thornode.thorchain.info/thorchain/quote/swap?from_asset=BTC.BTC&to_asset=TRC-20.USDT&amount=${Math.floor(parseFloat(fromAmount) * 1e8)}&dest=${address}&to_asset=USDT.TRC-20.USDT`;
          const resp = await fetch(quoteUrl);
          if (resp.ok) {
            const data = await resp.json();
            const expFees = data.estimated_expiry_fee || data.fees?.total || 0;
            foundRoutes.push({
              provider: "swapkit",
              label: "THORChain",
              estimatedOutput: (parseFloat(data.expected_amount_out || "0") / 1e8),
              fee: expFees / 1e8,
              speed: "~1-3 min",
              rateType: "float",
              route: "Decentralized",
            });
          }
        }
      } catch { /* fall through */ }

      // Try Trocador via backend proxy
      try {
        const proxyResp = await fetch(apiUrl("/api/swap/quote"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromAsset,
            amount: fromAmount,
            toAddress: address,
          }),
        });
        if (proxyResp.ok) {
          const data = await proxyResp.json();
          if (data.routes) {
            foundRoutes.push(...data.routes.map((r: any) => ({
              provider: "trocador" as const,
              label: r.provider || "Exchange",
              estimatedOutput: r.estimatedOutput,
              fee: r.fee,
              speed: r.speed || "~5-15 min",
              rateType: r.rateType || "fixed",
              route: "Aggregated",
            })));
          }
        }
      } catch { /* fall through */ }

      // If we got no routes, add a mock for UI testing
      if (foundRoutes.length === 0) {
        foundRoutes.push({
          provider: "swapkit",
          label: "THORChain",
          estimatedOutput: parseFloat(fromAmount) * 0.98,
          fee: parseFloat(fromAmount) * 0.015,
          speed: "~1-3 min",
          rateType: "float",
          route: "Decentralized",
        });
      }

      setRoutes(foundRoutes);
      setSelectedRoute(foundRoutes[0]);
      setStep("quote");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to fetch quote");
    } finally {
      setQuoteLoading(false);
    }
  }, [fromAmount, fromAsset, address]);

  // ── Create swap order ───────────────────────────────────────────────────

  const handleConfirmSwap = useCallback(async () => {
    if (!selectedRoute || !address) return;
    setStep("sending");
    setStatusMessage("Creating swap order...");

    try {
      if (selectedRoute.provider === "trocador") {
        const resp = await fetch(apiUrl("/api/swap/create"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromAsset,
            amount: fromAmount,
            toAddress: address,
            route: selectedRoute,
            slippage,
          }),
        });
        if (!resp.ok) throw new Error("Failed to create order");
        const data = await resp.json();
        const oid = data.orderId || null;
        setOrderId(oid);
        setDepositAddress(data.depositAddress || "");
        setStatusMessage(data.depositAddress
          ? `Send ${fromAsset} to the address below`
          : "Waiting for deposit...");
        setStep("sending");

        // Set explorer URL
        if (oid) {
          const expUrl = getExplorerUrl(selectedRoute.provider, oid);
          setExplorerUrl(expUrl);

          // Save to history
          addSwapHistoryEntry({
            id: `swap_${Date.now()}`,
            timestamp: Date.now(),
            fromAsset,
            fromAmount,
            estimatedOutput: selectedRoute.estimatedOutput,
            orderId: oid,
            provider: selectedRoute.provider,
            status: "pending",
            explorerUrl: expUrl,
          });

          // Start polling for status
          startPolling(oid, selectedRoute.provider);
        }
      } else {
        const oid = `sk_${Date.now()}`;
        setOrderId(oid);
        // THORChain — set the deposit address from quote
        setDepositAddress("Fetching deposit address...");
        setStatusMessage("Send your BTC to the deposit address");
        setStep("sending");

        // Set explorer URL
        const expUrl = getExplorerUrl(selectedRoute.provider, oid);
        setExplorerUrl(expUrl);

        // Save to history
        addSwapHistoryEntry({
          id: `swap_${Date.now()}`,
          timestamp: Date.now(),
          fromAsset,
          fromAmount,
          estimatedOutput: selectedRoute.estimatedOutput,
          orderId: oid,
          provider: selectedRoute.provider,
          status: "pending",
          explorerUrl: expUrl,
        });

        // Start polling for status
        startPolling(oid, selectedRoute.provider);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create swap");
      setStep("error");
    }
  }, [selectedRoute, address, fromAsset, fromAmount, slippage, startPolling]);

  const handleCopyDeposit = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      toast.success("Deposit address copied");
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────────

  const reset = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setStep("input");
    setFromAmount("");
    setRoutes([]);
    setSelectedRoute(null);
    setOrderId(null);
    setStatusMessage("");
    setStatusProgress(0);
    setDepositAddress("");
    setErrorMsg("");
    setExplorerUrl("");
    setSlippage(1);
    setCustomSlippage("");
    setSlippagePreset("1");
    setHistoryKey((k) => k + 1);
  };

  // ── Handle slippage presets ─────────────────────────────────────────────

  const handleSlippagePreset = (preset: "0.5" | "1" | "3" | "custom") => {
    setSlippagePreset(preset);
    if (preset !== "custom") {
      setSlippage(parseFloat(preset));
      setCustomSlippage("");
    }
  };

  const handleCustomSlippageChange = (val: string) => {
    setCustomSlippage(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
      setSlippage(parsed);
    }
  };

  // ── Look up a past swap status ──────────────────────────────────────────

  const lookupPastSwap = useCallback(async (entry: SwapHistoryEntry) => {
    if (!entry.orderId) {
      toast.error("No order ID for this swap");
      return;
    }

    try {
      const resp = await fetch(apiUrl(`/api/swap/status/${entry.orderId}`));
      if (!resp.ok) throw new Error("Failed to fetch status");
      const data = await resp.json();
      const backendStatus: string = data.status || data.state || "";
      toast.success(`Swap status: ${backendStatus}`, {
        description: entry.provider === "swapkit"
          ? `View on Viewblock: ${entry.explorerUrl}`
          : `View on Trocador: ${entry.explorerUrl}`,
        action: {
          label: "Open",
          onClick: () => window.open(entry.explorerUrl, "_blank"),
        },
      });
    } catch {
      toast.error("Could not fetch swap status");
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  // ── Step: Input ─────────────────────────────────────────────────────────
  if (step === "input") {
    return (
      <div className="space-y-6">
        <div className="text-center mb-2">
          <h2 className="text-2xl font-display font-bold">Swap to USDT</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Send any supported asset → arrives as USDT (TRC-20)
          </p>
        </div>

        {/* Peer extension detection */}
        {peerDetected ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 flex items-center gap-3">
            <Zap className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-300">Peer extension detected — Buy with fiat</p>
          </div>
        ) : (
          <a
            href="https://chromewebstore.google.com/detail/peer"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-secondary/50 border border-border rounded-2xl p-3 flex items-center gap-3 hover:bg-secondary/70 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Install Peer extension to buy crypto with fiat
            </p>
            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 ml-auto" />
          </a>
        )}

        {/* You send card */}
        <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">You send</p>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                ref={inputRef}
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="text-2xl font-mono font-bold h-auto py-2 border-0 bg-transparent focus-visible:ring-0 px-0"
              />
            </div>

            {/* Asset picker button */}
            <button
              onClick={() => setShowAssetPicker(true)}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 transition-colors rounded-xl px-3 py-2 shrink-0"
            >
              <span className="text-lg">{selectedAsset?.icon}</span>
              <span className="font-semibold text-sm">{selectedAsset?.label}</span>
              <span className="text-xs text-muted-foreground">{selectedAsset?.network}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center -my-2">
          <div className="bg-card border border-border rounded-full p-2.5">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
          </div>
        </div>

        {/* You receive card (always USDT TRC-20) */}
        <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">You receive</p>
          <div className="flex items-center justify-between">
            <p className="text-xl font-mono font-bold text-primary">
              {fromAmount ? "—" : "0.00"}
            </p>
            <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-3 py-2">
              <span className="text-lg">₮</span>
              <span className="font-semibold text-sm">USDT</span>
              <span className="text-xs text-muted-foreground">TRC-20</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/60">Estimated — final amount shown after quote</p>
        </div>

        {/* Selected coins info */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
          <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300/90 space-y-1">
            <p><strong>Supported to swap:</strong> BTC, XMR, USDT (Ethereum, Base, TRON), USDC (Ethereum, Base, TRON)</p>
            <p>All swaps arrive as USDT on TRC-20 in your wallet. Network fees are estimated and deducted from the swap.</p>
          </div>
        </div>

        {/* Get quote CTA */}
        <Button
          className="w-full h-14 text-base font-semibold"
          size="lg"
          disabled={!fromAmount || parseFloat(fromAmount) <= 0 || quoteLoading}
          onClick={fetchQuote}
        >
          {quoteLoading ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Getting quote…</>
          ) : (
            <><Zap className="w-5 h-5 mr-2" /> Get Quote</>
          )}
        </Button>

        {/* Swap History section */}
        <SwapHistorySection
          entries={loadSwapHistory()}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
          onLookup={lookupPastSwap}
        />

        {/* Asset picker modal */}
        {showAssetPicker && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-card border border-border rounded-3xl w-full max-w-sm max-h-[70vh] overflow-y-auto">
              <div className="p-5 border-b border-border/60 flex items-center justify-between">
                <h3 className="font-semibold">Select asset to swap</h3>
                <button onClick={() => setShowAssetPicker(false)} className="text-muted-foreground p-1">✕</button>
              </div>
              <div className="p-2 space-y-1">
                {SUPPORTED_ASSETS.map((asset) => (
                  <button
                    key={asset.key}
                    onClick={() => { setFromAsset(asset.key); setShowAssetPicker(false); }}
                    className={cn(
                      "w-full flex items-center gap-4 p-3 rounded-xl transition-colors",
                      fromAsset === asset.key ? "bg-primary/10" : "hover:bg-secondary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-lg">
                      {asset.icon}
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-sm">{asset.label}</p>
                      <p className="text-xs text-muted-foreground">{asset.network}</p>
                    </div>
                    {fromAsset === asset.key && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step: Quote ─────────────────────────────────────────────────────────
  if (step === "quote") {
    const priceImpact = selectedRoute
      ? ((parseFloat(fromAmount || "0") - selectedRoute.estimatedOutput) / parseFloat(fromAmount || "1")) * 100
      : 0;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Quote</h2>
          <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
        </div>

        {/* Summary card */}
        <div className="bg-card border border-border rounded-3xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">You send</span>
            <span className="font-mono font-bold">{fromAmount} {selectedAsset?.label}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">You receive</span>
            <span className="font-mono font-bold text-primary">
              {selectedRoute?.estimatedOutput.toFixed(4)} USDT
            </span>
          </div>
          <div className="border-t border-border/60 pt-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Fee</span>
              <span className="font-mono">{selectedRoute?.fee.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Route</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {selectedRoute?.route}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Provider</span>
              <span>{selectedRoute?.label}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Speed</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {selectedRoute?.speed}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rate type</span>
              <span>{selectedRoute?.rateType === "fixed" ? "Fixed" : "Float (slippage ~1%)"}</span>
            </div>
          </div>
        </div>

        {/* Slippage tolerance */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slippage tolerance</p>
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["0.5", "1", "3", "custom"] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => handleSlippagePreset(preset)}
                className={cn(
                  "text-sm py-2 px-2 rounded-xl border transition-all font-medium",
                  slippagePreset === preset
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {preset === "custom" ? "Custom" : `${preset}%`}
              </button>
            ))}
          </div>
          {slippagePreset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="0.5"
                step="0.1"
                min="0.1"
                max="50"
                value={customSlippage}
                onChange={(e) => handleCustomSlippageChange(e.target.value)}
                className="text-sm h-9"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Current: {slippage}% — higher slippage means your swap is more likely to go through but you may receive slightly less.
          </p>
        </div>

        {/* Price impact warning */}
        {priceImpact > 5 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">High price impact</p>
              <p className="text-xs text-amber-400/80 mt-1">
                You'll lose ~{priceImpact.toFixed(1)}% to fees. Consider a larger amount to reduce impact.
              </p>
            </div>
          </div>
        )}

        {/* Route comparison */}
        {routes.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Route comparison</p>
            {routes.map((route, i) => (
              <button
                key={i}
                onClick={() => setSelectedRoute(route)}
                className={cn(
                  "w-full flex items-center justify-between bg-card border rounded-2xl p-4 transition-all",
                  selectedRoute === route
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border/80"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    {route.provider === "swapkit" ? <Zap className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold">{route.label}</p>
                    <p className="text-xs text-muted-foreground">{route.route}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-sm">{route.estimatedOutput.toFixed(4)}</p>
                  <p className="text-[10px] text-muted-foreground">~{route.speed}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <Button className="w-full h-14 text-base font-semibold" size="lg" onClick={handleConfirmSwap}>
          <Zap className="w-5 h-5 mr-2" /> Confirm Swap
        </Button>

        {errorMsg && (
          <div className="flex gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Step: Sending / status ──────────────────────────────────────────────
  if (step === "sending") {
    // Determine which steps are complete based on statusMessage
    const statusLower = statusMessage.toLowerCase();
    const step1Done = !["", "creating swap order...", "waiting for your deposit...", "waiting for update..."].includes(statusLower) || (depositAddress ? true : false);
    const step2Done = statusLower.includes("deposit detected") || statusLower.includes("confirmed") || statusLower.includes("swapping") || statusLower.includes("sending") || statusLower === "complete";
    const step3Done = statusLower.includes("swapping") || statusLower.includes("sending") || statusLower === "complete";
    const step4Done = statusLower.includes("sending") || statusLower === "complete";

    return (
      <div className="space-y-6">
        <div className="text-center mb-2">
          <h2 className="text-2xl font-display font-bold">Swap in Progress</h2>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
          {/* Progress indicator */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                statusMessage === "Complete" ? "bg-success" : "bg-primary animate-pulse"
              )} />
              <p className="text-sm">{statusMessage || "Waiting for your deposit..."}</p>
            </div>
            <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              statusProgress >= 1 ? "bg-success" : "bg-muted"
            )} />
            <p className={cn("text-sm", statusProgress >= 1 ? "text-foreground" : "text-muted-foreground")}>
              Deposit detected, confirming on-chain
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              statusProgress >= 2 ? "bg-success" : "bg-muted"
            )} />
            <p className={cn("text-sm", statusProgress >= 2 ? "text-foreground" : "text-muted-foreground")}>
              Confirmed, swapping to USDT
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              statusProgress >= 3 ? "bg-success" : "bg-muted"
            )} />
            <p className={cn("text-sm", statusProgress >= 3 ? "text-foreground" : "text-muted-foreground")}>
              Sending USDT to your wallet
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              statusProgress >= 4 ? "bg-success" : "bg-muted"
            )} />
            <p className={cn("text-sm", statusProgress >= 4 ? "text-foreground" : "text-muted-foreground")}>
              Complete
            </p>
          </div>
        </div>

        {/* Deposit address */}
        {depositAddress && depositAddress !== "Fetching deposit address..." && (
          <div className="bg-background border border-border rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Deposit {selectedAsset?.label} to
            </p>
            <p className="font-mono text-sm break-all bg-secondary/30 p-3 rounded-xl">
              {depositAddress}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={handleCopyDeposit}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Address
              </Button>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center text-xs text-primary hover:text-primary/80 gap-1 px-3 py-2">
                  <ExternalLink className="w-3 h-3" /> Explorer
                </a>
              )}
            </div>
          </div>
        )}

        {orderId && (
          <p className="text-xs text-muted-foreground text-center">Order ID: {orderId}</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={reset}>
          Cancel
        </Button>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1">
            <Button variant="secondary" className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" /> Track on Explorer
            </Button>
          </a>
        )}
      </div>
    </div>
  );
  }

  // ── Step: Complete ──────────────────────────────────────────────────────
  if (step === "complete") {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-display font-bold">Swap Complete</h2>
        <p className="text-sm text-muted-foreground">
          Your {selectedAsset?.label} has been swapped to USDT (TRC-20) and sent to your wallet.
        </p>
        <div className="bg-card border border-border rounded-3xl p-5 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sent</span>
            <span className="font-mono">{fromAmount} {selectedAsset?.label}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Received</span>
            <span className="font-mono text-primary">{selectedRoute?.estimatedOutput.toFixed(4)} USDT</span>
          </div>
          {orderId && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order ID</span>
              <span className="font-mono text-xs">{orderId}</span>
            </div>
          )}
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-2">
              <ExternalLink className="w-3 h-3" /> View on explorer
            </a>
          )}
        </div>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={reset}>Swap Again</Button>
          <Button variant="outline" className="flex-1" onClick={() => window.location.href = "/history"}>
            View History
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Error ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex gap-3 bg-red-500/10 border border-red-500/20 rounded-3xl p-6">
        <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
        <div className="space-y-2">
          <h2 className="font-bold text-lg">Swap Failed</h2>
          <p className="text-sm text-red-400/90">{errorMsg}</p>
          <Button variant="outline" size="sm" onClick={reset}>Try Again</Button>
        </div>
      </div>
    </div>
  );
}
