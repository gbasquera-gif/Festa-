import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Themes from "@/pages/Themes";
import Products from "@/pages/Products";
import Kits from "@/pages/Kits";
import Reservations from "@/pages/Reservations";
import Events from "@/pages/Events";
import Users from "@/pages/Users";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!user) {
    return <Redirect to="/login" />;
  }
  return <AdminLayout>{children}</AdminLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/temas">
        <Protected>
          <Themes />
        </Protected>
      </Route>
      <Route path="/produtos">
        <Protected>
          <Products />
        </Protected>
      </Route>
      <Route path="/kits">
        <Protected>
          <Kits />
        </Protected>
      </Route>
      <Route path="/reservas">
        <Protected>
          <Reservations />
        </Protected>
      </Route>
      <Route path="/eventos">
        <Protected>
          <Events />
        </Protected>
      </Route>
      <Route path="/clientes">
        <Protected>
          <Users />
        </Protected>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}
