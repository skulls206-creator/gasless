import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, X } from "lucide-react";
import { useIframeDetect } from "@/hooks/use-iframe-detect";

const STORAGE_KEY = "khurk_os_banner_dismissed";

export function KhurkOSBanner() {
  const isInIframe = useIframeDetect();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "true",
  );

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  const applyTheme = () => {
    document.documentElement.setAttribute("data-khurk", "true");
    sessionStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  if (!isInIframe || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed top-0 left-0 right-0 z-[999] flex items-center justify-between gap-3 px-4 py-3 bg-[#0e1929]/95 border-b border-cyan-500/30 backdrop-blur-md shadow-lg shadow-black/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-sm text-white/90 leading-snug truncate">
            Looks like you're in{" "}
            <span className="font-semibold text-cyan-400">KHURK OS</span>,
            want to change the theme to fit?
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={applyTheme}
            className="text-xs font-semibold text-[#0e1929] bg-cyan-400 hover:bg-cyan-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
