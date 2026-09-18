import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Boxes,
  CalendarCheck,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Home,
  ListChecks,
  LogOut,
  Menu,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * A navegação, em grupos.
 *
 * Antes eram onze destinos numa pilha só, todos com o mesmo peso visual —
 * Temas, Produtos e Kits ocupando três linhas do mesmo nível que Financeiro.
 * Os grupos dizem o que é operação, o que é comercial e o que é acervo sem
 * precisar de mais cor: o rótulo e o espaço fazem a hierarquia.
 *
 * Dentro de cada grupo a ordem é alfabética quando isso não atrapalha o
 * fluxo. Em OPERAÇÃO, "Próximas ações" vem primeiro de propósito: é a tela
 * que responde "o que eu faço agora", e ordenar por letra a jogaria para o
 * meio da lista.
 */
type ItemDoMenu = {
  href: string;
  label: string;
  icon: LucideIcon;
  somenteAdmin?: boolean;
};

const GRUPOS: { titulo: string | null; itens: ItemDoMenu[] }[] = [
  {
    titulo: null,
    itens: [{ href: "/", label: "Visão Geral", icon: Home }],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/operacao", label: "Próximas ações", icon: ListChecks },
      { href: "/disponibilidade", label: "Disponibilidade", icon: TriangleAlert },
      { href: "/eventos", label: "Eventos", icon: CalendarDays },
      { href: "/reservas", label: "Reservas", icon: CalendarCheck },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/comercial", label: "Comercial", icon: TrendingUp },
    ],
  },
  {
    titulo: "Acervo",
    itens: [{ href: "/acervo", label: "Acervo", icon: Boxes }],
  },
  {
    titulo: "Financeiro",
    itens: [
      /**
       * Só para ADMIN. Quem monta a festa precisa saber o que entregar e
       * quando, não a margem do negócio — e o endpoint recusa OPS de
       * qualquer forma, então deixar o item visível só entregaria um 403.
       */
      { href: "/financeiro", label: "Financeiro", icon: Wallet, somenteAdmin: true },
    ],
  },
];

const TODOS = GRUPOS.flatMap((g) => g.itens);

/** O nome da tela atual, para o cabeçalho do celular dizer onde a pessoa está. */
function tituloDaRota(location: string): string {
  if (location.startsWith("/reservas/nova")) return "Nova reserva";
  const item = TODOS.find((i) => i.href !== "/" && location.startsWith(i.href));
  if (item) return item.label;
  return location === "/" ? "Visão Geral" : "Painel";
}

