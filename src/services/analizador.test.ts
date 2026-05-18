import { buildAnalizadorResponse } from "./analizador.rules.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string) {
  if (!actual.includes(expected)) {
    throw new Error(`${message}. Expected "${actual}" to include "${expected}"`);
  }
}

const basePeriodo = "2026-04";

const highSpot = buildAnalizadorResponse({
  periodo: basePeriodo,
  spot: {
    serie: [
      { periodo: "2026-02", pctSpot: 0.22 },
      { periodo: "2026-03", pctSpot: 0.36 },
      { periodo: "2026-04", pctSpot: 0.72 },
    ],
  },
});

assertEqual(highSpot.insights[0]?.id, "spot-alto", "spot >= 70% should generate high risk first");
assertEqual(highSpot.insights[0]?.prioridad, "alta", "spot >= 70% should be high priority");
assertEqual(highSpot.insights[0]?.horizonte, "ahora", "high spot in latest month should be an immediate alert");
assertEqual(highSpot.insights[0]?.periodoAnalizado, "ultimo mes", "high spot should describe its analyzed period");
assertEqual(highSpot.resumen.estadoGeneral, "critico", "high priority insight should make general state critical");

const sustainedSpot = buildAnalizadorResponse({
  periodo: basePeriodo,
  spot: {
    serie: [
      { periodo: "2026-02", pctSpot: 0.41 },
      { periodo: "2026-03", pctSpot: 0.18 },
      { periodo: "2026-04", pctSpot: 0.48 },
    ],
  },
});

assertEqual(sustainedSpot.insights[0]?.id, "spot-sostenido", "spot >= 40% in 2 of 3 months should generate sustained alert");
assertEqual(sustainedSpot.insights[0]?.prioridad, "media", "sustained spot should be medium priority");
assertEqual(sustainedSpot.insights[0]?.horizonte, "tendencia", "sustained spot should be treated as a trend");
assertEqual(sustainedSpot.insights[0]?.periodoAnalizado, "ultimos 3 meses", "sustained spot should describe its analyzed period");

const dteAlert = buildAnalizadorResponse({
  periodo: basePeriodo,
  dte: {
    facturaTotalPesos: 240_000_000,
    importeRevisablePesos: 2_000_000,
    costoPromedioPesosMwh: 54_000,
  },
});

assertEqual(dteAlert.insights[0]?.id, "dte-revisable", "positive DTE revisable amount should generate audit alert");
assertEqual(dteAlert.insights[0]?.prioridad, "media", "non-material DTE revisable amount should be medium priority");

const materialDte = buildAnalizadorResponse({
  periodo: basePeriodo,
  dte: {
    facturaTotalPesos: 100_000_000,
    importeRevisablePesos: 4_000_000,
    costoPromedioPesosMwh: 51_000,
  },
});

assertEqual(materialDte.insights[0]?.prioridad, "alta", "DTE revisable above 3% of invoice should upgrade to high priority");
assertIncludes(materialDte.insights[0]?.impacto ?? "", "material", "material DTE insight should explain relative impact");

const renewableGap = buildAnalizadorResponse({
  periodo: basePeriodo,
  renovables: {
    cumpleYtd: false,
    brechaYtdMwh: 1280,
    multaEstimadaPesos: 18_200_000,
    pctRenovablePromedio: 0.09,
  },
});

assertEqual(renewableGap.insights[0]?.id, "renovables-brecha", "renewable shortfall should generate regulatory risk");
assertEqual(renewableGap.insights[0]?.tipo, "riesgo", "renewable shortfall should be a risk");
assertEqual(renewableGap.insights[0]?.horizonte, "ytd", "renewable shortfall should use year-to-date horizon");

const peakOpportunity = buildAnalizadorResponse({
  periodo: basePeriodo,
  perfilCarga: {
    pctPicoPercentilPromedio: 0.82,
    ratioPicoVallePromedio: 1.45,
    pctPicoPromedio: 0.41,
  },
});

assertEqual(peakOpportunity.insights[0]?.id, "perfil-pico-alto", "high peak percentile should generate operational opportunity");
assertEqual(peakOpportunity.insights[0]?.tipo, "oportunidad", "peak concentration should be an opportunity");

const emptyAnalysis = buildAnalizadorResponse({
  periodo: basePeriodo,
  spot: { serie: [{ periodo: "2026-04", pctSpot: 0.12 }] },
  dte: { facturaTotalPesos: 100_000_000, importeRevisablePesos: 0, costoPromedioPesosMwh: 48_000 },
  renovables: { cumpleYtd: true, brechaYtdMwh: 0, multaEstimadaPesos: 0, pctRenovablePromedio: 0.22 },
  perfilCarga: { pctPicoPercentilPromedio: 0.4, ratioPicoVallePromedio: 1.2, pctPicoPromedio: 0.28 },
});

