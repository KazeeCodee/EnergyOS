import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AdminShell } from "./components/layout/AdminShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { useAppContext } from "./context/AppContext";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminModule1 from "./pages/admin/AdminModule1";
import AdminModule2 from "./pages/admin/AdminModule2";
import AdminModule3 from "./pages/admin/AdminModule3";
import AdminModule4 from "./pages/admin/AdminModule4";
import SystemOverview from "./pages/admin/SystemOverview";
import Access from "./pages/Access";
import { isCurrentUserAdmin } from "./services/adminData";
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
