import type {
  AnalizadorInsight,
  AnalizadorLectura,
  AnalizadorPrioridad,
  AnalizadorProyeccion,
  AnalizadorResponse,
} from "../types/analizador";

export type AnalizadorInput = {
  periodo: string;
  spot?: {
    serie: Array<{
      periodo: string;
      pctSpot: number | null;
      costoSpotPromedioPesosMwh?: number | null;
      subContratoMwh?: number | null;
      compraSpotMwh?: number | null;
      demandaContratadaMwh?: number | null;
    }>;
  } | null;
  dte?: {
    facturaTotalPesos: number | null;
    importeRevisablePesos: number | null;
    costoPromedioPesosMwh: number | null;
    serie?: Array<{
      periodo: string;
      facturaTotalPesos: number | null;
      costoDtePesosMwh: number | null;
      demandaRealMwh: number | null;
    }>;
  } | null;
  renovables?: {
    cumpleYtd: boolean | null;
    brechaYtdMwh: number | null;
    multaEstimadaPesos: number | null;
    pctRenovablePromedio: number | null;
  } | null;
  perfilCarga?: {
    pctPicoPercentilPromedio: number | null;
    ratioPicoVallePromedio: number | null;
    pctPicoPromedio: number | null;
  } | null;
  historia?: {
    mesesDisponibles: number | null;
    demandaUltimos12mMwh: number | null;
    variacionUltimos12mPct: number | null;
    variacionYoyUltimoMesPct: number | null;
    ultimoMesDemandaMwh: number | null;
    demandaPromedioUltimos12mMwh: number | null;
    serie?: Array<{ periodo: string; demandaMwh: number | null }>;
  } | null;
  mercado?: {
    renovableSistemaPctUltimoDato: number | null;
    tendenciaManufactureraYoyPct: number | null;
    sectorIndustrialLider: string | null;
    warnings: string[];
  } | null;
  inicio?: {
    clienteDisponible: boolean;
    demandaMesGwh: number | null;
    spotPctMes: number | null;
    materPctMes: number | null;
    plusPctMes: number | null;
    pctRenovableAnio: number | null;
    cumple27191: boolean | null;
  } | null;
  warnings?: string[];
};

const THRESHOLDS = {
  spotHigh: 0.7,
  spotWatch: 0.4,
  spotSustainedMonths: 2,
  dteMaterialPct: 0.03,
  peakPercentileHigh: 0.75,
  peakValleyRatioHigh: 1.8,
  demandTrendHigh: 0.2,
  demandTrendLow: -0.2,
  marketRenewableLow: 0.1,
  manufacturingStress: -0.08,
  materLow: 0.25,
};

const PRIORITY_WEIGHT: Record<AnalizadorPrioridad, number> = {
  alta: 3,
  media: 2,
  baja: 1,
};

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function fmtNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("es-AR", { maximumFractionDigits: decimals });
}

