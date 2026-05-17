import { Link, useLocation } from "wouter";
import { useWallet } from "@/context/WalletContext";
import { Wallet, Send, ArrowDownToLine, History, QrCode, ShieldAlert, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { InstallPWA } from "@/components/ui/InstallPWA";


interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { logout } = useWallet();

  const navItems = [
    { href: "/dashboard", label: "Wallet", icon: Wallet },
    { href: "/send", label: "Send", icon: Send },
    { href: "/receive", label: "Receive", icon: ArrowDownToLine },
    { href: "/history", label: "History", icon: History },
    { href: "/pay", label: "Buy", icon: QrCode },
    { href: "/backup", label: "Backup", icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background visual effects */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/80 backdrop-blur-3xl mask-image-gradient" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-background/60 backdrop-blur-md border-b border-white/5 py-4 px-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 rounded-[22%] drop-shadow-md" />
          <h1 className="font-display font-bold text-xl tracking-tight text-white">Gasless</h1>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <button 
            onClick={logout}
            className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Lock Wallet</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 w-full max-w-lg mx-auto pb-24 px-4 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <InstallPWA />

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
        <nav className="max-w-lg mx-auto pointer-events-auto">
          <div className="glass-panel rounded-2xl flex justify-between items-center p-2 px-4 shadow-2xl">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="flex-1 group">
                  <div className="flex flex-col items-center gap-1 py-2 relative">
                    {isActive && (
                      <motion.div 
                        layoutId="nav-pill" 
                        className="absolute inset-0 bg-white/10 rounded-xl -z-10" 
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className={cn(
                      "w-6 h-6 transition-all duration-300", 
                      isActive ? "text-primary scale-110 shadow-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    <span className={cn(
                      "text-[10px] font-medium transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
