import { supabase } from "../lib/supabase";
import type {
  AgenteSearchResult,
  LinkedAgente,
  MyProfile,
  OnboardingStep,
  RoleInOrg,
  UserRole,
} from "../types/onboarding";

// Filas crudas devueltas por las RPCs (snake_case desde Postgres)
type ProfileRow = {
  user_id: string;
  role: UserRole | null;
  onboarding_step: OnboardingStep;
  full_name: string | null;
  display_name: string | null;
  accepted_terms_at: string | null;
  agentes_count: number;
  created_at: string;
};

type AgenteRow = {
  id: string;
  nemo: string;
  descripcion: string;
  tipo_agente: string;
  agrupacion: string | null;
  role_in_org: RoleInOrg;
  verified_at: string | null;
  created_at: string;
};

type SearchRow = {
  nemo: string;
  descripcion: string;
  agrupacion: string | null;
  tipo_agente: string;
};

type LinkRow = {
  id: string;
  nemo: string;
  descripcion: string;
  tipo_agente: string;
  agrupacion: string | null;
};

type SetRoleRow = {
  user_id: string;
  role: UserRole;
  onboarding_step: OnboardingStep;
};

function mapProfile(row: ProfileRow): MyProfile {
  return {
    userId: row.user_id,
    role: row.role,
    onboardingStep: row.onboarding_step,
    fullName: row.full_name,
    displayName: row.display_name,
    acceptedTermsAt: row.accepted_terms_at,
    agentesCount: row.agentes_count,
    createdAt: row.created_at,
  };
}

function mapAgente(row: AgenteRow): LinkedAgente {
  return {
    id: row.id,
    nemo: row.nemo,
    descripcion: row.descripcion,
    tipoAgente: row.tipo_agente,
    agrupacion: row.agrupacion,
    roleInOrg: row.role_in_org,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

function mapSearch(row: SearchRow): AgenteSearchResult {
  return {
    nemo: row.nemo,
    descripcion: row.descripcion,
    agrupacion: row.agrupacion,
    tipoAgente: row.tipo_agente,
  };
}

// =============================================================================
// PERFIL
// =============================================================================

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc("me_profile");
  if (error) throw error;
  const rows = (data ?? []) as ProfileRow[];
  if (rows.length === 0) return null;
  return mapProfile(rows[0]);
}

export async function setUserRole(role: UserRole): Promise<{
  userId: string;
  role: UserRole;
  onboardingStep: OnboardingStep;
}> {
  const { data, error } = await supabase.rpc("set_user_role", { p_role: role });
  if (error) throw error;
  const rows = (data ?? []) as SetRoleRow[];
  if (rows.length === 0) {
    throw new Error("set_user_role no devolvió perfil actualizado.");
  }
  const row = rows[0];
  return {
    userId: row.user_id,
    role: row.role,
    onboardingStep: row.onboarding_step,
  };
}

export async function acceptTerms(): Promise<string> {
  const { data, error } = await supabase.rpc("accept_terms");
  if (error) throw error;
  return (data as string) ?? new Date().toISOString();
}

// =============================================================================
// CATÁLOGO DE AGENTES (paso 3: search)
// =============================================================================

export type SearchAgentesOptions = {
  limit?: number;
  tipos?: string[] | null; // si null/undefined no filtra
};

export async function searchAgentes(
  q: string,
  opts: SearchAgentesOptions = {},
): Promise<AgenteSearchResult[]> {
  const { limit = 12, tipos = null } = opts;
  const { data, error } = await supabase.rpc("search_cammesa_agentes", {
    p_q: q,
    p_limit: limit,
    p_tipos: tipos,
  });
  if (error) throw error;
  return ((data ?? []) as SearchRow[]).map(mapSearch);
}

// =============================================================================
// VÍNCULO USER <-> AGENTE
// =============================================================================

export async function linkUserAgente(
  nemo: string,
  roleInOrg: RoleInOrg = "owner",
): Promise<{
  id: string;
  nemo: string;
  descripcion: string;
  tipoAgente: string;
  agrupacion: string | null;
}> {
  const { data, error } = await supabase.rpc("link_user_agente", {
    p_nemo: nemo,
    p_role_in_org: roleInOrg,
  });
  if (error) throw error;
  const rows = (data ?? []) as LinkRow[];
  if (rows.length === 0) {
    throw new Error("link_user_agente no devolvió la fila vinculada.");
  }
  const row = rows[0];
  return {
    id: row.id,
    nemo: row.nemo,
    descripcion: row.descripcion,
    tipoAgente: row.tipo_agente,
    agrupacion: row.agrupacion,
  };
}

export async function unlinkUserAgente(nemo: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("unlink_user_agente", { p_nemo: nemo });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchMyAgentes(): Promise<LinkedAgente[]> {
  const { data, error } = await supabase.rpc("me_agentes");
  if (error) throw error;
  return ((data ?? []) as AgenteRow[]).map(mapAgente);
}

// =============================================================================
// HELPERS DE ALTO NIVEL
// =============================================================================

// Conveniencia: estado completo del onboarding para que el front decida en qué
// step parar al cargar la app.
export type OnboardingState = {
  profile: MyProfile | null;
  agentes: LinkedAgente[];
  nextStep: OnboardingStep;
};

export async function loadOnboardingState(): Promise<OnboardingState> {
  const profile = await fetchMyProfile();
  const agentes = profile && profile.agentesCount > 0 ? await fetchMyAgentes() : [];
  const nextStep = computeNextStep(profile, agentes.length);
  return { profile, agentes, nextStep };
}

function computeNextStep(profile: MyProfile | null, agentesCount: number): OnboardingStep {
  if (!profile) return "role";
  if (!profile.role) return "role";
  if (agentesCount === 0) return "agente";
  if (!profile.acceptedTermsAt) return "verify";
  return "done";
}
