import { BarChart3, Clock, Home, LineChart, LogOut, RefreshCcw } from "lucide-react";
import { type ReactNode } from "react";
import { NavLink, useNavigate, useOutlet } from "react-router-dom";
import { useAsyncData } from "../../hooks/useAsyncData";
import { isCurrentUserAdmin } from "../../services/adminData";
import { clearSession, getCurrentTrial, getSession, type CurrentTrial } from "../../utils/session";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { LoadingScreen } from "../ui/LoadingScreen";
import { Logo } from "../ui/Logo";

const adminNav = [
  { to: "/admin", label: "Inicio", icon: Home },
  { to: "/admin/modulo-1", label: "Modulo 1", icon: LineChart },
  { to: "/admin/modulo-2", label: "Modulo 2", icon: LineChart },
  { to: "/admin/modulo-3", label: "Modulo 3", icon: LineChart },
  { to: "/admin/modulo-4", label: "Modulo 4", icon: LineChart },
  { to: "/admin/analitica", label: "Analitica", icon: BarChart3 },
];

type ShellAccess = {
  isAdmin: boolean;
  trial: CurrentTrial | null;
};

async function loadAdminShellData(): Promise<ShellAccess> {
  const [isAdmin, trial] = await Promise.all([isCurrentUserAdmin(), getCurrentTrial()]);
  return { isAdmin, trial };
}

function trialDaysRemaining(trial: CurrentTrial): number {
  const diffMs = new Date(trial.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

function Sidebar({ trial }: { trial: CurrentTrial | null }) {
  const days = trial ? trialDaysRemaining(trial) : null;
  return (
    <aside className="sticky top-0 h-screen hidden w-[250px] shrink-0 border-r border-navy-border bg-white/70 backdrop-blur lg:flex lg:flex-col">
      <div className="border-b border-navy-border px-6 py-6">
        <div className="flex items-center gap-3">
          <Logo compact />
          {trial ? (
            <Badge tone="warning">Prueba</Badge>
          ) : (
            <Badge tone="plan">Admin</Badge>
          )}
        </div>
        {trial && days !== null ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest">
            <Clock size={12} />
            {days} {days === 1 ? "día restante" : "días restantes"}
          </div>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-mist">
          Backoffice técnico para entender estructura, datos y trazabilidad del sistema.
        </p>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-5">
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-transparent text-mist hover:border-navy-border hover:bg-white hover:text-ivory"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-navy-border px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mist">Modulos activos</p>
        <p className="mt-3 text-sm leading-6 text-mist">
          Inicio del sistema, validaciones por modulo y analitica mensual consolidada.
        </p>
      </div>
    </aside>
  );
}

function AdminAccessDenied() {
  return (
    <div className="min-h-screen bg-navy px-4 py-8 text-ivory">
      <div className="mx-auto max-w-3xl rounded-lg border border-navy-border bg-navy-medium p-8 shadow-panel">
        <div className="flex items-center gap-3">
          <Logo compact />
          <Badge tone="warning">Acceso denegado</Badge>
        </div>
        <h2 className="mt-5 font-fraunces text-2xl font-bold text-ivory">
          Tu cuenta no tiene acceso al panel.
        </h2>
      </div>
    </div>
  );
}

function AdminShellFrame({ children }: { children?: ReactNode }) {
  const outlet = useOutlet();
  const navigate = useNavigate();
  const session = getSession();
  const { data, error, loading } = useAsyncData<ShellAccess>(loadAdminShellData, {
    isAdmin: false,
    trial: null,
  });

  const logout = () => {
    clearSession();
    navigate("/");
  };

  if (loading) {
    return <LoadingScreen messages={["Validando acceso...", "Preparando panel del sistema..."]} />;
  }

  if (!data.isAdmin && !data.trial) {
    return <AdminAccessDenied />;
  }

  const trial = data.trial;
  const trialDays = trial ? trialDaysRemaining(trial) : null;

  return (
    <div className="min-h-screen bg-navy text-ivory">
      <div className="flex min-h-screen">
        <Sidebar trial={trial} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-navy-border bg-white/85 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <Logo compact />
                  {trial ? (
                    <Badge tone="warning">Cuenta de prueba</Badge>
                  ) : (
                    <Badge tone="plan">Administrador</Badge>
                  )}
                  {trial && trialDays !== null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest">
                      <Clock size={12} />
                      {trialDays} {trialDays === 1 ? "día restante" : "días restantes"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-mist">
                  {session?.email ?? "Sesión activa"} ·{" "}
                  {trial
                    ? `acceso anticipado · expira el ${new Date(trial.expiresAt).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}`
                    : "modelo operativo de monitoreo"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => window.location.reload()} type="button" variant="ghost">
                  <RefreshCcw size={16} />
                  Recargar vista
                </Button>
                <Button onClick={logout} type="button" variant="outline">
                  <LogOut size={16} />
                  Salir
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ivory">
                {error}
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mx-auto max-w-7xl">{children ?? outlet}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children?: ReactNode }) {
  return <AdminShellFrame>{children}</AdminShellFrame>;
}