function fmtPesos(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMwh(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${fmtNumber(value)} MWh`;
}

function avg(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function rangeAround(value: number, lowPct: number, highPct: number, formatter: (value: number) => string): string {
  return `${formatter(value * (1 - lowPct))} - ${formatter(value * (1 + highPct))}`;
}

function byPriority(a: AnalizadorInsight, b: AnalizadorInsight): number {
  return PRIORITY_WEIGHT[b.prioridad] - PRIORITY_WEIGHT[a.prioridad];
}

function countPriority(insights: AnalizadorInsight[], priority: AnalizadorPrioridad): number {
  return insights.filter((insight) => insight.prioridad === priority).length;
}

function latestSpot(input: AnalizadorInput): { periodo: string; pctSpot: number } | null {
  const point = input.spot?.serie
    .filter((row) => row.pctSpot != null)
    .at(-1);
  if (!point || point.pctSpot == null) return null;
  return { periodo: point.periodo, pctSpot: point.pctSpot };
}

function monthFromPeriod(periodo: string): number | null {
  const month = Number(periodo.slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : null;
}

function seasonalLabel(months: number[]): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b).join("-");
  if (sorted === "6-7-8") return "invierno";
  if (sorted === "12-1-2") return "verano";
  return "temporada";
}

function buildSpotInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const spot = latestSpot(input);
  if (!spot) return [];

  if (spot.pctSpot >= THRESHOLDS.spotHigh) {
    return [{
      id: "spot-alto",
      periodo: spot.periodo,
      moduloOrigen: "spot",
      tipo: "riesgo",
      prioridad: "alta",
      horizonte: "ahora",
      periodoAnalizado: "ultimo mes",
      confianza: "alta",
      titulo: "Exposicion spot alta",
      problema: "La empresa compro una parte dominante de su energia en mercado variable.",
      impacto: "Puede aumentar la volatilidad del costo mensual y reducir previsibilidad presupuestaria.",
      accionRecomendada: "Revisar cobertura contractual, MATER o bilateral para los proximos meses.",
      responsableSugerido: "finanzas",
      evidencia: [{
        label: "Spot ultimo mes",
        valor: fmtPct(spot.pctSpot),
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      }],
    }];
  }

  const lastThree = input.spot?.serie
    .filter((row) => row.pctSpot != null)
    .slice(-3) ?? [];
  const sustained = lastThree.filter((row) => (row.pctSpot ?? 0) >= THRESHOLDS.spotWatch);
  if (sustained.length >= THRESHOLDS.spotSustainedMonths) {
    return [{
      id: "spot-sostenido",
      periodo: spot.periodo,
      moduloOrigen: "spot",
      tipo: "alerta",
      prioridad: "media",
      horizonte: "tendencia",
      periodoAnalizado: "ultimos 3 meses",
      confianza: "alta",
      titulo: "Exposicion spot sostenida",
      problema: "La compra en mercado variable se repite en varios meses recientes.",
      impacto: "Aunque no sea critica en un solo mes, la repeticion puede acumular sobrecostos y volatilidad.",
      accionRecomendada: "Comparar los meses con mayor spot contra demanda contratada y evaluar ajuste de cobertura.",
      responsableSugerido: "energia",
      evidencia: [{
        label: "Meses recientes con spot sobre 40%",
        valor: `${sustained.length}/3`,
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      }],
    }];
  }

  return [];
}

function buildDteInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const dte = input.dte;
  const revisable = dte?.importeRevisablePesos ?? 0;
  if (!dte || revisable <= 0) return [];

  const ratio = (dte.facturaTotalPesos ?? 0) > 0 ? revisable / (dte.facturaTotalPesos ?? 1) : 0;
  const material = ratio >= THRESHOLDS.dteMaterialPct;

  return [{
    id: "dte-revisable",
    periodo: input.periodo,
    moduloOrigen: "dte",
    tipo: "alerta",
    prioridad: material ? "alta" : "media",
    horizonte: "ahora",
    periodoAnalizado: "ultimos 12 meses",
    confianza: dte.facturaTotalPesos != null ? "alta" : "media",
    titulo: material ? "DTE con importe revisable material" : "DTE con importe a revisar",
    problema: "La liquidacion CAMMESA contiene montos marcados para revision.",
    impacto: material
      ? "El importe revisable es material frente al total liquidado y conviene priorizarlo antes del cierre administrativo."
      : "Puede indicar conceptos a validar antes de interpretar el monto como reclamo o sobrecosto.",
    accionRecomendada: "Revisar conceptos del DTE y documentar el caso con el detalle tecnico del modulo.",
    responsableSugerido: "administracion",
    evidencia: [
      {
        label: "Importe revisable",
        valor: fmtPesos(revisable),
        fuente: "Auditoria DTE",
        urlModulo: "/app/auditoria-dte",
      },
      {
        label: "Peso sobre DTE",
        valor: ratio > 0 ? fmtPct(ratio) : "-",
        fuente: "Auditoria DTE",
        urlModulo: "/app/auditoria-dte",
      },
    ],
  }];
}

function buildRenewableInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const renovables = input.renovables;
  if (!renovables) return [];

  const hasGap = renovables.cumpleYtd === false || (renovables.brechaYtdMwh ?? 0) > 0;
  if (!hasGap) return [];

  return [{
    id: "renovables-brecha",
    periodo: input.periodo,
    moduloOrigen: "renovables",
    tipo: "riesgo",
    prioridad: (renovables.multaEstimadaPesos ?? 0) > 0 ? "alta" : "media",
    horizonte: "ytd",
    periodoAnalizado: "anio en curso",
    confianza: "alta",
    titulo: "Brecha renovable activa",
    problema: "El avance renovable queda por debajo de la obligacion anual estimada.",
    impacto: "Puede derivar en penalidad o en una correccion de cobertura si no se atiende durante el periodo.",
    accionRecomendada: "Revisar cobertura MATER y estimar la energia renovable faltante para cerrar el anio.",
    responsableSugerido: "asesor",
    evidencia: [
      {
        label: "Brecha YTD",
        valor: `${fmtNumber(renovables.brechaYtdMwh)} MWh`,
        fuente: "Cumplimiento 27.191",
        urlModulo: "/app/cumplimiento-renovable",
      },
      {
        label: "Multa estimada",
        valor: fmtPesos(renovables.multaEstimadaPesos),
        fuente: "Cumplimiento 27.191",
        urlModulo: "/app/cumplimiento-renovable",
      },
    ],
  }];
}

function buildPeakInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const perfil = input.perfilCarga;
  if (!perfil) return [];

  const peakPercentile = perfil.pctPicoPercentilPromedio ?? 0;
  const peakRatio = perfil.ratioPicoVallePromedio ?? 0;
  const highPeak = peakPercentile >= THRESHOLDS.peakPercentileHigh || peakRatio >= THRESHOLDS.peakValleyRatioHigh;
  if (!highPeak) return [];

  return [{
    id: "perfil-pico-alto",
    periodo: input.periodo,
    moduloOrigen: "perfil_carga",
    tipo: "oportunidad",
    prioridad: "media",
    horizonte: "tendencia",
    periodoAnalizado: "ultimos 24 meses",
    confianza: peakPercentile > 0 ? "alta" : "media",
    titulo: "Carga concentrada en horario pico",
    problema: "El consumo aparece cargado hacia horas pico frente al patron esperado.",
    impacto: "Puede existir margen operativo para reducir exposicion en bandas mas caras o mejorar planificacion.",
    accionRecomendada: "Revisar turnos, equipos desplazables y consumos recurrentes que puedan moverse fuera de pico.",
    responsableSugerido: "energia",
    evidencia: [
      {
        label: "Percentil pico",
        valor: peakPercentile > 0 ? `P${Math.round(peakPercentile * 100)}` : "-",
        fuente: "Perfil de Carga",
        urlModulo: "/app/perfil-carga",
      },
      {
        label: "Ratio pico/valle",
        valor: peakRatio > 0 ? `${fmtNumber(peakRatio, 1)}x` : "-",
        fuente: "Perfil de Carga",
        urlModulo: "/app/perfil-carga",
      },
    ],
  }];
}

function buildHistoryInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const historia = input.historia;
  if (!historia || (historia.mesesDisponibles ?? 0) < 12) return [];

  const trend12m = historia.variacionUltimos12mPct ?? 0;
  const trendYoy = historia.variacionYoyUltimoMesPct ?? 0;

  if (trend12m >= THRESHOLDS.demandTrendHigh || trendYoy >= THRESHOLDS.demandTrendHigh) {
    return [{
      id: "historia-demanda-crece",
      periodo: input.periodo,
      moduloOrigen: "historia",
      tipo: "mejora",
      prioridad: "media",
      horizonte: "tendencia",
      periodoAnalizado: "ultimos 12 meses",
      confianza: "alta",
      titulo: "Demanda en crecimiento fuerte",
      problema: "La demanda reciente crece por encima del patron historico de la empresa.",
      impacto: "Puede requerir revisar potencia, cobertura contractual y presupuesto energetico antes de que el cambio se consolide.",
      accionRecomendada: "Comparar crecimiento operativo contra cobertura y proyectar los proximos 3 a 6 meses.",
      responsableSugerido: "finanzas",
      evidencia: [
        {
          label: "Variacion 12 meses",
          valor: fmtPct(historia.variacionUltimos12mPct),
          fuente: "Historia Energetica",
          urlModulo: "/app/historia",
        },
        {
          label: "Ultimo mes YoY",
          valor: fmtPct(historia.variacionYoyUltimoMesPct),
          fuente: "Historia Energetica",
          urlModulo: "/app/historia",
        },
      ],
    }];
  }

  if (trend12m <= THRESHOLDS.demandTrendLow || trendYoy <= THRESHOLDS.demandTrendLow) {
    return [{
      id: "historia-demanda-cae",
      periodo: input.periodo,
      moduloOrigen: "historia",
      tipo: "alerta",
      prioridad: "media",
      horizonte: "tendencia",
      periodoAnalizado: "ultimos 12 meses",
      confianza: "alta",
      titulo: "Demanda con caida relevante",
      problema: "La demanda cae con fuerza frente al periodo comparable.",
      impacto: "Puede indicar menor actividad, parada operativa, cambio de proceso o un dato que conviene validar.",
      accionRecomendada: "Contrastar la caida contra produccion, turnos y eventos operativos del periodo.",
      responsableSugerido: "administracion",
      evidencia: [
        {
          label: "Variacion 12 meses",
          valor: fmtPct(historia.variacionUltimos12mPct),
          fuente: "Historia Energetica",
          urlModulo: "/app/historia",
        },
        {
          label: "Demanda ultimo mes",
          valor: `${fmtNumber(historia.ultimoMesDemandaMwh)} MWh`,
          fuente: "Historia Energetica",
          urlModulo: "/app/historia",
        },
      ],
    }];
  }

  return [];
}

function buildMarketInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const mercado = input.mercado;
  if (!mercado) return [];

  const renewableLow = (mercado.renovableSistemaPctUltimoDato ?? 1) <= THRESHOLDS.marketRenewableLow;
  const manufacturingStress = (mercado.tendenciaManufactureraYoyPct ?? 0) <= THRESHOLDS.manufacturingStress;
  if (!renewableLow && !manufacturingStress) return [];

  return [{
    id: "mercado-contexto-adverso",
    periodo: input.periodo,
    moduloOrigen: "mercado",
    tipo: "alerta",
    prioridad: "baja",
    horizonte: "ahora",
    periodoAnalizado: "30 dias y ultimos 12 meses",
    confianza: "media",
    titulo: "Contexto de mercado adverso",
    problema: "El contexto nacional muestra senales que pueden afectar la lectura del costo o la comparacion mensual.",
    impacto: "No es un problema interno por si solo, pero ayuda a explicar variaciones y a decidir si una alerta es operativa o de mercado.",
    accionRecomendada: "Usar el contexto MEM como nota del informe mensual antes de atribuir el cambio solo a la empresa.",
    responsableSugerido: "asesor",
    evidencia: [
      {
        label: "Renovable sistema",
        valor: fmtPct(mercado.renovableSistemaPctUltimoDato),
        fuente: "Mercado Electrico",
        urlModulo: "/app/mercado",
      },
      {
        label: "Manufactura YoY",
        valor: fmtPct(mercado.tendenciaManufactureraYoyPct),
        fuente: "Mercado Electrico",
        urlModulo: "/app/mercado",
      },
    ],
  }];
}

function buildInicioInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const inicio = input.inicio;
  if (!inicio?.clienteDisponible) return [];

  const spot = inicio.spotPctMes ?? 0;
  const mater = inicio.materPctMes ?? 1;
  const hasCoverageIssue = spot >= THRESHOLDS.spotWatch && mater < THRESHOLDS.materLow;

  if (!hasCoverageIssue) return [];

  return [{
    id: "inicio-cobertura-desbalanceada",
    periodo: input.periodo,
    moduloOrigen: "inicio",
    tipo: "oportunidad",
    prioridad: "media",
    horizonte: "ahora",
    periodoAnalizado: "ultimo mes",
    confianza: "media",
    titulo: "Mix de cobertura desbalanceado",
    problema: "El mes combina exposicion spot relevante con baja cobertura MATER estimada.",
    impacto: "La empresa puede estar comprando energia con menos previsibilidad de precio que la deseada.",
    accionRecomendada: "Revisar si la cobertura actual acompana el consumo real y la politica de riesgo de la empresa.",
    responsableSugerido: "finanzas",
    evidencia: [
      {
        label: "Spot del mes",
        valor: fmtPct(inicio.spotPctMes),
        fuente: "Informe de Inicio",
        urlModulo: "/app",
      },
      {
        label: "MATER del mes",
        valor: fmtPct(inicio.materPctMes),
        fuente: "Informe de Inicio",
        urlModulo: "/app",
      },
    ],
  }];
}

function buildCrossModuleInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const spot = latestSpot(input);
  const marketRenewable = input.mercado?.renovableSistemaPctUltimoDato;
  if (!spot || marketRenewable == null) return [];

  const spotSustained = (input.spot?.serie ?? [])
    .filter((row) => row.pctSpot != null)
    .slice(-3)
    .filter((row) => (row.pctSpot ?? 0) >= THRESHOLDS.spotWatch)
    .length >= THRESHOLDS.spotSustainedMonths;

  if (!spotSustained || marketRenewable > THRESHOLDS.marketRenewableLow) return [];

  return [{
    id: "cruce-spot-contexto",
    periodo: input.periodo,
    moduloOrigen: "mercado",
    tipo: "riesgo",
    prioridad: "alta",
    horizonte: "tendencia",
    periodoAnalizado: "ultimos 3 meses + contexto reciente",
    confianza: "media",
    titulo: "Spot sostenido con contexto MEM adverso",
    problema: "La empresa muestra exposicion spot repetida mientras el contexto del sistema no ayuda a absorber volatilidad.",
    impacto: "La combinacion aumenta el riesgo de explicar subas de costo tarde, cuando el impacto ya esta liquidado.",
    accionRecomendada: "Priorizar una revision de cobertura y dejar el contexto MEM documentado en el informe del mes.",
    responsableSugerido: "asesor",
    evidencia: [
      {
        label: "Spot ultimo mes",
        valor: fmtPct(spot.pctSpot),
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      },
      {
        label: "Renovable sistema",
        valor: fmtPct(marketRenewable),
        fuente: "Mercado Electrico",
        urlModulo: "/app/mercado",
      },
    ],
  }];
}

function buildSeasonalInsights(input: AnalizadorInput): AnalizadorInsight[] {
  const serie = input.spot?.serie ?? [];
  if (serie.length === 0) return [];

  const winterMonths = [6, 7, 8];
  const winterRows = serie.filter((row) => {
    const month = monthFromPeriod(row.periodo);
    return month != null && winterMonths.includes(month);
  });
  const problematicWinterRows = winterRows.filter((row) =>
    (row.subContratoMwh ?? 0) > 0 || (row.pctSpot ?? 0) >= THRESHOLDS.spotWatch
  );
  const years = new Set(problematicWinterRows.map((row) => row.periodo.slice(0, 4)));
  if (years.size < 2) return [];

  const avgSpot = problematicWinterRows.reduce((sum, row) => sum + (row.pctSpot ?? 0), 0) / problematicWinterRows.length;
  const totalUnderContract = problematicWinterRows.reduce((sum, row) => sum + (row.subContratoMwh ?? 0), 0);
  const season = seasonalLabel(winterMonths);

  return [{
    id: "anticipacion-invierno-cobertura",
    periodo: input.periodo,
    moduloOrigen: "spot",
    tipo: "oportunidad",
    prioridad: "media",
    horizonte: "anticipacion",
    periodoAnalizado: "ultimos 36 meses",
    confianza: "media",
    titulo: "Preparar cobertura de invierno",
    problema: `En los ultimos ${years.size} inviernos aparece compra variable o energia por encima de cobertura.`,
    impacto: "Si el patron se repite, el costo puede subir justo en la temporada de mayor exigencia operativa.",
    accionRecomendada: "Revisar energia contratada antes de junio y simular cobertura para junio-agosto.",
    responsableSugerido: "finanzas",
    evidencia: [
      {
        label: `Spot promedio ${season}`,
        valor: fmtPct(avgSpot),
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      },
      {
        label: "Subcontrato historico",
        valor: `${fmtNumber(totalUnderContract)} MWh`,
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      },
    ],
  }];
}

function buildLecturas(input: AnalizadorInput): AnalizadorLectura[] {
  const lecturas: AnalizadorLectura[] = [];
  const spot = latestSpot(input);

  if (spot) {
    const estado = spot.pctSpot >= THRESHOLDS.spotHigh ? "accion" : spot.pctSpot >= THRESHOLDS.spotWatch ? "observar" : "bien";
    lecturas.push({
      id: "lectura-spot",
      moduloOrigen: "spot",
      titulo: "Compra variable",
      valor: fmtPct(spot.pctSpot),
      estado,
      periodoAnalizado: "ultimo mes y ultimos 3 meses",
      lectura: estado === "accion"
        ? "Una parte muy alta del consumo quedo expuesta al precio variable del mercado."
        : estado === "observar"
          ? "La compra variable es relevante y conviene seguirla contra cobertura contratada."
          : "La exposicion variable se mantiene en un nivel razonable para una lectura mensual.",
      accionSugerida: estado === "bien"
        ? "Mantener seguimiento mensual y revisar si cambia el mix de compra."
        : "Pedir una revision de cobertura para reducir volatilidad en los proximos meses.",
      urlModulo: "/app/exposicion-spot",
    });
  }

  if (input.dte) {
    const revisable = input.dte.importeRevisablePesos ?? 0;
    const ratio = (input.dte.facturaTotalPesos ?? 0) > 0 ? revisable / (input.dte.facturaTotalPesos ?? 1) : 0;
    const estado = revisable <= 0 ? "bien" : ratio >= THRESHOLDS.dteMaterialPct ? "accion" : "observar";
    lecturas.push({
      id: "lectura-dte",
      moduloOrigen: "dte",
      titulo: "Liquidacion",
      valor: revisable > 0 ? fmtPesos(revisable) : fmtPesos(input.dte.facturaTotalPesos),
      estado,
      periodoAnalizado: "ultimos 12 meses",
      lectura: revisable > 0
        ? `Hay importes para revisar dentro de la liquidacion; representan ${ratio > 0 ? fmtPct(ratio) : "un monto no comparable"} del total disponible.`
        : "No aparecen importes revisables relevantes en la liquidacion resumida.",
      accionSugerida: revisable > 0
        ? "Validar conceptos y documentar el caso antes del cierre administrativo."
        : "Conservar el control mensual y comparar el costo por MWh contra meses anteriores.",
      urlModulo: "/app/auditoria-dte",
    });
  }

  if (input.renovables) {
    const hasGap = input.renovables.cumpleYtd === false || (input.renovables.brechaYtdMwh ?? 0) > 0;
    lecturas.push({
      id: "lectura-renovables",
      moduloOrigen: "renovables",
      titulo: "Cumplimiento renovable",
      valor: hasGap ? `${fmtNumber(input.renovables.brechaYtdMwh)} MWh` : fmtPct(input.renovables.pctRenovablePromedio),
      estado: hasGap ? "accion" : "bien",
      periodoAnalizado: "anio en curso",
      lectura: hasGap
        ? "El avance renovable no alcanza el ritmo esperado y puede requerir correccion de cobertura."
        : "El cumplimiento renovable no muestra una brecha activa con los datos disponibles.",
      accionSugerida: hasGap
        ? "Calcular energia faltante y revisar alternativas MATER antes del cierre anual."
        : "Mantener seguimiento YTD para anticipar desvio antes de fin de anio.",
      urlModulo: "/app/cumplimiento-renovable",
    });
  }

  if (input.perfilCarga) {
    const percentile = input.perfilCarga.pctPicoPercentilPromedio ?? null;
    const ratio = input.perfilCarga.ratioPicoVallePromedio ?? null;
    const highPeak = (percentile ?? 0) >= THRESHOLDS.peakPercentileHigh || (ratio ?? 0) >= THRESHOLDS.peakValleyRatioHigh;
    lecturas.push({
      id: "lectura-perfil",
      moduloOrigen: "perfil_carga",
      titulo: "Uso horario",
      valor: percentile != null ? `P${Math.round(percentile * 100)}` : ratio != null ? `${fmtNumber(ratio, 1)}x` : "-",
      estado: highPeak ? "observar" : "bien",
      periodoAnalizado: "ultimos 24 meses",
      lectura: highPeak
        ? "El consumo se concentra mas de lo esperable en horarios pico o frente al valle."
        : "El perfil horario no muestra una concentracion extrema con los datos disponibles.",
      accionSugerida: highPeak
        ? "Revisar procesos, turnos o equipos que puedan moverse fuera de horas pico."
        : "Usar esta lectura como linea base para detectar cambios operativos futuros.",
      urlModulo: "/app/perfil-carga",
    });
  }

  if (input.historia && (input.historia.mesesDisponibles ?? 0) >= 12) {
    const trend = input.historia.variacionUltimos12mPct ?? input.historia.variacionYoyUltimoMesPct ?? null;
    const estado = trend == null ? "bien" : trend >= THRESHOLDS.demandTrendHigh || trend <= THRESHOLDS.demandTrendLow ? "observar" : "bien";
    lecturas.push({
      id: "lectura-historia",
      moduloOrigen: "historia",
      titulo: "Tendencia de consumo",
      valor: fmtPct(trend),
      estado,
      periodoAnalizado: "ultimos 36 meses",
      lectura: trend == null
        ? "Hay historia suficiente para comparar, pero no se pudo calcular una variacion clara."
        : trend > 0
          ? "El consumo viene creciendo contra el periodo comparable."
          : trend < 0
            ? "El consumo viene cayendo contra el periodo comparable."
            : "El consumo se mantiene estable contra el periodo comparable.",
      accionSugerida: estado === "observar"
        ? "Contrastar la variacion contra produccion, turnos, nuevas cargas o paradas operativas."
        : "Mantener esta tendencia como referencia para evaluar cambios de costo y cobertura.",
      urlModulo: "/app/historia",
    });
  }

  if (input.mercado) {
    const renewable = input.mercado.renovableSistemaPctUltimoDato;
    const industry = input.mercado.tendenciaManufactureraYoyPct;
    const stress = (renewable ?? 1) <= THRESHOLDS.marketRenewableLow || (industry ?? 0) <= THRESHOLDS.manufacturingStress;
    lecturas.push({
      id: "lectura-mercado",
      moduloOrigen: "mercado",
      titulo: "Contexto de mercado",
      valor: renewable != null ? fmtPct(renewable) : fmtPct(industry),
      estado: stress ? "observar" : "bien",
      periodoAnalizado: "30 dias y ultimos 12 meses",
      lectura: stress
        ? "El contexto del mercado puede estar influyendo en la lectura de costos o comparaciones mensuales."
        : "El contexto general no muestra una senal adversa fuerte para esta lectura.",
      accionSugerida: stress
        ? "Separar en el informe que parte del cambio parece propio de la empresa y que parte puede venir del mercado."
        : "Usar el contexto como referencia, sin convertirlo en una alerta operativa.",
      urlModulo: "/app/mercado",
    });
  }

  if (input.inicio?.clienteDisponible && !lecturas.some((lectura) => lectura.moduloOrigen === "inicio")) {
    lecturas.unshift({
      id: "lectura-inicio",
      moduloOrigen: "inicio",
      titulo: "Resumen mensual",
      valor: input.inicio.demandaMesGwh != null ? `${fmtNumber(input.inicio.demandaMesGwh, 1)} GWh` : "-",
      estado: "bien",
      periodoAnalizado: "ultimo mes",
      lectura: "Esta es la foto mensual base que ordena consumo, cobertura y cumplimiento antes de entrar al detalle.",
      accionSugerida: "Usar esta lectura como portada del informe ejecutivo del periodo.",
      urlModulo: "/app",
    });
  }

  return lecturas;
}

function buildSpotProjection(input: AnalizadorInput): AnalizadorProyeccion | null {
  const rows = input.spot?.serie.filter((row) =>
    (row.compraSpotMwh ?? 0) > 0 || (row.subContratoMwh ?? 0) > 0 || row.pctSpot != null
  ) ?? [];
  if (rows.length < 3) return null;

  const recent = rows.slice(-3);
  const avgSpotMwh = avg(recent.map((row) => row.compraSpotMwh ?? row.subContratoMwh ?? null));
  const avgPct = avg(recent.map((row) => row.pctSpot));
  if (avgSpotMwh == null && avgPct == null) return null;

  const projected = avgSpotMwh ?? 0;
  const scenario = (avgPct ?? 0) >= THRESHOLDS.spotWatch || projected > 0 ? "riesgo" : "base";

  return {
    id: "proyeccion-spot-3m",
    moduloOrigen: "spot",
    titulo: "Cobertura proximos 3 meses",
    periodoProyectado: "proximos 3 meses",
    baseAnalizada: "ultimos 3 meses y estacionalidad disponible",
    escenario: scenario,
    rango: projected > 0 ? rangeAround(projected * 3, 0.15, 0.25, compactMwh) : fmtPct(avgPct),
    lectura: projected > 0
      ? "Si no cambia la cobertura, podria repetirse compra en mercado variable durante los proximos meses."
      : "La exposicion proyectada depende principalmente del porcentaje spot reciente.",
    accionRecomendada: "Revisar energia contratada y simular una cobertura alternativa antes del proximo cierre mensual.",
    confianza: rows.length >= 12 ? "media" : "baja",
    evidencia: [
      {
        label: "Spot promedio reciente",
        valor: fmtPct(avgPct),
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      },
      {
        label: "MWh spot/subcontrato reciente",
        valor: projected > 0 ? compactMwh(projected) : "-",
        fuente: "Exposicion Spot",
        urlModulo: "/app/exposicion-spot",
      },
    ],
  };
}

function buildRenewableProjection(input: AnalizadorInput): AnalizadorProyeccion | null {
  const renovables = input.renovables;
  if (!renovables) return null;

  const currentMonth = monthFromPeriod(input.periodo) ?? 12;
  const remainingMonths = Math.max(1, 12 - currentMonth);
  const gap = Math.max(0, renovables.brechaYtdMwh ?? 0);
  if (gap <= 0 && renovables.cumpleYtd !== false) return null;

  const monthlyNeed = gap / remainingMonths;

  return {
    id: "proyeccion-renovable-cierre",
    moduloOrigen: "renovables",
    titulo: "Cierre renovable del anio",
    periodoProyectado: "hasta fin de anio",
    baseAnalizada: "acumulado YTD",
    escenario: gap > 0 ? "riesgo" : "base",
    rango: gap > 0 ? `${compactMwh(gap)} de brecha actual` : "sin brecha activa",
    lectura: gap > 0
      ? "Si no se corrige la cobertura renovable, la brecha actual puede llegar al cierre anual."
      : "El ritmo renovable no muestra brecha activa, pero conviene mantener seguimiento mensual.",
    accionRecomendada: gap > 0
      ? `Sumar aproximadamente ${compactMwh(monthlyNeed)} renovables por mes desde ahora hasta diciembre.`
      : "Mantener control YTD y recalcular si aumenta la demanda.",
    confianza: "media",
    evidencia: [
      {
        label: "Brecha YTD",
        valor: compactMwh(gap),
        fuente: "Cumplimiento 27.191",
        urlModulo: "/app/cumplimiento-renovable",
      },
      {
        label: "Meses restantes",
        valor: String(remainingMonths),
        fuente: "Cumplimiento 27.191",
        urlModulo: "/app/cumplimiento-renovable",
      },
    ],
  };
}

function buildDemandProjection(input: AnalizadorInput): AnalizadorProyeccion | null {
  const history = input.historia;
  const rows = history?.serie?.filter((row) => row.demandaMwh != null) ?? [];
  if (!history || rows.length < 4) return null;

  const currentMonth = monthFromPeriod(input.periodo) ?? monthFromPeriod(rows.at(-1)?.periodo ?? "");
  if (currentMonth == null) return null;

  const nextMonths = [currentMonth + 1, currentMonth + 2, currentMonth + 3].map((month) => ((month - 1) % 12) + 1);
  const seasonalRows = rows.filter((row) => {
    const month = monthFromPeriod(row.periodo);
    return month != null && nextMonths.includes(month);
  });
  const seasonalAvg = avg(seasonalRows.map((row) => row.demandaMwh));
  const baseAvg = history.demandaPromedioUltimos12mMwh ?? avg(rows.slice(-12).map((row) => row.demandaMwh));
  if (seasonalAvg == null && baseAvg == null) return null;

  const projected = seasonalAvg ?? baseAvg ?? 0;
  const trend = history.variacionUltimos12mPct ?? 0;
  const adjusted = projected * (1 + Math.max(-0.15, Math.min(0.15, trend / 2)));

  return {
    id: "proyeccion-demanda-estacional",
    moduloOrigen: "historia",
    titulo: "Demanda esperada",
    periodoProyectado: "proximos 3 meses",
    baseAnalizada: "ultimos 36 meses",
    escenario: adjusted > (baseAvg ?? adjusted) * 1.1 ? "riesgo" : "base",
    rango: rangeAround(adjusted, 0.08, 0.12, compactMwh),
    lectura: "La demanda proyectada combina estacionalidad mensual y tendencia reciente del cliente.",
    accionRecomendada: "Comparar este rango contra cobertura contratada y capacidad operativa esperada.",
    confianza: seasonalRows.length >= 4 ? "media" : "baja",
    evidencia: [
      {
        label: "Promedio estacional",
        valor: compactMwh(seasonalAvg),
        fuente: "Historia Energetica",
        urlModulo: "/app/historia",
      },
      {
        label: "Tendencia 12 meses",
        valor: fmtPct(trend),
        fuente: "Historia Energetica",
        urlModulo: "/app/historia",
      },
    ],
  };
}

function buildCostProjection(input: AnalizadorInput): AnalizadorProyeccion | null {
  const dteRows = input.dte?.serie?.filter((row) => row.costoDtePesosMwh != null) ?? [];
  const costAvg = avg(dteRows.slice(-6).map((row) => row.costoDtePesosMwh)) ?? input.dte?.costoPromedioPesosMwh ?? null;
  if (costAvg == null) return null;

  const demandBase = input.historia?.ultimoMesDemandaMwh
    ?? avg(dteRows.slice(-3).map((row) => row.demandaRealMwh))
    ?? input.historia?.demandaPromedioUltimos12mMwh
    ?? null;
  if (demandBase == null) return null;

  const projectedCost = costAvg * demandBase;
  const trend = avg(dteRows.slice(-3).map((row) => row.costoDtePesosMwh)) ?? costAvg;
  const scenario = trend > costAvg * 1.08 ? "riesgo" : "base";

  return {
    id: "proyeccion-costo-mensual",
    moduloOrigen: "dte",
    titulo: "Costo mensual esperado",
    periodoProyectado: "proximo mes",
    baseAnalizada: "ultimos 6 meses",
    escenario: scenario,
    rango: rangeAround(projectedCost, 0.1, 0.15, fmtPesos),
    lectura: "El rango combina costo historico por MWh y demanda reciente para estimar el proximo cierre.",
    accionRecomendada: "Usar el rango para presupuesto y revisar cobertura si el escenario queda por encima del promedio reciente.",
    confianza: dteRows.length >= 3 ? "media" : "baja",
    evidencia: [
      {
        label: "Costo promedio usado",
        valor: `${fmtPesos(costAvg)}/MWh`,
        fuente: "Auditoria DTE",
        urlModulo: "/app/auditoria-dte",
      },
      {
        label: "Demanda base",
        valor: compactMwh(demandBase),
        fuente: "Historia / DTE",
        urlModulo: "/app/historia",
      },
    ],
  };
}

function buildProyecciones(input: AnalizadorInput): AnalizadorProyeccion[] {
  return [
    buildSpotProjection(input),
    buildRenewableProjection(input),
    buildDemandProjection(input),
    buildCostProjection(input),
  ].filter((item): item is AnalizadorProyeccion => Boolean(item));
}

export function buildAnalizadorResponse(input: AnalizadorInput): AnalizadorResponse {
  const insights = [
    ...buildSeasonalInsights(input),
    ...buildCrossModuleInsights(input),
    ...buildSpotInsights(input),
    ...buildDteInsights(input),
    ...buildRenewableInsights(input),
    ...buildPeakInsights(input),
    ...buildHistoryInsights(input),
    ...buildMarketInsights(input),
    ...buildInicioInsights(input),
  ].sort(byPriority);

  const insightsAlta = countPriority(insights, "alta");
  const insightsMedia = countPriority(insights, "media");
  const insightsBaja = countPriority(insights, "baja");
  const prioridadMaxima = insights[0]?.prioridad ?? null;
  const lecturas = buildLecturas(input);
  const proyecciones = buildProyecciones(input);

  return {
    resumen: {
      estadoGeneral: insightsAlta > 0 ? "critico" : insights.length > 0 ? "observacion" : "normal",
      focoPrincipal: insights[0]?.titulo ?? "Sin alertas relevantes",
      prioridadMaxima,
      totalInsights: insights.length,
      insightsAlta,
      insightsMedia,
      insightsBaja,
      analisisParcial: (input.warnings?.length ?? 0) > 0,
    },
    lecturas,
    proyecciones,
    insights,
    warnings: input.warnings ?? [],
  };
}
