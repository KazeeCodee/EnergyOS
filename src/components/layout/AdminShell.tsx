import {
  Building2,
  CalendarRange,
  Database,
  LayoutGrid,
  LogOut,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useNavigate, useOutlet } from "react-router-dom";
import { AdminProvider, useAdminContext } from "../../context/AdminContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { isCurrentUserAdmin, listAdminEmpresasOptions } from "../../services/adminData";
import { clearSession, getSession } from "../../utils/session";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { LoadingScreen } from "../ui/LoadingScreen";
import { Logo } from "../ui/Logo";
import { Panel } from "../ui/Panel";

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const adminNav = [
  { to: "/admin/empresas", label: "Empresas", icon: Building2 },
  { to: "/admin/consolidado", label: "Consolidado", icon: LayoutGrid },
  { to: "/admin/carga-mensual", label: "Carga mensual", icon: Upload },
  { to: "/admin/corridas", label: "Corridas", icon: CalendarRange },
  { to: "/admin/datos-raw", label: "Datos RAW", icon: Database },
];

async function loadAdminShellData() {
  const [isAdmin, empresas] = await Promise.all([
    isCurrentUserAdmin(),
    listAdminEmpresasOptions(),
  ]);
  return { isAdmin, empresas };
}

function Sidebar() {
  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-navy-border bg-navy-soft lg:flex lg:flex-col">
      <div className="border-b border-navy-border px-5 py-5">
        <div className="flex items-center gap-3">
          <Logo compact />
          <Badge tone="plan">Admin</Badge>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-5">
        {adminNav.map((item) => (
          <NavLink
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-3 text-sm transition ${
                isActive
                  ? "border-l-2 border-forest bg-forest/15 text-ivory"
                  : "text-mist hover:bg-navy-border/45 hover:text-ivory"
              }`
            }
            key={item.to}
            to={item.to}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function EmptyAdminState() {
  return (
    <Panel className="p-6">
      <h2 className="font-fraunces text-2xl font-bold text-ivory">Panel admin listo</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
        El shell de administracion ya quedo separado del flujo cliente. En la siguiente fase
        conectamos las paginas nuevas de empresas, dashboard admin, carga mensual y datos RAW.
      </p>
    </Panel>
  );
}

function AdminAccessDenied() {
  return (
    <div className="min-h-screen bg-navy px-4 py-8 text-ivory">
      <div className="mx-auto max-w-3xl">
        <Panel className="p-8">
          <div className="flex items-center gap-3">
            <Logo compact />
            <Badge tone="warning">Acceso denegado</Badge>
          </div>
          <h2 className="mt-5 font-fraunces text-2xl font-bold text-ivory">
            Solo administradores pueden entrar al backoffice.
          </h2>
        </Panel>
      </div>
    </div>
  );
}

function AdminShellFrame({
  children,
}: {
  children?: ReactNode;
}) {
  const outlet = useOutlet();
  const session = getSession();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, loading } = useAsyncData(loadAdminShellData, { isAdmin: false, empresas: [] });
  const { filters, selectEmpresa, setPeriodo } = useAdminContext();

  useEffect(() => {
    if (filters.empresaId || data.empresas.length === 0) return;
    const firstEmpresa = data.empresas[0];
    selectEmpresa({ id: firstEmpresa.id, nombre: firstEmpresa.razon_social });
  }, [data.empresas, filters.empresaId, selectEmpresa]);

  const logout = () => {
    clearSession();
    navigate("/");
  };

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => currentYear + 1 - index);
  }, []);

  const selectedEmpresa = data.empresas.find((empresa) => empresa.id === filters.empresaId) ?? null;

  if (loading) {
    return <LoadingScreen messages={["Cargando AdminShell...", "Preparando filtros globales..."]} />;
  }

  if (!data.isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <div className="min-h-screen bg-navy text-ivory">
      {refreshing ? (
        <LoadingScreen messages={["Actualizando backoffice...", "Sincronizando empresas..."]} />
      ) : null}

      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-navy-border bg-navy px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Logo compact />
                  <Badge tone="plan">Admin</Badge>
                </div>
                <p className="mt-2 text-sm text-mist">
                  {session?.email ?? "Sesion activa"} {selectedEmpresa ? `· ${selectedEmpresa.razon_social}` : ""}
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <label className="min-w-[260px]">
                  <span className="text-[11px] font-semibold uppercase text-mist">Empresa</span>
                  <select
                    className="mt-1 w-full rounded border border-navy-border bg-navy-soft px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
                    onChange={(event) => {
                      const empresa = data.empresas.find((item) => item.id === event.target.value) ?? null;
                      selectEmpresa({
                        id: empresa?.id ?? null,
                        nombre: empresa?.razon_social ?? null,
                      });
                    }}
                    value={filters.empresaId ?? ""}
                  >
                    <option value="">Seleccionar empresa</option>
                    {data.empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.razon_social}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-[11px] font-semibold uppercase text-mist">Año</span>
                  <select
                    className="mt-1 w-full rounded border border-navy-border bg-navy-soft px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
                    onChange={(event) => setPeriodo({ anio: Number(event.target.value), mes: filters.mes })}
                    value={filters.anio}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-[11px] font-semibold uppercase text-mist">Mes</span>
                  <select
                    className="mt-1 w-full rounded border border-navy-border bg-navy-soft px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
                    onChange={(event) => setPeriodo({ anio: filters.anio, mes: Number(event.target.value) })}
                    value={filters.mes}
                  >
                    {monthLabels.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setRefreshing(true);
                      window.setTimeout(() => setRefreshing(false), 1200);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <RefreshCcw size={16} />
                    Actualizar
                  </Button>
                  <Button onClick={logout} type="button" variant="outline">
                    <LogOut size={16} />
                    Salir
                  </Button>
                </div>
              </div>
            </div>
            {selectedEmpresa ? (
              <p className="mt-3 text-xs text-mist">
                NEMOs: {selectedEmpresa.nemos.length ? selectedEmpresa.nemos.join(", ") : "Sin NEMO activo"}
              </p>
            ) : null}
            {error ? (
              <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ivory">
                {error}
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mx-auto max-w-7xl">{children ?? outlet ?? <EmptyAdminState />}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children?: ReactNode }) {
  return (
    <AdminProvider>
      <AdminShellFrame>{children}</AdminShellFrame>
    </AdminProvider>
  );
}
