export type HistoriaEnergeticaPoint = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  demandaMwh: number | null;
  energiaBandaPicoMwh: number | null;
  energiaBandaValleMwh: number | null;
  energiaBandaRestoMwh: number | null;
  demandaYoyBaseMwh: number | null;
  yoyPct: number | null;
};

export type HistoriaEnergeticaHeatmapPoint = {
  anio: number;
  mes: number;
  periodo: string;
  demandaMwh: number | null;
  intensidadNormalizada: number | null;
};

export type HistoriaEnergeticaResumen = {
  tipoAgente: string;
  nemo: string;
  mesesDisponibles: number;
  primerPeriodo: string;
  ultimoPeriodo: string;
  demandaTotalMwh: number | null;
  demandaPromedioMensualMwh: number | null;
  demandaUltimos12mMwh: number | null;
  demandaPromedioUltimos12mMwh: number | null;
  demanda12mPreviosMwh: number | null;
  variacionUltimos12mPct: number | null;
  primerMesDemandaMwh: number | null;
  ultimoMesDemandaMwh: number | null;
  mismoMesAnioAnteriorMwh: number | null;
  variacionYoyUltimoMesPct: number | null;
  mesMayorConsumo: {
    periodo: string;
    anio: number;
    mes: number;
    demandaMwh: number | null;
  };
  mesMenorConsumo: {
    periodo: string;
    anio: number;
    mes: number;
    demandaMwh: number | null;
  };
};

export type HistoriaEnergeticaResponse = {
  nemo: string;
  meses: number;
  autorizados: string[];
  serieMensual: HistoriaEnergeticaPoint[];
  heatmap: HistoriaEnergeticaHeatmapPoint[];
  resumen: HistoriaEnergeticaResumen | null;
};
