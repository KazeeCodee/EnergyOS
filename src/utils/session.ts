import type { Session } from "../types";
import { assertSupabaseConfig, supabase } from "../lib/supabase";

const KEY = "eos_session";

export function getSession(): Session | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

function cacheSession(session: Session) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export async function syncSessionFromSupabase() {
  assertSupabaseConfig();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const email = data.session?.user.email;
  if (!email) {
    sessionStorage.removeItem(KEY);
    return null;
  }
  return cacheSession({ email, empresa: "" });
}

export async function setSession(email: string, password: string) {
  assertSupabaseConfig();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const session: Session = { email: data.user.email ?? email, empresa: "" };
  return cacheSession(session);
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
  void supabase.auth.signOut();
}
