import type { Session } from "../types";
import { assertSupabaseConfig, supabase } from "../lib/supabase";

const KEY = "eos_session";

export type TrialStatus = {
  isTrial: boolean;
  expiresAt: string | null;
};

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

async function enforceTrialGate(userId: string) {
  const { data, error } = await supabase
    .from("trial_accounts")
    .select("status, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return;
  if (!data) return;

  const expired = new Date(data.expires_at).getTime() <= Date.now();
  if (data.status !== "active" || expired) {
    await supabase.auth.signOut();
    sessionStorage.removeItem(KEY);
    throw new Error(
      expired
        ? "Tu cuenta de prueba expiró. Contactanos para renovarla."
        : "Tu cuenta de prueba ya no está activa.",
    );
  }
}

export async function syncSessionFromSupabase() {
  assertSupabaseConfig();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user?.email) {
    sessionStorage.removeItem(KEY);
    return null;
  }
  await enforceTrialGate(user.id);
  return cacheSession({ email: user.email, empresa: "" });
}

async function provisionTrialUser(email: string, password: string) {
  const response = await supabase.functions.invoke("trial-login", {
    body: { email, password },
  });

  const data = response.data as { ok?: boolean; user_id?: string; expires_at?: string; error?: string } | null;
  const ctx = response.error as { context?: Response } | null;
  let serverMessage: string | undefined = data?.error ?? undefined;

  if (!serverMessage && ctx?.context && typeof ctx.context.json === "function") {
    try {
      const parsed = (await ctx.context.json()) as { error?: string } | null;
      serverMessage = parsed?.error ?? undefined;
    } catch {
      serverMessage = undefined;
    }
  }

  if (response.error) {
    throw new Error(serverMessage ?? "Credenciales inválidas.");
  }

  return data as { ok: boolean; user_id: string; expires_at: string };
}

export async function setSession(email: string, password: string) {
  assertSupabaseConfig();
  const normalizedEmail = email.trim().toLowerCase();

  const firstAttempt = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  let signInData = firstAttempt.data;
  let signInError = firstAttempt.error;

  if (signInError) {
    await provisionTrialUser(normalizedEmail, password);
    const retry = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    signInData = retry.data;
    signInError = retry.error;
  }

  if (signInError) throw signInError;
  const user = signInData.user;
  if (!user) throw new Error("No pudimos validar tu acceso.");

  await enforceTrialGate(user.id);

  const session: Session = { email: user.email ?? normalizedEmail, empresa: "" };
  return cacheSession(session);
}

export type CurrentTrial = {
  expiresAt: string;
  status: string;
  fullName: string | null;
  company: string | null;
};

export async function getCurrentTrial(): Promise<CurrentTrial | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("trial_accounts")
    .select("expires_at, status, full_name, company")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    expiresAt: data.expires_at,
    status: data.status,
    fullName: data.full_name ?? null,
    company: data.company ?? null,
  };
}

export async function clearSession() {
  sessionStorage.removeItem(KEY);
  await supabase.auth.signOut();
}
