import { useState, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Key, Copy, Eye, EyeOff, Bell, BellOff, BellRing, Loader2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatAccountNumberInput } from "@/lib/utils";
import { apiUrl } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type AlertState = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

// ── Component ─────────────────────────────────────────────────────────────────

export function Backup() {
  const { privateKey, accountNumber, address } = useWallet();
  const { toast } = useToast();

  // Backup unlock state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Admin alerts state
  const [showAlerts, setShowAlerts] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");
  const [alertState, setAlertState] = useState<AlertState>("loading");
  const [alertWorking, setAlertWorking] = useState(false);

  // Check current admin subscription status when section is opened
  useEffect(() => {
    if (!showAlerts) return;

    // Synchronous checks first — no async needed
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setAlertState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setAlertState("denied");
      return;
    }
    // No permission yet → just show the subscribe form
    if (Notification.permission !== "granted") {
      setAlertState("unsubscribed");
      return;
    }

    // Permission already granted — check if subscribed (3 s timeout as safety net)
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAlertState("unsubscribed");
    }, 3_000);

    navigator.serviceWorker.getRegistration()
      .then(async (reg) => {
        if (cancelled) return;
        if (!reg) { clearTimeout(timeout); setAlertState("unsubscribed"); return; }

        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (!sub) { clearTimeout(timeout); setAlertState("unsubscribed"); return; }

        // Ask the server if this endpoint is registered as admin
        try {
          const res = await fetch(apiUrl("/api/push/admin-status"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-secret": adminSecret,
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (!cancelled) {
            clearTimeout(timeout);
            if (res.ok) {
              const { subscribed } = await res.json();
              setAlertState(subscribed ? "subscribed" : "unsubscribed");
            } else {
              setAlertState("unsubscribed");
            }
          }
        } catch {
          if (!cancelled) { clearTimeout(timeout); setAlertState("unsubscribed"); }
        }
      })
      .catch(() => {
        if (!cancelled) { clearTimeout(timeout); setAlertState("unsubscribed"); }
      });

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [showAlerts]); // adminSecret intentionally excluded — only re-check when section opens

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === accountNumber) {
      setIsUnlocked(true);
      toast({ title: "Access Granted" });
    } else {
      toast({ variant: "destructive", title: "Incorrect Account Number" });
    }
  };

  const handleCopy = () => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      toast({ title: "Private Key Copied", description: "Keep it safe. Never share it." });
    }
  };

  const handleSubscribeAlerts = async () => {
    if (!adminSecret.trim()) {
      toast({ variant: "destructive", title: "Admin secret required", description: "Enter your admin secret to subscribe." });
      return;
    }

    setAlertWorking(true);
    try {
      // Ensure notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setAlertState("denied");
        toast({ variant: "destructive", title: "Permission denied", description: "Enable notifications in your browser settings." });
        return;
      }

      // Get VAPID key and create subscription
      const keyRes = await fetch(apiUrl("/api/push/vapid-key"));
      if (!keyRes.ok) throw new Error("Could not fetch VAPID key");
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast Uint8Array → BufferSource: TS 5.7 requires ArrayBufferView<ArrayBuffer>,
        // but Uint8Array's generic is ArrayBufferLike. Runtime is fine.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch(apiUrl("/api/push/admin-subscribe"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret.trim(),
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });

      if (res.status === 401) {
        toast({ variant: "destructive", title: "Incorrect admin secret", description: "Double-check your secret and try again." });
        return;
      }
      if (!res.ok) throw new Error("Server error");

      setAlertState("subscribed");
      toast({ title: "Admin alerts enabled", description: "You'll be notified when sponsor TRX runs low." });
    } catch (err: any) {
      console.error("Admin subscribe failed:", err);
      toast({ variant: "destructive", title: "Subscribe failed", description: err.message ?? "Unknown error" });
    } finally {
      setAlertWorking(false);
    }
  };

  const handleUnsubscribeAlerts = async () => {
    setAlertWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(apiUrl("/api/push/unsubscribe"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setAlertState("unsubscribed");
      toast({ title: "Admin alerts disabled" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Unsubscribe failed", description: err.message });
    } finally {
      setAlertWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Backup Wallet</h2>

      <div className="bg-destructive/10 border border-destructive/20 p-5 rounded-2xl flex gap-4 text-destructive-foreground/90 shadow-lg shadow-destructive/5">
        <ShieldAlert className="w-8 h-8 text-destructive shrink-0" />
        <div className="text-sm leading-relaxed">
          <p className="font-bold text-destructive mb-1">WARNING: MASTER KEY</p>
          <p>Your Private Key controls all funds in this wallet. Anyone with this key can steal your money.</p>
          <ul className="list-disc pl-4 mt-2 opacity-80">
            <li>Never share it with anyone.</li>
            <li>We will never ask you for it.</li>
            <li>Store it offline.</li>
          </ul>
        </div>
      </div>

      {!isUnlocked ? (
        <div className="bg-card border border-border p-6 rounded-3xl mt-6">
          <h3 className="font-semibold mb-4">Verify Identity</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Please enter your 20-digit Account Number to reveal your raw private key.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4">
            <Input
              type="tel"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              value={pinInput}
              onChange={(e) => setPinInput(formatAccountNumberInput(e.target.value))}
              className="font-mono text-center tracking-widest"
              maxLength={23}
            />
            <Button type="submit" className="w-full" disabled={pinInput.length < 23}>
              Unlock Backup
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-card border border-border p-6 rounded-3xl">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-semibold text-primary flex items-center gap-2">
                <Key className="w-4 h-4" /> Raw Private Key
              </h3>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {showKey ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
              </button>
            </div>

            <div className="relative">
              <div className={`font-mono text-sm sm:text-base break-all bg-background p-4 rounded-xl border border-white/5 transition-all ${showKey ? "text-foreground" : "text-transparent select-none blur-sm"}`}>
                {privateKey}
              </div>
              {!showKey && (
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted-foreground pointer-events-none">
                  Hidden for security
                </div>
              )}
            </div>

            <Button onClick={handleCopy} className="w-full mt-4" variant="secondary">
              <Copy className="w-4 h-4 mr-2" /> Copy Private Key
            </Button>
          </div>

          <div className="bg-secondary/30 border border-white/5 p-4 rounded-2xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Public Address</p>
            <p className="font-mono text-sm break-all text-foreground/80">{address}</p>
          </div>
        </div>
      )}

      {/* ── Admin Alerts ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden">
        <button
          onClick={() => setShowAlerts((v) => !v)}
          className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <BellRing className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Admin Alerts</p>
              <p className="text-xs text-muted-foreground">Get notified when sponsor TRX runs low</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {alertState === "subscribed" && (
              <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                Active
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAlerts ? "rotate-180" : ""}`} />
          </div>
        </button>

        {showAlerts && (
          <div className="px-5 pb-5 space-y-4 border-t border-border/60 pt-4">
            {alertState === "unsupported" && (
              <p className="text-sm text-muted-foreground">
                Push notifications are not supported in this browser.
              </p>
            )}

            {alertState === "denied" && (
              <p className="text-sm text-red-400">
                Notifications are blocked. Enable them in your browser settings and reload.
              </p>
            )}

            {(alertState === "loading") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking status…
              </div>
            )}

            {(alertState === "unsubscribed" || alertState === "subscribed") && (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The server checks the sponsor wallet's TRX balance every 30 minutes.
                  If it drops below the threshold, you'll receive a push notification on this device.
                </p>

                {alertState === "unsubscribed" && (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Admin Secret
                    </label>
                    <Input
                      type="password"
                      placeholder="Enter your admin secret"
                      value={adminSecret}
                      onChange={(e) => setAdminSecret(e.target.value)}
                      className="font-mono"
                    />
                    <Button
                      className="w-full"
                      onClick={handleSubscribeAlerts}
                      disabled={alertWorking || !adminSecret.trim()}
                    >
                      {alertWorking
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subscribing…</>
                        : <><Bell className="w-4 h-4 mr-2" /> Enable Low-TRX Alerts</>
                      }
                    </Button>
                  </div>
                )}

                {alertState === "subscribed" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <BellRing className="w-5 h-5 text-amber-400 shrink-0" />
                      <p className="text-sm text-amber-300">
                        This device will receive an alert when the sponsor wallet drops below the TRX threshold.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={handleUnsubscribeAlerts}
                      disabled={alertWorking}
                    >
                      {alertWorking
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Disabling…</>
                        : <><BellOff className="w-4 h-4 mr-2" /> Disable Alerts</>
                      }
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
