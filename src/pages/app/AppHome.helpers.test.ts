import {
  buildExecutiveInsights,
  buildModulePreviewState,
  formatCompactMoney,
  selectFeaturedModule,
  type HomeAuditInput,
  type HomeComplianceInput,
  type HomeFactorInput,
  type HomeSpotInput,
} from "./AppHome.helpers.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

const spot: HomeSpotInput = {
  pctSpot: 0.76,
  pctMat: 0.18,
  costoSpotPromedioPesosMwh: 69000,
  spotPesos: 125_000_000,
};

const compliance: HomeComplianceInput = {
  pctRenovablePromedio: 0.09,
  cumpleYtd: false,
  brechaYtdMwh: 1280,
  multaEstimadaPesos: 18_200_000,
};

const factor: HomeFactorInput = {
  pctPicoPromedio: 0.41,
  pctVallePromedio: 0.18,
  ratioPicoVallePromedio: 2.4,
  pctPicoPercentilPromedio: 0.82,
};

const audit: HomeAuditInput = {
  facturaTotalPesos: 240_000_000,
  importeRevisablePesos: 34_000_000,
  mesesConRevision: 3,
  meses: 12,
  costoPromedioPesosMwh: 54000,
};

const insights = buildExecutiveInsights({ spot, compliance, factor, audit });
assertEqual(insights.length, 4, "buildExecutiveInsights should surface one high-signal insight per module");
assertEqual(insights[0].tone, "danger", "high spot exposure should be a danger insight");
assertEqual(insights[1].title, "Brecha renovable activa", "renewable shortfall should be highlighted");
assertEqual(insights[2].tone, "warning", "peak concentration should be a warning insight");
assertEqual(insights[3].metric, "$34 M", "audit insight should compact large pesos");

const previews = buildModulePreviewState({ spot, compliance, factor, audit });
assertEqual(previews.spot.status, "risk", "spot preview should be risk when pctSpot is high");
assertEqual(previews.compliance.primary, "9,0%", "compliance preview should format renewable percentage");
assertEqual(previews.factor.secondary, "P82 pico", "factor preview should show peak percentile");
assertEqual(previews.audit.status, "risk", "audit preview should be risk with revisable amount");
assertEqual(formatCompactMoney(1_250_000_000), "$1.250 M", "formatCompactMoney should keep ARS compact units readable");

assertEqual(
  selectFeaturedModule(previews),
  "audit",
  "selectFeaturedModule should prioritize DTE review over other risks",
);

assertEqual(
  selectFeaturedModule({ ...previews, audit: { ...previews.audit, status: "ok" } }),
  "spot",
  "selectFeaturedModule should use spot when DTE is not at risk and spot is critical",
);

const previewInsights = buildExecutiveInsights(
  { spot, compliance, factor, audit },
  { disclosure: "preview" },
);
assertEqual(
  previewInsights[1].metric,
  "Brecha activa",
  "preview insights should hide exact renewable gap MWh",
);
assertEqual(
  previewInsights[3].metric,
  "Importe detectado",
  "preview insights should hide exact DTE money",
);

const commercialPreviews = buildModulePreviewState(
  { spot, compliance, factor, audit },
  { disclosure: "preview" },
);
assertEqual(
  commercialPreviews.spot.secondary,
  "Costo spot calculado",
  "preview mode should not expose exact spot cost",
);
assertEqual(
  commercialPreviews.audit.primary,
  "DTE disponible",
  "preview mode should not expose exact DTE total",
);
