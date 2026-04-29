export type UserRole =
  | "gran_consumidor"
  | "generador"
  | "distribuidor"
  | "comercializador"
  | "analista";

export type OnboardingStep = "role" | "agente" | "verify" | "done";

export type RoleInOrg = "owner" | "viewer" | "analyst";

export type VerificationSource = "self" | "email_domain" | "document" | "manual";

export type MyProfile = {
  userId: string;
  role: UserRole | null;
  onboardingStep: OnboardingStep;
  fullName: string | null;
  displayName: string | null;
  acceptedTermsAt: string | null;
  agentesCount: number;
  createdAt: string;
};

export type LinkedAgente = {
  id: string;
  nemo: string;
  descripcion: string;
  tipoAgente: string;
  agrupacion: string | null;
  roleInOrg: RoleInOrg;
  verifiedAt: string | null;
  createdAt: string;
};

export type AgenteSearchResult = {
  nemo: string;
  descripcion: string;
  agrupacion: string | null;
  tipoAgente: string;
};

// Tipos de agente CAMMESA que califican como "gran consumidor".
// Usado en el step 3 del onboarding para filtrar el catálogo (8.721 agentes).
export const GRAN_CONSUMIDOR_TIPOS: string[] = [
  "Gran Usuario Mayor (GUMA)",
  "Gran Usuario Menor (GUME)",
  "Gran Usuario Particular (GUPA)",
  "GRAN DEMANDA EN DISTRIBUIDOR",
  "Autogenerador",
  "Cogenerador",
];

export const GENERADOR_TIPOS: string[] = ["Generador", "Cogenerador"];

export const DISTRIBUIDOR_TIPOS: string[] = [
  "Distribuidor",
  "DISTRIBUIDOR MENOR (DIME)",
  "Cooperativa",
];

export const COMERCIALIZADOR_TIPOS: string[] = [
  "Comercializador de Demanda",
  "Comercializador de Generacion",
];

export function tiposForRole(role: UserRole): string[] | null {
  switch (role) {
    case "gran_consumidor":
      return GRAN_CONSUMIDOR_TIPOS;
    case "generador":
      return GENERADOR_TIPOS;
    case "distribuidor":
      return DISTRIBUIDOR_TIPOS;
    case "comercializador":
      return COMERCIALIZADOR_TIPOS;
    case "analista":
      return null; // analista puede vincular cualquier agente
  }
}