/** Um item está ativo na própria rota e nas rotas que descendem dela. */
function estaAtivo(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function Marca({ recolhida }: { recolhida?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {/* Recolhida, mostra só a caixinha da marca — a parte que se reconhece
          em 68px. Expandida, a assinatura inteira, sem recorte e sem esticar. */}
      {recolhida ? (
        <span
          className="block h-9 w-9 shrink-0"
          role="img"
          aria-label="Festaê"
          style={{
            backgroundImage: "url(/marca-festae.webp)",
            backgroundSize: "auto 150%",
            backgroundPosition: "left center",
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : (
        <img
          src="/marca-festae.webp"
          alt="Festaê"
          width={1983}
          height={793}
          className="h-auto w-[150px] max-w-full"
        />
      )}
      {!recolhida && (
        <span className="text-[0.68rem] font-medium leading-tight" style={{ color: "#9a9086" }}>
          Painel de Gestão
        </span>
      )}
    </div>
  );
}

function Navegacao({
  recolhida,
  aoNavegar,
}: {
  recolhida?: boolean;
  aoNavegar?: () => void;
}) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <nav className="flex-1 overflow-y-auto" aria-label="Seções do painel">
      {GRUPOS.map((grupo, i) => {
        const itens = grupo.itens.filter(
          (item) => !item.somenteAdmin || user?.role === "ADMIN",
        );
        if (itens.length === 0) return null;
        return (
          <div key={grupo.titulo ?? `g${i}`}>
            {grupo.titulo && <p className="painel-nav-grupo">{grupo.titulo}</p>}
            <div className="flex flex-col gap-0.5">
              {itens.map(({ href, label, icon: Icon }) => {
                const ativo = estaAtivo(location, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={aoNavegar}
                    aria-current={ativo ? "page" : undefined}
                    title={recolhida ? label : undefined}
                    className="painel-item"
                  >
                    <Icon className="size-[18px]" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Rodape({ recolhida }: { recolhida?: boolean }) {
  const { user, logout } = useAuth();
  const iniciais = (user?.name ?? "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mt-auto border-t pt-3" style={{ borderColor: "var(--color-line, #e8dfd5)" }}>
      <div className={`flex items-center gap-2 px-1 ${recolhida ? "justify-center" : ""}`}>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-medium"
          style={{ background: "rgba(27,46,75,0.08)", color: "var(--color-navy)" }}
          title={recolhida ? `${user?.name} · ${user?.role}` : undefined}
        >
          {iniciais || "?"}
        </span>
        {!recolhida && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--color-navy)" }}>
              {user?.name}
            </span>
            <span className="painel-periodo">{user?.role}</span>
          </span>
        )}
      </div>
      <button
        onClick={logout}
        title={recolhida ? "Sair" : undefined}
        className={`painel-item mt-1 w-full ${recolhida ? "" : ""}`}
      >
        <LogOut className="size-[18px]" />
        <span>Sair</span>
      </button>
    </div>
  );
}

const CHAVE_RECOLHIDA = "festae:sidebar-recolhida";

/**
 * A casca do painel.
 *
 * A barra lateral fixa é boa no computador e inviável no celular: num iPhone
 * em pé ela sozinha comeria dois terços da tela. No celular ela vira gaveta;
 * no computador ela recolhe para ícones, e o estado fica no navegador de quem
 * usa — quem trabalha em tela pequena não quer reabrir o menu toda vez.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [gaveta, setGaveta] = useState(false);
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDA) === "1";
    } catch {
      // Navegador com armazenamento bloqueado abre expandida: é o padrão bom.
      return false;
    }
  });

  useEffect(() => setGaveta(false), [location]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_RECOLHIDA, recolhida ? "1" : "0");
    } catch {
      /* preferência é conveniência, não pode derrubar a tela */
    }
  }, [recolhida]);

  useEffect(() => {
    document.body.style.overflow = gaveta ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [gaveta]);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-cream, #fdf9f4)" }}>
      {/* Computador: barra fixa, recolhível. */}
      <aside
        className={`hidden shrink-0 flex-col border-r px-3 py-5 lg:flex ${recolhida ? "painel-recolhida w-[68px]" : "w-60"}`}
        style={{ borderColor: "var(--color-line, #e8dfd5)", background: "#fff" }}
      >
        <div className={`mb-6 flex items-center ${recolhida ? "justify-center" : "justify-between"} px-1`}>
          <Marca recolhida={recolhida} />
          {!recolhida && (
            <button
              onClick={() => setRecolhida(true)}
              aria-label="Recolher menu"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60"
            >
              <ChevronsLeft className="size-4" />
            </button>
          )}
        </div>
        {recolhida && (
          <button
            onClick={() => setRecolhida(false)}
            aria-label="Expandir menu"
            className="mb-3 flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}
        <Navegacao recolhida={recolhida} />
        <Rodape recolhida={recolhida} />
      </aside>

      {/* Celular: gaveta por cima, nunca a barra do computador espremida. */}
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r px-3 py-4 shadow-xl"
            style={{ borderColor: "var(--color-line, #e8dfd5)", background: "#fff" }}
          >
            <div className="mb-5 flex items-start justify-between px-1">
              <Marca />
              <button
                aria-label="Fechar menu"
                onClick={() => setGaveta(false)}
                className="-mr-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60"
              >
                <X className="size-5" />
              </button>
            </div>
            <Navegacao aoNavegar={() => setGaveta(false)} />
            <Rodape />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-40 flex items-center gap-2 border-b px-2 py-2 backdrop-blur lg:hidden"
          style={{ borderColor: "var(--color-line, #e8dfd5)", background: "rgba(253,249,244,0.95)" }}
        >
          <button
            aria-label="Abrir menu"
            onClick={() => setGaveta(true)}
            className="flex size-11 items-center justify-center rounded-lg hover:bg-muted/60"
            style={{ color: "var(--color-navy)" }}
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate font-semibold" style={{ color: "var(--color-navy)" }}>
            {tituloDaRota(location)}
          </span>
          <img src="/marca-festae.webp" alt="Festaê" width={1983} height={793} className="ml-auto h-auto w-[104px] pr-1" />
        </header>

        {/* min-w-0 no pai é o que permite o conteúdo encolher: sem ele, uma
            tabela larga estica o flex e devolve a rolagem lateral. */}
        <main className="min-w-0 flex-1 p-4 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
