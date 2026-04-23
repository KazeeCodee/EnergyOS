import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { syncSessionFromSupabase } from "./utils/session";
import Access from "./pages/Access";
import Checkout from "./pages/Checkout";
import Compliance from "./pages/Compliance";
import Contracts from "./pages/Contracts";
import Costs from "./pages/Costs";
import Dashboard from "./pages/Dashboard";
import Migration from "./pages/Migration";
import Admin from "./pages/Admin";

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

export default function App() {
  return (
    <Routes>
      <Route element={<Access />} path="/" />
      <Route element={<Access />} path="/acceso" />
      <Route element={<Checkout />} path="/contratacion" />
      <Route element={<PrivateRoute />}>
        <Route element={<Dashboard />} path="/dashboard" />
        <Route element={<Compliance />} path="/compliance" />
        <Route element={<Contracts />} path="/contratos" />
        <Route element={<Costs />} path="/costos" />
        <Route element={<Migration />} path="/migracion" />
        <Route element={<Admin />} path="/admin" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
