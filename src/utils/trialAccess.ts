export type PremiumModuleKey =
  | "exposicion-spot"
  | "cumplimiento-renovable"
  | "perfil-carga"
  | "historia"
  | "mercado"
  | "auditoria-dte";

export type PremiumModuleCopy = {
  title: string;
  eyebrow: string;
  body: string;
};

const premiumModuleCopy: Record<PremiumModuleKey, PremiumModuleCopy> = {
  "exposicion-spot": {
    title: "Exposicion Spot y Cobertura",
    eyebrow: "Modulo premium",
    body: "Este modulo muestra riesgo spot, cobertura contractual, costos implicitos y desbalances mensuales para tomar decisiones de compra de energia.",
  },
  "cumplimiento-renovable": {
    title: "Renovables 27.191",
    eyebrow: "Modulo premium",
    body: "Este modulo permite seguir la obligacion renovable, detectar brechas y estimar el impacto economico antes del cierre anual.",
  },
  "perfil-carga": {
    title: "Perfil de Carga",
    eyebrow: "Modulo premium",
    body: "Este modulo compara tu consumo en pico, valle y resto contra patrones historicos y benchmarks para encontrar oportunidades operativas.",
  },
  historia: {
    title: "Historia Energetica",
    eyebrow: "Modulo premium",
    body: "Este modulo abre el historial completo de demanda, estacionalidad, variaciones YoY y meses criticos de tu operacion.",
  },
  mercado: {
    title: "Mercado Electrico",
    eyebrow: "Modulo premium",
    body: "Este modulo suma contexto MEM, mix de generacion nacional, demanda y actividad industrial para comparar tu posicion contra el mercado.",
  },
  "auditoria-dte": {
    title: "Auditoria DTE",
    eyebrow: "Modulo premium",
    body: "Este modulo revisa liquidaciones CAMMESA, costos por MWh, conceptos e importes observables para priorizar auditoria y reclamos.",
  },
};

export function premiumModuleFromPath(pathname: string): PremiumModuleKey | null {
  const normalized = pathname.replace(/\/+$/, "");
  const key = normalized.replace(/^\/app\/?/, "") as PremiumModuleKey;
  return Object.hasOwn(premiumModuleCopy, key) ? key : null;
}

export function isTrialAllowedAppPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/app" || normalized === "/app/ajustes";
}

export function premiumRedirectForTrial(pathname: string): string | null {
  if (isTrialAllowedAppPath(pathname)) return null;
  const moduleKey = premiumModuleFromPath(pathname);
  return moduleKey ? `/app?premium=${moduleKey}` : null;
}

export function getPremiumModuleCopy(moduleKey: string | null | undefined): PremiumModuleCopy | null {
  if (!moduleKey) return null;
  return Object.hasOwn(premiumModuleCopy, moduleKey)
    ? premiumModuleCopy[moduleKey as PremiumModuleKey]
    : null;
}