assertEqual(emptyAnalysis.insights.length, 0, "normal data should not generate false insights");
assertEqual(emptyAnalysis.resumen.estadoGeneral, "normal", "empty insight list should keep normal state");

const partial = buildAnalizadorResponse({
  periodo: basePeriodo,
  warnings: ["Spot no disponible"],
});

assertEqual(partial.resumen.analisisParcial, true, "warnings should mark the analysis as partial");

const groundedReading = buildAnalizadorResponse({
  periodo: basePeriodo,
  spot: { serie: [{ periodo: "2026-04", pctSpot: 0.32 }] },
  dte: { facturaTotalPesos: 90_000_000, importeRevisablePesos: 0, costoPromedioPesosMwh: 47_500 },
  renovables: { cumpleYtd: true, brechaYtdMwh: 0, multaEstimadaPesos: 0, pctRenovablePromedio: 0.24 },
  perfilCarga: { pctPicoPercentilPromedio: 0.52, ratioPicoVallePromedio: 1.35, pctPicoPromedio: 0.33 },
  historia: {
    mesesDisponibles: 24,
    demandaUltimos12mMwh: 62_000,
    variacionUltimos12mPct: 0.08,
    variacionYoyUltimoMesPct: 0.04,
    ultimoMesDemandaMwh: 5_300,
    demandaPromedioUltimos12mMwh: 5_160,
  },
});

assertEqual(groundedReading.lecturas.length >= 5, true, "analyzer should always translate available data into readings");
assertEqual(groundedReading.lecturas[0]?.valor.includes("%"), true, "readings should show concrete values, not only generic text");
assertEqual(groundedReading.lecturas.some((reading) => reading.accionSugerida.length > 20), true, "readings should include actionable guidance");
assertEqual(groundedReading.lecturas.every((reading) => reading.periodoAnalizado.length > 0), true, "each reading should expose analyzed period");

const historyGrowth = buildAnalizadorResponse({
  periodo: basePeriodo,
  historia: {
    mesesDisponibles: 24,
    demandaUltimos12mMwh: 72_000,
    variacionUltimos12mPct: 0.24,
    variacionYoyUltimoMesPct: 0.31,
    ultimoMesDemandaMwh: 7_200,
    demandaPromedioUltimos12mMwh: 6_000,
  },
});

assertEqual(historyGrowth.insights[0]?.id, "historia-demanda-crece", "strong demand growth should generate planning insight");
assertEqual(historyGrowth.insights[0]?.moduloOrigen, "historia", "demand trend should come from history module");

const historyDrop = buildAnalizadorResponse({
  periodo: basePeriodo,
  historia: {
    mesesDisponibles: 24,
    demandaUltimos12mMwh: 44_000,
    variacionUltimos12mPct: -0.23,
    variacionYoyUltimoMesPct: -0.28,
    ultimoMesDemandaMwh: 3_600,
    demandaPromedioUltimos12mMwh: 4_800,
  },
});

assertEqual(historyDrop.insights[0]?.id, "historia-demanda-cae", "strong demand drop should generate anomaly insight");
assertEqual(historyDrop.insights[0]?.tipo, "alerta", "demand drop should be treated as an alert");

const marketStress = buildAnalizadorResponse({
  periodo: basePeriodo,
  mercado: {
    renovableSistemaPctUltimoDato: 0.08,
    tendenciaManufactureraYoyPct: -0.12,
    sectorIndustrialLider: "quimicos",
    warnings: [],
  },
});

assertEqual(marketStress.insights[0]?.id, "mercado-contexto-adverso", "market context should generate external stress insight");
assertEqual(marketStress.insights[0]?.moduloOrigen, "mercado", "market stress should come from market module");

const inicioCoverage = buildAnalizadorResponse({
  periodo: basePeriodo,
  inicio: {
    clienteDisponible: true,
    demandaMesGwh: 5.5,
    spotPctMes: 0.52,
    materPctMes: 0.18,
    plusPctMes: 0.3,
    pctRenovableAnio: 0.11,
    cumple27191: true,
  },
});

assertEqual(inicioCoverage.insights[0]?.id, "inicio-cobertura-desbalanceada", "home mix should generate coverage insight");

const crossRisk = buildAnalizadorResponse({
  periodo: basePeriodo,
  spot: {
    serie: [
      { periodo: "2026-02", pctSpot: 0.45 },
      { periodo: "2026-03", pctSpot: 0.46 },
      { periodo: "2026-04", pctSpot: 0.52 },
    ],
  },
  mercado: {
    renovableSistemaPctUltimoDato: 0.09,
    tendenciaManufactureraYoyPct: null,
    sectorIndustrialLider: null,
    warnings: [],
  },
});

