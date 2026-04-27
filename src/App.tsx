import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "./components/layout/AdminShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminModule1 from "./pages/admin/AdminModule1";
import AdminModule2 from "./pages/admin/AdminModule2";
import AdminModule3 from "./pages/admin/AdminModule3";
import AdminModule4 from "./pages/admin/AdminModule4";
import SystemOverview from "./pages/admin/SystemOverview";
import Access from "./pages/Access";
import { isCurrentUserAdmin } from "./services/adminData";
import { getSession, syncSessionFromSupabase } from "./utils/session";

function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(() => Boolean(getSession()));
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
        const hasAdminAccess = await isCurrentUserAdmin();
        if (active) setAdmin(hasAdminAccess);
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
    return <LoadingScreen messages={["Validando acceso admin...", "Cargando nueva consola del sistema..."]} />;
  }
  if (!authenticated) return <Navigate replace to="/" />;
  if (!admin) return <Navigate replace to="/" />;
  return <AdminShell />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Access />} path="/" />
      <Route element={<Access />} path="/acceso" />
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
