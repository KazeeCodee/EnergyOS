import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  Flame,
  History,
  Home,
  LogOut,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import { NavLink, useNavigate, useOutlet } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { clearSession, getCurrentTrial } from "../../utils/session";
import { Logo } from "../ui/Logo";
import { Skeleton } from "../ui/Skeleton";

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

const appNav = [
  { to: "/app",                   label: "Inicio",                icon: Home,       exact: true  },
  { to: "/app/exposicion-spot",   label: "Exposición Spot",       icon: Flame,      exact: false },
  { to: "/app/cumplimiento-renovable", label: "Renovables 27.191", icon: Zap,       exact: false },
  { to: "/app/perfil-carga",      label: "Perfil de Carga",       icon: TrendingUp, exact: false },
  { to: "/app/historia",          label: "Historia Energética",   icon: History,    exact: false },
  { to: "/app/mercado",           label: "Mercado Eléctrico",     icon: BarChart3,  exact: false },
];

const bottomNav = [
  { to: "/app/ajustes", label: "Ajustes", icon: Settings },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function NavItem({
  to,
  label,
  icon: Icon,
  exact,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  exact: boolean;
}) {
  return (
    <NavLink
      end={exact}
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-[#15caca]/10 text-[#0e8a8a] font-semibold"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
              isActive
                ? "bg-[#15caca] text-white shadow-sm"
                : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
            }`}
          >
            <Icon size={15} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const { agente, status } = useAppContext();
  const navigate = useNavigate();
  const [isTrial, setIsTrial] = useState(false);
  const showAgenteSkeleton = !agente && status === "loading";

  useEffect(() => {
    getCurrentTrial().then((trial) => {
      if (trial) setIsTrial(true);
    });
  }, []);

  const logout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <aside className="sticky top-0 h-screen hidden w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
        <Logo compact />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            isTrial ? "bg-amber-100 text-amber-700" : "bg-[#15caca]/10 text-[#0e8a8a]"
          }`}
        >
          {isTrial ? "Trial" : "Cliente"}
        </span>
      </div>

      {/* Agente vinculado */}
      {agente ? (
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Building2 size={12} />
            <span className="uppercase tracking-wider font-semibold">Empresa</span>
          </div>
          <p className="text-sm font-semibold text-[#163759] leading-snug line-clamp-2">
            {agente.descripcion}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 font-mono">{agente.nemo}</p>
        </div>
      ) : showAgenteSkeleton ? (
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Building2 size={12} />
            <span className="uppercase tracking-wider font-semibold">Empresa</span>
          </div>
          <Skeleton height={14} width="80%" className="mb-1.5" />
          <Skeleton height={10} width="50%" />
        </div>
      ) : null}

      {/* Nav principal */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          Módulos
        </p>
        {appNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Nav inferior */}
      <div className="border-t border-slate-100 px-3 py-3 space-y-0.5">
        {bottomNav.map((item) => (
          <NavItem key={item.to} {...item} exact={false} />
        ))}
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150 group"
          onClick={logout}
          type="button"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 group-hover:bg-red-100 group-hover:text-red-500 transition-all">
            <LogOut size={15} />
          </span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile Header (top bar en mobile)
// ---------------------------------------------------------------------------

function MobileHeader() {
  const { agente, status } = useAppContext();
  const navigate = useNavigate();

  const logout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <Logo compact />
        {agente ? (
          <span className="max-w-[160px] truncate text-xs font-semibold text-slate-600">
            {agente.descripcion}
          </span>
        ) : !agente && status === "loading" ? (
          <Skeleton height={12} width={120} />
        ) : null}
      </div>
      <button
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
        onClick={logout}
        type="button"
        aria-label="Cerrar sesión"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Mobile Bottom Nav
// ---------------------------------------------------------------------------

function MobileBottomNav() {
  const mobileNav = [
    { to: "/app",                        label: "Inicio",   icon: Home,       exact: true  },
    { to: "/app/exposicion-spot",        label: "Spot",     icon: Flame,      exact: false },
    { to: "/app/cumplimiento-renovable", label: "27.191",   icon: Zap,        exact: false },
    { to: "/app/perfil-carga",           label: "Carga",    icon: TrendingUp, exact: false },
    { to: "/app/historia",               label: "Historia", icon: History,    exact: false },
    { to: "/app/mercado",                label: "Mercado",  icon: BarChart3,  exact: false },
    { to: "/app/ajustes",                label: "Ajustes",  icon: Settings,   exact: false },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white lg:hidden">
      {mobileNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              isActive ? "text-[#0e8a8a]" : "text-slate-400"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Shell Frame
// ---------------------------------------------------------------------------

export function AppShell() {
  const outlet = useOutlet();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />

        <main className="flex-1 px-4 py-6 pb-24 md:px-6 lg:pb-6">
          <div className="mx-auto max-w-6xl">{outlet}</div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
