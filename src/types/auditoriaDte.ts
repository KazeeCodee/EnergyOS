export type AuditoriaDtePoint = {
  periodo: string;
  anio: number;
  mes: number;
  tipoAgente: string | null;
  nemo: string;
  facturaTotalPesos: number | null;
  subtotalConceptosPesos: number | null;
  desvioReconciliacionPesos: number | null;
  desvioReconciliacionPct: number | null;
  variacionMomPct: number | null;
  variacionYoyPct: number | null;
  demandaRealMwh: number | null;
  costoDtePesosMwh: number | null;
  energiaPesos: number | null;
  potenciaPesos: number | null;
  transportePesos: number | null;
  obrasServiciosPesos: number | null;
  ajustesOperativosPesos: number | null;
  cargosAplicadosPesos: number | null;
  conceptosCount: number;
  importeRevisablePesos: number | null;
  estadoAuditoria: "ok" | "sin_factura_total" | "sin_conceptos" | "revisar_reconciliacion" | "variacion_mensual_alta" | string;
  sourceRowDesde: number | null;
  sourceRowHasta: number | null;
};

export type AuditoriaDteConcepto = {
  bloqueCodigo: string;
  bloqueNombre: string;
  conceptoCodigo: string;
  conceptoNombre: string;
  importePesos: number | null;
  sourceFile: string | null;
  sourceRowDesde: number | null;
  sourceRowHasta: number | null;
  sourceRowsCount: number;
};

export type AuditoriaDteResumen = {
  meses: number;
  ultimoMes: AuditoriaDtePoint | null;
  facturaTotalPesos: number;
  importeRevisablePesos: number;
  mesesConRevision: number;
  costoPromedioPesosMwh: number | null;
};

export type AuditoriaDteResponse = {
  nemo: string;
  meses: number;
  autorizados: string[];
  resumen: AuditoriaDteResumen;
  serie: AuditoriaDtePoint[];
  conceptosUltimoMes: AuditoriaDteConcepto[];
  notas: {
    alcance: string;
    estado: string;
  };
};
