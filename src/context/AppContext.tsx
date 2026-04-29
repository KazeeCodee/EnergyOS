import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchInformeInicio } from "../services/informeInicio";
import { fetchMyAgentes, fetchMyProfile, loadOnboardingState } from "../services/onboarding";
import type { LinkedAgente, MyProfile } from "../types/onboarding";
import { syncSessionFromSupabase } from "../utils/session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppStatus =
  | "loading"      // cargando sesión y perfil
  | "unauthenticated" // sin sesión válida
  | "onboarding"   // sesión ok pero onboarding incompleto
  | "ready";       // listo para mostrar la app

export type AppContextValue = {
  status: AppStatus;
  profile: MyProfile | null;
  agente: LinkedAgente | null;
  /** Último mes con datos disponibles, formato YYYY-MM. "" si aún no cargó. */
  ultimoMesDisponible: string;
  /** Refresca el perfil y agente (p.ej. después de completar onboarding). */
  refresh: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext debe usarse dentro de AppContextProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

async function loadAppState(): Promise<{
  status: AppStatus;
  profile: MyProfile | null;
  agente: LinkedAgente | null;
  ultimoMesDisponible: string;
}> {
  // 1. Verificar sesión Supabase
  let session: Awaited<ReturnType<typeof syncSessionFromSupabase>>;
  try {
    session = await syncSessionFromSupabase();
  } catch {
    return { status: "unauthenticated", profile: null, agente: null, ultimoMesDisponible: "" };
  }

  if (!session) {
    return { status: "unauthenticated", profile: null, agente: null, ultimoMesDisponible: "" };
  }

  // 2. Cargar estado de onboarding
  const { profile, agentes, nextStep } = await loadOnboardingState();

  if (nextStep !== "done") {
    return { status: "onboarding", profile, agente: null, ultimoMesDisponible: "" };
  }

  const agente = agentes[0] ?? null;

  // 3. Cargar último mes disponible (best-effort, no bloquea si falla)
  let ultimoMesDisponible = "";
  try {
    const informe = await fetchInformeInicio({ nemo: agente?.nemo });
    ultimoMesDisponible = informe.contexto.ultimoMesDisponible ?? "";
  } catch {
    // No bloqueamos la carga de la app si el informe falla
  }

  return { status: "ready", profile, agente, ultimoMesDisponible };
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [agente, setAgente] = useState<LinkedAgente | null>(null);
  const [ultimoMesDisponible, setUltimoMesDisponible] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const state = await loadAppState();
      setStatus(state.status);
      setProfile(state.profile);
      setAgente(state.agente);
      setUltimoMesDisponible(state.ultimoMesDisponible);
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  // Refresca perfil y agente sin volver a verificar sesión (post-onboarding)
  const refresh = useCallback(async () => {
    try {
      const [newProfile, agentes] = await Promise.all([fetchMyProfile(), fetchMyAgentes()]);
      setProfile(newProfile);
      setAgente(agentes[0] ?? null);

      const { nextStep } = await loadOnboardingState();
      if (nextStep === "done") {
        setStatus("ready");
        try {
          const informe = await fetchInformeInicio({ nemo: agentes[0]?.nemo });
          setUltimoMesDisponible(informe.contexto.ultimoMesDisponible ?? "");
        } catch {
          // best-effort
        }
      }
    } catch {
      // mantiene estado previo
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppContext.Provider value={{ status, profile, agente, ultimoMesDisponible, refresh }}>
      {children}
    </AppContext.Provider>
  );
}
