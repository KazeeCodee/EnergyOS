import {
  BarChart3,
  FileCheck2,
  LineChart,
  LogOut,
  Menu,
  RefreshCcw,
  Route,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getEmpresaData } from "../../services/energyData";
import type { EmpresaData } from "../../types";
import { clearSession, getSession } from "../../utils/session";
import { Button } from "../ui/Button";
import { LoadingScreen } from "../ui/LoadingScreen";
import { Logo } from "../ui/Logo";

const initialEmpresa: EmpresaData = {
  id: "",
  razon_social: "",
  nemo: "",
  tipo_usuario: "GUME",
  comercializador: "",
  plan_activo: "compliance",
  miembro_desde: "",
  acuerdo_mensual_mwh: null,
};

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/compliance", label: "Compliance", icon: FileCheck2 },
  { to: "/contratos", label: "Contratos", icon: ShieldCheck },
  { to: "/costos", label: "Costos", icon: LineChart },
  { to: "/migracion", label: "Migración al MEM", icon: Route },
];

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof BarChart3;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-3 text-sm transition ${
          isActive
            ? "border-l-2 border-forest bg-forest/15 text-ivory"
            : "text-mist hover:bg-navy-border/45 hover:text-ivory"
        }`
      }
      onClick={onNavigate}
      to={to}
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function Sidebar({
  email,
  empresa,
  onClose,
}: {
  email: string;
  empresa: EmpresaData;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-navy-border bg-navy-soft">
      <div className="flex items-center justify-between border-b border-navy-border px-6 py-5">
        <Logo compact />
        <button className="rounded p-2 text-mist lg:hidden" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-5">
        {nav.map((item) => (
          <NavItem
            icon={item.icon}
            key={item.to}
            label={item.label}
            onNavigate={onClose}
            to={item.to}
          />
        ))}
      </nav>

      <div className="border-t border-navy-border p-4">
        <div className="rounded-lg border border-navy-border bg-navy p-4">
          <p className="text-sm font-semibold text-ivory">{empresa.razon_social}</p>
          <p className="mt-2 text-xs text-mist">
            {empresa.tipo_usuario} · {empresa.nemo || "Sin NEMO"}
          </p>
          <p className="mt-1 text-xs text-mist">
            Comercializador: {empresa.comercializador || "No informado"}
          </p>
          <p className="mt-4 truncate text-xs text-mist">{email}</p>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const session = getSession();
  const { data: empresa, error: empresaError } = useAsyncData(getEmpresaData, initialEmpresa);

  const logout = useCallback(() => {
    clearSession();
    navigate("/");
  }, [navigate]);

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 2000);
  };

  return (
    <div className="min-h-screen bg-navy text-ivory">
      {refreshing ? (
        <LoadingScreen
          messages={[
            "Actualizando indicadores...",
            "Recalculando consumos...",
            "Organizando contratos...",
            "Datos actualizados ✓",
          ]}
        />
      ) : null}

      {empresaError ? (
        <section className="fixed left-1/2 top-4 z-[90] w-[min(92vw,720px)] -translate-x-1/2 rounded border border-danger/40 bg-danger/95 px-4 py-3 text-sm text-white shadow-panel">
          {empresaError}
        </section>
      ) : null}

      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <Sidebar
            email={session?.email ?? ""}
            empresa={empresa}
            onClose={() => setDrawerOpen(false)}
          />
        </div>

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <button
              aria-label="Cerrar menú"
              className="flex-1 bg-black/55"
              onClick={() => setDrawerOpen(false)}
            />
            <Sidebar
              email={session?.email ?? ""}
              empresa={empresa}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-navy-border bg-white/88 px-4 backdrop-blur md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Abrir menú"
                className="rounded border border-navy-border p-2 text-mist lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-syne text-base font-bold text-ivory md:text-lg">
                  {empresa.razon_social}
                </h1>
                <p className="text-xs text-mist">
                  {empresa.tipo_usuario} · {empresa.nemo} · {empresa.comercializador}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button className="hidden md:inline-flex" onClick={refresh} variant="ghost">
                <RefreshCcw size={16} />
                Actualizar datos
              </Button>
              <span className="hidden max-w-[220px] truncate text-sm text-mist xl:block">
                {session?.email}
              </span>
              <button
                aria-label="Cerrar sesión"
                className="rounded border border-navy-border p-2 text-mist transition hover:text-ivory"
                onClick={logout}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children ?? <Outlet />}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