assertEqual(crossRisk.insights[0]?.id, "cruce-spot-contexto", "spot plus adverse market should generate cross-module insight");
assertEqual(crossRisk.insights[0]?.prioridad, "alta", "cross-module risk should be high priority");

const winterPattern = buildAnalizadorResponse({
  periodo: "2026-04",
  spot: {
    serie: [
      { periodo: "2024-06", pctSpot: 0.55, subContratoMwh: 180 },
      { periodo: "2024-07", pctSpot: 0.62, subContratoMwh: 220 },
      { periodo: "2025-06", pctSpot: 0.49, subContratoMwh: 140 },
      { periodo: "2025-07", pctSpot: 0.51, subContratoMwh: 160 },
      { periodo: "2026-04", pctSpot: 0.28, subContratoMwh: 0 },
    ],
  },
});

assertEqual(winterPattern.insights[0]?.id, "anticipacion-invierno-cobertura", "repeated winter undercoverage should generate seasonal anticipation");
assertEqual(winterPattern.insights[0]?.horizonte, "anticipacion", "seasonal pattern should be an anticipation insight");
assertEqual(winterPattern.insights[0]?.periodoAnalizado, "ultimos 36 meses", "seasonal insight should describe its historical window");
assertEqual(winterPattern.insights[0]?.accionRecomendada.includes("antes de junio"), true, "winter recommendation should be timed before the season");

const projections = buildAnalizadorResponse({
  periodo: "2026-04",
  spot: {
    serie: [
      { periodo: "2025-06", pctSpot: 0.44, compraSpotMwh: 240, subContratoMwh: 90 },
      { periodo: "2025-07", pctSpot: 0.51, compraSpotMwh: 310, subContratoMwh: 120 },
      { periodo: "2025-08", pctSpot: 0.48, compraSpotMwh: 280, subContratoMwh: 100 },
      { periodo: "2026-02", pctSpot: 0.36, compraSpotMwh: 210, subContratoMwh: 60 },
      { periodo: "2026-03", pctSpot: 0.42, compraSpotMwh: 260, subContratoMwh: 80 },
      { periodo: "2026-04", pctSpot: 0.46, compraSpotMwh: 290, subContratoMwh: 110 },
    ],
  },
  dte: {
    facturaTotalPesos: 120_000_000,
    importeRevisablePesos: 0,
    costoPromedioPesosMwh: 52_000,
    serie: [
      { periodo: "2026-02", facturaTotalPesos: 92_000_000, costoDtePesosMwh: 46_000, demandaRealMwh: 2000 },
      { periodo: "2026-03", facturaTotalPesos: 108_000_000, costoDtePesosMwh: 50_000, demandaRealMwh: 2160 },
      { periodo: "2026-04", facturaTotalPesos: 120_000_000, costoDtePesosMwh: 52_000, demandaRealMwh: 2300 },
    ],
  },
  renovables: {
    cumpleYtd: false,
    brechaYtdMwh: 720,
    multaEstimadaPesos: 0,
    pctRenovablePromedio: 0.12,
  },
  historia: {
    mesesDisponibles: 36,
    demandaUltimos12mMwh: 72_000,
    variacionUltimos12mPct: 0.12,
    variacionYoyUltimoMesPct: 0.08,
    ultimoMesDemandaMwh: 6200,
    demandaPromedioUltimos12mMwh: 6000,
    serie: [
      { periodo: "2024-05", demandaMwh: 5600 },
      { periodo: "2024-06", demandaMwh: 6500 },
      { periodo: "2024-07", demandaMwh: 6900 },
      { periodo: "2025-05", demandaMwh: 5900 },
      { periodo: "2025-06", demandaMwh: 7000 },
      { periodo: "2025-07", demandaMwh: 7300 },
      { periodo: "2026-04", demandaMwh: 6200 },
    ],
  },
});

assertEqual(projections.proyecciones.length >= 4, true, "analyzer should generate useful projections when data supports them");
assertEqual(projections.proyecciones.some((item) => item.id === "proyeccion-spot-3m"), true, "spot/cobertura projection should be generated");
assertEqual(projections.proyecciones.some((item) => item.id === "proyeccion-renovable-cierre"), true, "renewable closing projection should be generated");
assertEqual(projections.proyecciones.some((item) => item.id === "proyeccion-demanda-estacional"), true, "seasonal demand projection should be generated");
assertEqual(projections.proyecciones.some((item) => item.id === "proyeccion-costo-mensual"), true, "monthly cost projection should be generated");
