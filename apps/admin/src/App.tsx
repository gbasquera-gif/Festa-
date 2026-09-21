import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Reservations from "@/pages/Reservations";
import Events from "@/pages/Events";
import Users from "@/pages/Users";
import Acervo from "@/pages/Acervo";
import Comercial from "@/pages/Comercial";
import Disponibilidade from "@/pages/Disponibilidade";
import ProximasAcoes from "@/pages/ProximasAcoes";
import NovaReservaManual from "@/pages/NovaReservaManual";
import EditarReserva from "@/pages/EditarReserva";
import Comprovante from "@/pages/Comprovante";
import Financeiro from "@/pages/Financeiro";
import NovoOrcamento from "@/pages/NovoOrcamento";
import OrcamentoDetalhe from "@/pages/OrcamentoDetalhe";
import Proposta from "@/pages/Proposta";

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

      {/* A proposta da cliente. Fora do `Protected` de propósito: ela chega
          pelo WhatsApp e abre sem conta. A barreira é o token do link. */}
      <Route path="/proposta/:token">
        {(params) => <Proposta token={params.token} />}
      </Route>

      <Route path="/comercial/orcamentos/novo">
        <Protected>
          <NovoOrcamento />
        </Protected>
      </Route>
      <Route path="/comercial/orcamentos/:id/editar">
        {(params) => (
          <Protected>
            <NovoOrcamento id={params.id} />
          </Protected>
        )}
      </Route>
      <Route path="/comercial/orcamentos/:id">
        {(params) => (
          <Protected>
            <OrcamentoDetalhe id={params.id} />
          </Protected>
        )}
      </Route>
      <Route path="/">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/financeiro">
        <Protected>
          <Financeiro />
        </Protected>
      </Route>
      {/* Comercial abriga o Funil. A rota antiga continua valendo: quem tem
          "/funil" salvo cai na aba certa em vez de num 404. */}
      <Route path="/comercial/:aba?">
        <Protected>
          <Comercial />
        </Protected>
      </Route>
      <Route path="/funil">{() => <Redirect to="/comercial/funil" />}</Route>

      <Route path="/disponibilidade">
        <Protected>
          <Disponibilidade />
        </Protected>
      </Route>

      {/* Acervo reúne Temas, Produtos e Kits. As três rotas antigas
          redirecionam para a aba correspondente. */}
      <Route path="/acervo/:aba?">
        <Protected>
          <Acervo />
        </Protected>
      </Route>
      <Route path="/temas">{() => <Redirect to="/acervo/temas" />}</Route>
      <Route path="/produtos">{() => <Redirect to="/acervo/produtos" />}</Route>
      <Route path="/kits">{() => <Redirect to="/acervo/kits" />}</Route>

      <Route path="/operacao">
        <Protected>
          <ProximasAcoes />
        </Protected>
      </Route>
      <Route path="/reservas/nova">
        <Protected>
          <NovaReservaManual />
        </Protected>
      </Route>
      <Route path="/reservas/:id/editar">
        <Protected>
          <EditarReserva />
        </Protected>
      </Route>
      <Route path="/reservas/:id/comprovante">
        <Protected>
          <Comprovante />
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
