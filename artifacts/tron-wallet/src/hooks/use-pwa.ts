import { useState, useEffect, useRef } from "react";

// ── Install Prompt ────────────────────────────────────────────────────────────

export function useInstallPWA() {
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!promptRef.current) return false;
    promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === "accepted") setCanInstall(false);
    return outcome === "accepted";
  };

  return { canInstall, install };
}

// ── Push Notifications ────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type NotifState = "unsupported" | "denied" | "default" | "subscribed" | "loading";

export function usePushNotifications(address: string | null) {
  const [state, setState] = useState<NotifState>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setSubscription(sub);
          setState("subscribed");
        } else {
          setState("default");
        }
      });
    });
  }, []);

  const subscribe = async () => {
    if (!address) return;
    setState("loading");
    try {
      const keyRes = await fetch("/api/push/vapid-key");
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, subscription: sub.toJSON() }),
      });

      setSubscription(sub);
      setState("subscribed");
    } catch (err) {
      console.error("Subscribe failed:", err);
      setState(Notification.permission === "denied" ? "denied" : "default");
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return;
    setState("loading");
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setState("default");
    } catch (err) {
      console.error("Unsubscribe failed:", err);
      setState("subscribed");
    }
  };

  const toggle = () => (state === "subscribed" ? unsubscribe() : subscribe());

  return { state, toggle, subscribe, unsubscribe };
}
