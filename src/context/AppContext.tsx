import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { fetchInformeInicio } from "../services/informeInicio";
import { loadOnboardingState } from "../services/onboarding";
import type { InformeInicioResponse } from "../types/informeInicio";
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
  /** Informe inicio precargado en background. null mientras carga. */
  informe: InformeInicioResponse | null;
  /** Refresca el perfil y agente (p.ej. después de completar onboarding). */
  refresh: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Cache (stale-while-revalidate)
// Persistimos perfil/agente/informe por user_id en localStorage para hidratar
// instantáneo en refresh. Background fetch sincroniza si cambió algo.
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = "energyos:appcache:v1";

type CachedShape = {
  profile: MyProfile | null;
  agente: LinkedAgente | null;
  ultimoMesDisponible: string;
  informe: InformeInicioResponse | null;
};

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:${userId}`;
}

function readCache(userId: string): CachedShape | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedShape;
  } catch {
    return null;
  }
}

function writeCache(userId: string, snapshot: CachedShape): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(snapshot));
  } catch {
    // Quota exceeded o storage bloqueado: silencioso.
  }
}

function clearAllCache(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

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
  return { status: "ready", profile, agente, ultimoMesDisponible: "" };
}

// Hidratación inicial síncrona desde cache: lee userId guardado por supabase
// y, si encuentra cache, devuelve el snapshot. Evita parpadeo en refresh.
function hydrateFromCache(): { userId: string | null; snapshot: CachedShape | null } {
  try {
    // supabase-js guarda la sesión en localStorage con key tipo "sb-<projectref>-auth-token".
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const userId: string | undefined = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (userId) {
        return { userId, snapshot: readCache(userId) };
      }
    }
  } catch {
    // ignore
  }
  return { userId: null, snapshot: null };
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  // Hidratación síncrona: si hay cache, arrancamos con datos visibles + status="ready".
  // Background fetch revalida.
  const initial = hydrateFromCache();
  const hydrated = initial.snapshot;

  const [status, setStatus] = useState<AppStatus>(hydrated ? "ready" : "loading");
  const [profile, setProfile] = useState<MyProfile | null>(hydrated?.profile ?? null);
  const [agente, setAgente] = useState<LinkedAgente | null>(hydrated?.agente ?? null);
  const [ultimoMesDisponible, setUltimoMesDisponible] = useState(hydrated?.ultimoMesDisponible ?? "");
  const [informe, setInforme] = useState<InformeInicioResponse | null>(hydrated?.informe ?? null);
  const requestSeq = useRef(0);
  const authUserId = useRef<string | null>(initial.userId);
  const authReloadTimer = useRef<number | null>(null);
  // Refs para evitar deps inestables en `load` que causarían re-suscribir
  // onAuthStateChange en loop.
  const hasHydrationRef = useRef<boolean>(Boolean(hydrated?.profile || hydrated?.agente));

  const persist = useCallback((userId: string, snap: CachedShape) => {
    writeCache(userId, snap);
  }, []);

  const applyState = useCallback(
    (state: LoadedAppState) => {
      setStatus(state.status);
      setProfile(state.profile);
      setAgente(state.agente);
      setUltimoMesDisponible(state.ultimoMesDisponible);
      hasHydrationRef.current = Boolean(state.profile || state.agente);

      // Persistir snapshot básico inmediato.
      const uid = authUserId.current;
      if (uid && state.status === "ready") {
        persist(uid, {
          profile: state.profile,
          agente: state.agente,
          ultimoMesDisponible: state.ultimoMesDisponible,
          informe: null, // se rellena cuando llegue el informe
        });
      }

      // Precargar informe en background tras pasar a "ready". Sin bloquear UI.
      if (state.status === "ready" && state.agente?.nemo) {
        // No reseteamos `informe` si ya hay uno hidratado del cache: evita
        // parpadeo de los cards que ya están renderizando datos.
        void fetchInformeInicio({ nemo: state.agente.nemo })
          .then((data) => {
            setInforme(data);
            setUltimoMesDisponible(data.contexto.ultimoMesDisponible ?? "");
            if (uid) {
              persist(uid, {
                profile: state.profile,
                agente: state.agente,
                ultimoMesDisponible: data.contexto.ultimoMesDisponible ?? "",
                informe: data,
              });
            }
          })
          .catch(() => {
            // Silencioso: AppHome cae en cache previo o INITIAL_DATA.
          });
      } else if (state.status !== "ready") {
        setInforme(null);
      }
    },
    [persist],
  );

  const resetUserState = useCallback(() => {
    setStatus("unauthenticated");
    setProfile(null);
    setAgente(null);
    setUltimoMesDisponible("");
    setInforme(null);
    hasHydrationRef.current = false;
    clearAllCache();
  }, []);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    // Si hay datos hidratados/previos, NO mostrar "loading" (mantenemos UI
    // estable); solo revalidamos en background.
    const hasHydration = hasHydrationRef.current;
    if (!hasHydration) setStatus("loading");
    try {
      const state = await loadAppState();
      if (seq !== requestSeq.current) return;
      applyState(state);
    } catch {
      if (seq === requestSeq.current && !hasHydration) resetUserState();
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

      // Usuario distinto al cacheado: limpiar para evitar mezclar datos.
      if (changedUser) {
        // Mantener cache del nuevo user si existe; descartar visualmente lo del anterior.
        const next = readCache(nextUserId);
        if (next) {
          setProfile(next.profile);
          setAgente(next.agente);
          setUltimoMesDisponible(next.ultimoMesDisponible);
          setInforme(next.informe);
          setStatus("ready");
        } else {
          setProfile(null);
          setAgente(null);
          setUltimoMesDisponible("");
          setInforme(null);
          setStatus("loading");
        }
      }

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
    <AppContext.Provider value={{ status, profile, agente, ultimoMesDisponible, informe, refresh }}>
      {children}
    </AppContext.Provider>
  );
}
