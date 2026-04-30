import { lazy, Suspense, useEffect, useState } from "react";
import { Building2, RotateCcw } from "lucide-react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AdminShell } from "./components/layout/AdminShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { Logo } from "./components/ui/Logo";
import { useAppContext } from "./context/AppContext";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminModule1 from "./pages/admin/AdminModule1";
import AdminModule2 from "./pages/admin/AdminModule2";
import AdminModule3 from "./pages/admin/AdminModule3";
import AdminModule4 from "./pages/admin/AdminModule4";
import SystemOverview from "./pages/admin/SystemOverview";
import Access from "./pages/Access";
import { isCurrentUserAdmin } from "./services/adminData";
import { unlinkUserAgente } from "./services/onboarding";
import { getCurrentTrial, getSession, syncSessionFromSupabase } from "./utils/session";

// ---------------------------------------------------------------------------
// Lazy client pages (code splitting)
// ---------------------------------------------------------------------------
const AppOnboarding      = lazy(() => import("./pages/app/AppOnboarding"));
const AppHome            = lazy(() => import("./pages/app/AppHome"));
const ModuloExposicion   = lazy(() => import("./pages/app/ModuloExposicionSpot"));
const ModuloCumplimiento = lazy(() => import("./pages/app/ModuloCumplimiento"));
const ModuloPerfilCarga  = lazy(() => import("./pages/app/ModuloPerfilCarga"));
const ModuloHistoria     = lazy(() => import("./pages/app/ModuloHistoria"));
const ModuloMercado      = lazy(() => import("./pages/app/ModuloMercado"));
const AppAjustes         = lazy(() => import("./pages/app/AppAjustes"));

const clientLoading = <LoadingScreen messages={["Cargando módulo..."]} />;

function UnsupportedAgentRoute() {
  const { agente, refresh } = useAppContext();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const reselectAgent = async () => {
    if (!agente) {
      await refresh();
      navigate("/app", { replace: true });
      return;
    }

    setWorking(true);
    setError("");
    try {
      await unlinkUserAgente(agente.nemo);
      await refresh();
      navigate("/app", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos liberar la empresa vinculada.");
      setWorking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo compact />
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Revisar empresa
          </span>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#15caca]/10 text-[#0e8a8a]">
          <Building2 size={22} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-[#163759]">Esta empresa todavia no tiene dashboard publicado</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {agente?.descripcion ?? "La empresa vinculada"} figura como {agente?.tipoAgente ?? "un tipo de agente"}.
          Por ahora EnergyOS publica datos de clientes GUMA y GUME. Para continuar, elegi una empresa con datos
          disponibles en el buscador.
        </p>

        {agente ? (
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-[#163759]">{agente.descripcion}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{agente.nemo}</p>
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163759] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0d2136] disabled:opacity-50"
          disabled={working}
          onClick={reselectAgent}
          type="button"
        >
          <RotateCcw size={16} />
          {working ? "Preparando buscador..." : "Elegir otra empresa"}
        </button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppRoute — guard para /app/*
// Lee el estado ya resuelto por AppContextProvider (sin fetch extra).
// ---------------------------------------------------------------------------
function AppRoute() {
  const { status } = useAppContext();

  if (status === "loading") {
    return <LoadingScreen messages={["Verificando acceso...", "Preparando tu cuenta..."]} />;
  }
  if (status === "unauthenticated") {
    return <Navigate replace to="/" />;
  }
  if (status === "onboarding") {
    return (
      <Suspense fallback={clientLoading}>
        <AppOnboarding />
      </Suspense>
    );
  }
  if (status === "unsupported_agent") {
    return <UnsupportedAgentRoute />;
  }

  // status === "ready"
  return (
    <Suspense fallback={clientLoading}>
      <AppShell />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// AdminRoute — idéntico al original
// ---------------------------------------------------------------------------
function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(() => Boolean(getSession()));
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    syncSessionFromSupabase()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          setAuthenticated(false);
          setAuthorized(false);
          return;
        }
        setAuthenticated(true);
        const [hasAdmin, trial] = await Promise.all([isCurrentUserAdmin(), getCurrentTrial()]);
        if (active) setAuthorized(hasAdmin || Boolean(trial));
      })
      .catch(() => {
        if (active) {
          setAuthenticated(false);
          setAuthorized(false);
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return <LoadingScreen messages={["Validando acceso...", "Cargando consola del sistema..."]} />;
  }
  if (!authenticated) return <Navigate replace to="/" />;
  if (!authorized) return <Navigate replace to="/" />;
  return <AdminShell />;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <Routes>
      {/* Login */}
      <Route element={<Access />} path="/" />
      <Route element={<Access />} path="/acceso" />

      {/* App cliente — /app/* */}
      <Route element={<AppRoute />} path="/app">
        <Route
          index
          element={<Suspense fallback={clientLoading}><AppHome /></Suspense>}
        />
        <Route
          path="exposicion-spot"
          element={<Suspense fallback={clientLoading}><ModuloExposicion /></Suspense>}
        />
        <Route
          path="cumplimiento-renovable"
          element={<Suspense fallback={clientLoading}><ModuloCumplimiento /></Suspense>}
        />
        <Route
          path="perfil-carga"
          element={<Suspense fallback={clientLoading}><ModuloPerfilCarga /></Suspense>}
        />
        <Route
          path="historia"
          element={<Suspense fallback={clientLoading}><ModuloHistoria /></Suspense>}
        />
        <Route
          path="mercado"
          element={<Suspense fallback={clientLoading}><ModuloMercado /></Suspense>}
        />
        <Route
          path="ajustes"
          element={<Suspense fallback={clientLoading}><AppAjustes /></Suspense>}
        />
      </Route>

      {/* Admin — intacto */}
      <Route element={<Navigate replace to="/admin" />} path="/trial" />
      <Route element={<AdminRoute />} path="/admin">
        <Route element={<SystemOverview />} index />
        <Route element={<AdminModule1 />} path="modulo-1" />
        <Route element={<AdminModule2 />} path="modulo-2" />
        <Route element={<AdminModule3 />} path="modulo-3" />
        <Route element={<AdminModule4 />} path="modulo-4" />
        <Route element={<AdminAnalytics />} path="analitica" />
      </Route>
      <Route element={<Navigate replace to="/admin" />} path="/dashboard" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
