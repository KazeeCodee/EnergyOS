import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AdminShell } from "./components/layout/AdminShell";
import { AppShell } from "./components/layout/AppShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { isCurrentUserAdmin } from "./services/adminData";
import { syncSessionFromSupabase } from "./utils/session";
import Access from "./pages/Access";
import Compliance from "./pages/Compliance";
import Contracts from "./pages/Contracts";
import Costs from "./pages/Costs";
import Dashboard from "./pages/Dashboard";
import Migration from "./pages/Migration";
import Empresas from "./pages/admin/Empresas";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CargaMensual from "./pages/admin/CargaMensual";
import Consolidado from "./pages/admin/Consolidado";

function PrivateRoute() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    syncSessionFromSupabase()
      .then((session) => {
        if (active) setAuthenticated(Boolean(session));
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return <LoadingScreen messages={["Validando sesion...", "Cargando EnergyOS..."]} />;
  }
  if (!authenticated) return <Navigate replace to="/" />;
  return <AppShell />;
}

function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    syncSessionFromSupabase()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          setAuthenticated(false);
          setAdmin(false);
          return;
        }

        setAuthenticated(true);
        const isAdmin = await isCurrentUserAdmin();
        if (active) setAdmin(isAdmin);
      })
      .catch(() => {
        if (active) {
          setAuthenticated(false);
          setAdmin(false);
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
    return <LoadingScreen messages={["Validando acceso admin...", "Cargando backoffice..."]} />;
  }
  if (!authenticated) return <Navigate replace to="/acceso" />;
  if (!admin) return <Navigate replace to="/dashboard" />;
  return <AdminShell />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Access />} path="/" />
      <Route element={<Access />} path="/acceso" />
      <Route element={<PrivateRoute />}>
        <Route element={<Dashboard />} path="/dashboard" />
        <Route element={<Compliance />} path="/compliance" />
        <Route element={<Contracts />} path="/contratos" />
        <Route element={<Costs />} path="/costos" />
        <Route element={<Migration />} path="/migracion" />
      </Route>
      <Route element={<AdminRoute />}>
        <Route element={<Navigate replace to="/admin/empresas" />} path="/admin" />
        <Route element={<Empresas />} path="/admin/empresas" />
        <Route element={<AdminDashboard />} path="/admin/dashboard" />
        <Route element={<Consolidado />} path="/admin/consolidado" />
        <Route element={<CargaMensual />} path="/admin/carga-mensual" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
