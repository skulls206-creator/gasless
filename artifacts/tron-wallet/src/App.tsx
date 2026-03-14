import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Send } from "@/pages/Send";
import { Receive } from "@/pages/Receive";
import { History } from "@/pages/History";
import { Pay } from "@/pages/Pay";
import { Backup } from "@/pages/Backup";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard() {
  const { isLoggedIn, hasWallet } = useWallet();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // If not logged in and trying to access private routes
    if (!isLoggedIn) {
      if (hasWallet && location !== "/login") {
        setLocation("/login");
      } else if (!hasWallet && !["/", "/create", "/import"].includes(location)) {
        setLocation("/");
      }
    } else {
      // If logged in and on public routes, go to dashboard
      if (["/", "/login", "/create", "/import"].includes(location)) {
        setLocation("/dashboard");
      }
    }
  }, [isLoggedIn, hasWallet, location, setLocation]);

  if (!isLoggedIn) {
    return (
      <Switch>
        <Route path="/" component={Welcome} />
        <Route path="/create" component={CreateAccount} />
        <Route path="/import" component={ImportWallet} />
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
