import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { fetchInformeInicio } from "../services/informeInicio";
import { loadOnboardingState } from "../services/onboarding";
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

type LoadedAppState = {
  status: AppStatus;
  profile: MyProfile | null;
  agente: LinkedAgente | null;
  ultimoMesDisponible: string;
};

function unauthenticatedAppState(): LoadedAppState {
  return { status: "unauthenticated", profile: null, agente: null, ultimoMesDisponible: "" };
}

async function loadAppState(): Promise<LoadedAppState> {
  // 1. Verificar sesión Supabase
  let session: Awaited<ReturnType<typeof syncSessionFromSupabase>>;
  try {
    session = await syncSessionFromSupabase();
  } catch {
    return unauthenticatedAppState();
  }

  if (!session) {
    return unauthenticatedAppState();
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
  const requestSeq = useRef(0);
  const authUserId = useRef<string | null>(null);
  const authReloadTimer = useRef<number | null>(null);

  const applyState = useCallback((state: LoadedAppState) => {
    setStatus(state.status);
    setProfile(state.profile);
    setAgente(state.agente);
    setUltimoMesDisponible(state.ultimoMesDisponible);
  }, []);

  const resetUserState = useCallback(() => {
    setStatus("unauthenticated");
    setProfile(null);
    setAgente(null);
    setUltimoMesDisponible("");
  }, []);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    try {
      const state = await loadAppState();
      if (seq !== requestSeq.current) return;
      applyState(state);
    } catch {
      if (seq === requestSeq.current) resetUserState();
    }
  }, [applyState, resetUserState]);

  // Recarga sesión, perfil y agente para evitar estado cruzado entre usuarios.
  const refresh = load;

  useEffect(() => {
    const scheduleLoad = () => {
      if (authReloadTimer.current) window.clearTimeout(authReloadTimer.current);
      authReloadTimer.current = window.setTimeout(() => {
        authReloadTimer.current = null;
        void load();
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;

      if (event === "SIGNED_OUT" || !nextUserId) {
        authUserId.current = null;
        requestSeq.current += 1;
        if (authReloadTimer.current) window.clearTimeout(authReloadTimer.current);
        authReloadTimer.current = null;
        resetUserState();
        return;
      }

      const changedUser = nextUserId !== authUserId.current;
      authUserId.current = nextUserId;

      if (event === "INITIAL_SESSION" || event === "USER_UPDATED" || changedUser) {
        scheduleLoad();
      }
    });

    return () => {
      requestSeq.current += 1;
      if (authReloadTimer.current) window.clearTimeout(authReloadTimer.current);
      subscription.unsubscribe();
    };
  }, [load, resetUserState]);

  return (
    <AppContext.Provider value={{ status, profile, agente, ultimoMesDisponible, refresh }}>
      {children}
    </AppContext.Provider>
  );
}
