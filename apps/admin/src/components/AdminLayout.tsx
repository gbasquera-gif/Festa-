import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/temas", label: "Temas", icon: Palette },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/kits", label: "Kits", icon: Boxes },
  { href: "/reservas", label: "Reservas", icon: CalendarCheck },
  { href: "/disponibilidade", label: "Disponibilidade", icon: TriangleAlert },
  { href: "/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/funil", label: "Funil", icon: TrendingUp },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
        <div className="mb-8 px-2">
          <span className="text-xl font-extrabold text-navy">
            Festa<span className="text-coral">ê!</span>
          </span>
          <p className="text-xs text-muted-foreground">Painel administrativo</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
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
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
