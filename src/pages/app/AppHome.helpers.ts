export type InsightTone = "info" | "success" | "warning" | "danger";
export type PreviewStatus = "ok" | "watch" | "risk" | "empty";

export type HomeSpotInput = {
  pctSpot: number | null;
  pctMat: number | null;
  costoSpotPromedioPesosMwh: number | null;
  spotPesos: number | null;
};

export type HomeComplianceInput = {
  pctRenovablePromedio: number | null;
  cumpleYtd: boolean | null;
  brechaYtdMwh: number | null;
  multaEstimadaPesos: number | null;
};

export type HomeFactorInput = {
  pctPicoPromedio: number | null;
  pctVallePromedio: number | null;
  ratioPicoVallePromedio: number | null;
  pctPicoPercentilPromedio: number | null;
};

export type HomeAuditInput = {
  facturaTotalPesos: number | null;
  importeRevisablePesos: number | null;
  mesesConRevision: number | null;
  meses: number | null;
  costoPromedioPesosMwh: number | null;
};

export type HomeInsight = {
  title: string;
  body: string;
  metric: string;
  tone: InsightTone;
};

export type ModulePreview = {
  primary: string;
  secondary: string;
  status: PreviewStatus;
};

export type ModulePreviewState = {
  spot: ModulePreview;
  compliance: ModulePreview;
  factor: ModulePreview;
  audit: ModulePreview;
};

export type HomeModuleKey = "spot" | "compliance" | "factor" | "history" | "market" | "audit";

export type ExecutiveInsightInput = {
  spot?: HomeSpotInput | null;
  compliance?: HomeComplianceInput | null;
  factor?: HomeFactorInput | null;
  audit?: HomeAuditInput | null;
};

export type DisclosureMode = "full" | "preview";

