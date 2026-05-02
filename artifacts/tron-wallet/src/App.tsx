import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider, useWallet } from "@/context/WalletContext";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

// Pages
import { Welcome } from "@/pages/Welcome";
import { CreateAccount } from "@/pages/CreateAccount";
import { ImportWallet } from "@/pages/ImportWallet";
import { RecoverWallet } from "@/pages/RecoverWallet";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Send } from "@/pages/Send";
import { Receive } from "@/pages/Receive";
import { History } from "@/pages/History";
import { Pay } from "@/pages/Pay";
import { Backup } from "@/pages/Backup";
import { PayLink } from "@/pages/PayLink";
import { useEffect } from "react";
import { KhurkOSBanner } from "@/components/ui/KhurkOSBanner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PayLinkWrapper() {
  const params = useParams<{ address: string }>();
  return <PayLink toAddress={params.address} />;
}

function AuthGuard() {
  const { isLoggedIn, sessionRestoring, hasWallet } = useWallet();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Don't redirect until async session restore has finished — otherwise we'd
    // redirect to /login right before isLoggedIn flips to true.
    if (sessionRestoring) return;

    // Strip query string for route matching
    const path = location.split("?")[0];
    const publicRoutes = ["/", "/login", "/create", "/import", "/recover"];
    const isPayRoute = path.startsWith("/pay/");

    if (!isLoggedIn) {
      if (isPayRoute) return; // Let PayLink handle itself
      if (hasWallet && !["/login", "/create", "/import", "/recover"].includes(path)) {
        setLocation("/login");
      } else if (!hasWallet && !publicRoutes.includes(path)) {
        setLocation("/");
      }
    } else {
      // After login, check if there's a pending payment destination
      const payTo = sessionStorage.getItem("gasless_pay_to");
      if (payTo) {
        sessionStorage.removeItem("gasless_pay_to");
        setLocation(`/send?to=${encodeURIComponent(payTo)}`);
        return;
      }
      if (publicRoutes.includes(path) && !isPayRoute) {
        setLocation("/dashboard");
      }
    }
  }, [isLoggedIn, sessionRestoring, hasWallet, location, setLocation]);

  // Pay link is always accessible regardless of auth state
  if (location.startsWith("/pay/")) {
    return (
      <Switch>
        <Route path="/pay/:address" component={PayLinkWrapper} />
      </Switch>
    );
  }

  // While session restore is in-flight, render nothing — prevents a flash of
  // the login/welcome screen before isLoggedIn becomes true.
  if (sessionRestoring) return null;

  if (!isLoggedIn) {
    return (
      <Switch>
        <Route path="/" component={Welcome} />
        <Route path="/create" component={CreateAccount} />
        <Route path="/import" component={ImportWallet} />
        <Route path="/recover" component={RecoverWallet} />
        <Route path="/login" component={Login} />
        <Route component={Welcome} />
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/send" component={Send} />
        <Route path="/receive" component={Receive} />
        <Route path="/history" component={History} />
        <Route path="/pay" component={Pay} />
        <Route path="/backup" component={Backup} />
        <Route component={Dashboard} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TooltipProvider>
          <KhurkOSBanner />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGuard />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
