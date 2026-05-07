import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AdminShell } from "./components/layout/AdminShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { ModuleSkeleton } from "./components/ui/Skeleton";
import { useAppContext } from "./context/AppContext";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminModule1 from "./pages/admin/AdminModule1";
import AdminModule2 from "./pages/admin/AdminModule2";
import AdminModule3 from "./pages/admin/AdminModule3";
import AdminModule4 from "./pages/admin/AdminModule4";
import SystemOverview from "./pages/admin/SystemOverview";
import Access from "./pages/Access";
import RecoverPassword from "./pages/RecoverPassword";
import ResetPassword from "./pages/ResetPassword";
import { isCurrentUserAdmin } from "./services/adminData";
import { getCurrentTrial, getSession, syncSessionFromSupabase } from "./utils/session";
import type { PremiumModuleKey } from "./utils/trialAccess";

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
const ModuloAuditoriaDte = lazy(() => import("./pages/app/ModuloAuditoriaDte"));
const AppAjustes         = lazy(() => import("./pages/app/AppAjustes"));

// Skeleton inline en lugar de LoadingScreen full-screen (evita parpadeo entre módulos).
const clientLoading = <ModuleSkeleton />;

// ---------------------------------------------------------------------------
// AppRoute — guard para /app/*
// Lee el estado ya resuelto por AppContextProvider (sin fetch extra).
// ---------------------------------------------------------------------------
function AppRoute() {
  const { status } = useAppContext();

  // unauthenticated → kickout. Resto (loading + ready) montan AppShell con
  // skeletons internos. Evita pantalla negra full-screen entre login y dashboard.
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

  // status === "loading" o "ready" → shell visible, contenido se llena cuando hay data.
  return (
    <Suspense fallback={clientLoading}>
      <AppShell />
    </Suspense>
  );
}

function TrialPremiumRoute({
  moduleKey,
  children,
}: {
  moduleKey: PremiumModuleKey;
  children: ReactNode;
}) {
  const [checking, setChecking] = useState(true);
  const [isTrial, setIsTrial] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentTrial()
      .then((trial) => {
        if (active) setIsTrial(Boolean(trial));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) return clientLoading;
  if (isTrial) return <Navigate replace to={`/app?premium=${moduleKey}`} />;
  return <>{children}</>;
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
        const hasAdmin = await isCurrentUserAdmin();
        if (active) setAuthorized(hasAdmin);
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

      {/* Recuperación de contraseña */}
      <Route element={<RecoverPassword />} path="/recuperar" />
      <Route element={<ResetPassword />} path="/reset-password" />

      {/* App cliente — /app/* */}
      <Route element={<AppRoute />} path="/app">
        <Route
          index
          element={<Suspense fallback={clientLoading}><AppHome /></Suspense>}
        />
        <Route
          path="exposicion-spot"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="exposicion-spot"><ModuloExposicion /></TrialPremiumRoute></Suspense>}
        />
        <Route
          path="cumplimiento-renovable"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="cumplimiento-renovable"><ModuloCumplimiento /></TrialPremiumRoute></Suspense>}
        />
        <Route
          path="perfil-carga"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="perfil-carga"><ModuloPerfilCarga /></TrialPremiumRoute></Suspense>}
        />
        <Route
          path="historia"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="historia"><ModuloHistoria /></TrialPremiumRoute></Suspense>}
        />
        <Route
          path="mercado"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="mercado"><ModuloMercado /></TrialPremiumRoute></Suspense>}
        />
        <Route
          path="auditoria-dte"
          element={<Suspense fallback={clientLoading}><TrialPremiumRoute moduleKey="auditoria-dte"><ModuloAuditoriaDte /></TrialPremiumRoute></Suspense>}
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
