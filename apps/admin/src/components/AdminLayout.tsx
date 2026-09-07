import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ListChecks,
  LayoutDashboard,
  Palette,
  Package,
  Boxes,
  CalendarCheck,
  CalendarDays,
  Users,
  TriangleAlert,
  TrendingUp,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/operacao", label: "Próximas ações", icon: ListChecks },
  { href: "/reservas", label: "Reservas", icon: CalendarCheck },
  { href: "/disponibilidade", label: "Disponibilidade", icon: TriangleAlert },
  { href: "/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/temas", label: "Temas", icon: Palette },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/kits", label: "Kits", icon: Boxes },
  { href: "/funil", label: "Funil", icon: TrendingUp },
];

/** O nome da tela atual, para o cabeçalho do celular dizer onde a pessoa está. */
function tituloDaRota(location: string): string {
  if (location.startsWith("/reservas/nova")) return "Nova reserva";
  const item = NAV_ITEMS.find((i) => i.href !== "/" && location.startsWith(i.href));
  return item?.label ?? "Painel";
}

function Marca() {
  return (
    <div>
      <span className="text-xl font-extrabold text-navy">
        Festa<span className="text-coral">ê!</span>
      </span>
      <p className="text-xs text-muted-foreground">Painel administrativo</p>
    </div>
  );
}

/**
 * O menu, com alvos de toque de 44px.
 *
 * A mesma lista serve a barra lateral do computador e a gaveta do celular:
 * duas cópias divergem na primeira tela nova que alguém acrescenta em um
 * lugar e esquece no outro.
 */
function Menu_({ onNavegar }: { onNavegar?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavegar}
              className={cn(
                // min-h-11 = 44px, o mínimo que um dedo acerta sem erro.
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border pt-4">
        <p className="px-2 text-sm font-medium">{user?.name}</p>
        <p className="px-2 text-xs text-muted-foreground">{user?.role}</p>
        <button
          onClick={logout}
          className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
    </>
  );
}

/**
 * A casca do painel.
 *
 * A barra lateral fixa de 256px é boa no computador e inviável no celular:
 * num iPhone em pé ela sozinha come dois terços da tela, e o conteúdo ficava
 * espremido em 70px úteis — o motivo real de a operação precisar girar o
 * aparelho para trabalhar.
 *
 * No celular ela vira gaveta: sai do fluxo, aparece por cima quando chamada e
 * fecha ao navegar. O conteúdo passa a ter a largura inteira da tela.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [gaveta, setGaveta] = useState(false);

  // Trocar de tela fecha a gaveta. Sem isto, quem toca num item continua
  // olhando para o menu e acha que o toque não funcionou.
  useEffect(() => setGaveta(false), [location]);

  // Fundo travado enquanto a gaveta está aberta: rolar a página por baixo de
  // um menu aberto é o tipo de coisa que faz a pessoa perder o lugar.
  useEffect(() => {
    document.body.style.overflow = gaveta ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [gaveta]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Computador: barra fixa. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <div className="mb-8 px-2">
          <Marca />
        </div>
        <Menu_ />
      </aside>

      {/* Celular: gaveta por cima. */}
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 shadow-xl">
            <div className="mb-6 flex items-start justify-between">
              <Marca />
              <button
                aria-label="Fechar menu"
                onClick={() => setGaveta(false)}
                className="-mr-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
              >
                <X className="size-5" />
              </button>
            </div>
            <Menu_ onNavegar={() => setGaveta(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho só do celular: abre a gaveta e diz onde a pessoa está. */}
        <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur lg:hidden">
          <button
            aria-label="Abrir menu"
            onClick={() => setGaveta(true)}
            className="flex size-11 items-center justify-center rounded-lg text-navy hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate font-bold text-navy">{tituloDaRota(location)}</span>
          <span className="ml-auto pr-2 text-lg font-extrabold text-navy">
            Festa<span className="text-coral">ê!</span>
          </span>
        </header>

        {/* min-w-0 no pai é o que permite o conteúdo encolher: sem ele, uma
            tabela larga estica o flex e devolve a rolagem lateral. */}
        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