export type PreviewBuildOptions = {
  disclosure?: DisclosureMode;
};

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toFixed(decimals).replace(".", ",");
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt(n * 100)}%`;
}

export function formatCompactMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  const entero = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  if (abs >= 1_000_000_000) return `$${entero(n / 1_000_000)} M`;
  if (abs >= 1_000_000) return `$${entero(n / 1_000_000)} M`;
  if (abs >= 1_000) return `$${entero(n / 1_000)} k`;
  return `$${fmt(n, 0)}`;
}

function isPreview(options?: PreviewBuildOptions): boolean {
  return options?.disclosure === "preview";
}

export function buildExecutiveInsights(input: ExecutiveInsightInput, options: PreviewBuildOptions = {}): HomeInsight[] {
  const preview = isPreview(options);
  const insights: HomeInsight[] = [];
  const spotPct = input.spot?.pctSpot ?? null;
  if (spotPct != null) {
    insights.push({
      title: spotPct > 0.7 ? "Riesgo spot alto" : spotPct > 0.4 ? "Spot bajo observacion" : "Cobertura spot controlada",
      body: spotPct > 0.7
        ? "La compra expuesta al mercado spot domina el mes y puede amplificar variaciones de precio."
        : spotPct > 0.4
          ? "La exposicion spot amerita seguimiento contra contrato y costo promedio."
          : "El mix muestra una posicion de compra relativamente cubierta.",
      metric: formatPct(spotPct),
      tone: spotPct > 0.7 ? "danger" : spotPct > 0.4 ? "warning" : "success",
    });
  }

  const compliance = input.compliance;
  if (compliance?.cumpleYtd != null || compliance?.pctRenovablePromedio != null) {
    const hasGap = compliance.cumpleYtd === false || (compliance.brechaYtdMwh ?? 0) > 0;
    insights.push({
      title: hasGap ? "Brecha renovable activa" : "Renovable en linea",
      body: hasGap
        ? "El acumulado renovable queda por debajo de la obligacion y conviene revisar cobertura MATER."
        : "El ritmo renovable actual acompana la obligacion anual.",
      metric: hasGap ? preview ? "Brecha activa" : `${fmt(compliance.brechaYtdMwh, 0)} MWh` : formatPct(compliance.pctRenovablePromedio),
      tone: hasGap ? "warning" : "success",
    });
  }

  const factor = input.factor;
  if (factor?.ratioPicoVallePromedio != null || factor?.pctPicoPromedio != null) {
    const concentrated = (factor.ratioPicoVallePromedio ?? 0) > 1.8 || (factor.pctPicoPercentilPromedio ?? 0) > 0.75;
    insights.push({
      title: concentrated ? "Carga concentrada en pico" : "Perfil horario estable",
      body: concentrated
        ? "El consumo aparece cargado hacia horas pico frente al valle; hay oportunidad de corrimiento operativo."
        : "La apertura pico/valle/resto no muestra concentracion extrema.",
      metric: factor.ratioPicoVallePromedio != null ? `${fmt(factor.ratioPicoVallePromedio)}x` : formatPct(factor.pctPicoPromedio),
      tone: concentrated ? "warning" : "info",
    });
  }

  const audit = input.audit;
  if (audit?.importeRevisablePesos != null || audit?.facturaTotalPesos != null) {
    const revisable = audit.importeRevisablePesos ?? 0;
    insights.push({
      title: revisable > 0 ? "DTE con importe revisable" : "DTE sin alertas fuertes",
      body: revisable > 0
        ? "La liquidacion CAMMESA contiene montos marcados para revision antes de interpretarlos como reclamo."
        : "La auditoria no detecta importes revisables relevantes en el periodo resumido.",
      metric: preview ? (revisable > 0 ? "Importe detectado" : "Sin alerta") : formatCompactMoney(revisable > 0 ? revisable : audit.facturaTotalPesos),
      tone: revisable > 0 ? "warning" : "success",
    });
  }

  return insights.slice(0, 4);
}

export function buildModulePreviewState(input: ExecutiveInsightInput, options: PreviewBuildOptions = {}): ModulePreviewState {
  const preview = isPreview(options);
  const spotPct = input.spot?.pctSpot ?? null;
  const compliancePct = input.compliance?.pctRenovablePromedio ?? null;
  const factorPercentile = input.factor?.pctPicoPercentilPromedio ?? null;
  const auditRevisable = input.audit?.importeRevisablePesos ?? null;

  return {
    spot: {
      primary: formatPct(spotPct),
      secondary: preview && input.spot?.costoSpotPromedioPesosMwh != null
        ? "Costo spot calculado"
        : input.spot?.costoSpotPromedioPesosMwh != null
        ? `${fmt(input.spot.costoSpotPromedioPesosMwh, 0)} $/MWh`
        : "Costo spot",
      status: spotPct == null ? "empty" : spotPct > 0.7 ? "risk" : spotPct > 0.4 ? "watch" : "ok",
    },
    compliance: {
      primary: formatPct(compliancePct),
      secondary: input.compliance?.cumpleYtd === false ? "Brecha YTD" : "Avance YTD",
      status: compliancePct == null ? "empty" : input.compliance?.cumpleYtd === false ? "risk" : "ok",
    },
    factor: {
      primary: formatPct(input.factor?.pctPicoPromedio),
      secondary: factorPercentile != null ? preview ? "Benchmark disponible" : `P${Math.round(factorPercentile * 100)} pico` : "Percentil pico",
      status: factorPercentile == null ? "empty" : factorPercentile > 0.75 ? "watch" : "ok",
    },
    audit: {
      primary: preview && input.audit?.facturaTotalPesos != null ? "DTE disponible" : formatCompactMoney(input.audit?.facturaTotalPesos),
      secondary: auditRevisable != null ? preview ? "Importe a revisar" : `${formatCompactMoney(auditRevisable)} revisar` : "Importe a revisar",
      status: auditRevisable == null ? "empty" : auditRevisable > 0 ? "risk" : "ok",
    },
  };
}

export function selectFeaturedModule(previews: ModulePreviewState): HomeModuleKey {
  const priority: Array<{ key: HomeModuleKey; status: PreviewStatus }> = [
    { key: "audit", status: previews.audit.status },
    { key: "spot", status: previews.spot.status },
    { key: "compliance", status: previews.compliance.status },
    { key: "factor", status: previews.factor.status },
  ];

  return (
    priority.find((item) => item.status === "risk")?.key ??
    priority.find((item) => item.status === "watch")?.key ??
    "spot"
  );
}
