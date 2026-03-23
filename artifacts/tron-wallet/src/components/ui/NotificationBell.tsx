import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { usePushNotifications, type NotifState } from "@/hooks/use-pwa";
import { useWallet } from "@/context/WalletContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NotificationBell() {
  const { address } = useWallet();
  const { state, toggle } = usePushNotifications(address);

  if (state === "unsupported") return null;

  const labels: Record<NotifState, string> = {
    subscribed: "Notifications on — tap to disable",
    default: "Enable transaction notifications",
    denied: "Notifications blocked in browser settings",
    loading: "Updating…",
    unsupported: "",
  };

  const icon = () => {
    if (state === "loading") return <Loader2 className="w-5 h-5 animate-spin" />;
    if (state === "subscribed") return <BellRing className="w-5 h-5 text-primary" />;
    if (state === "denied") return <BellOff className="w-5 h-5 text-destructive/60" />;
    return <Bell className="w-5 h-5 text-muted-foreground" />;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={state === "denied" ? undefined : toggle}
            disabled={state === "loading" || state === "denied"}
            className="hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={labels[state]}
          >
            {icon()}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">
          {labels[state]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
