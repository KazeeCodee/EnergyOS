export type FactorCargaPoint = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  horasMes: number;
  demandaRealMwh: number | null;
  demandaRealPicoMwh: number | null;
  demandaRealValleMwh: number | null;
  demandaRealRestoMwh: number | null;
  factorCargaPct: number | null;
  factorCargaMetodo: "no_disponible_sin_potencia_maxima" | string;
  pctPico: number | null;
  pctValle: number | null;
  pctResto: number | null;
  ratioPicoValle: number | null;
  concentracionPicoScore: number | null;
  demandaRealYoyBaseMwh: number | null;
  estacionalidadYoy: number | null;
  pctPicoPercentil: number | null;
  ratioPicoVallePercentil: number | null;
  calidadDato: "ok" | "sin_demanda" | "sin_apertura_pvr" | "pvr_no_cierra" | string;
};

export type FactorCargaBenchmarkPoint = {
  periodo: string;
  tipoAgente: string;
  anio: number;
  mes: number;
  agentesTotal: number;
  agentesConPvr: number;
  pctPicoP25: number | null;
  pctPicoP50: number | null;
  pctPicoP75: number | null;
  pctValleP25: number | null;
  pctValleP50: number | null;
  pctValleP75: number | null;
  pctRestoP25: number | null;
  pctRestoP50: number | null;
  pctRestoP75: number | null;
  ratioPicoValleP25: number | null;
  ratioPicoValleP50: number | null;
  ratioPicoValleP75: number | null;
  concentracionPicoP25: number | null;
  concentracionPicoP50: number | null;
  concentracionPicoP75: number | null;
};

export type FactorCargaResumen = {
  meses: number;
  mesesConPvr: number;
  ultimoMes: FactorCargaPoint | null;
  factorCargaPct: null;
  factorCargaMetodo: "no_disponible_sin_potencia_maxima";
  pctPicoPromedio: number | null;
  pctVallePromedio: number | null;
  pctRestoPromedio: number | null;
  ratioPicoVallePromedio: number | null;
  pctPicoPercentilPromedio: number | null;
  estacionalidadYoyUltimoMes: number | null;
  calidadDatoUltimoMes: string | null;
};

export type FactorCargaResponse = {
  nemo: string;
  meses: number;
  autorizados: string[];
  resumen: FactorCargaResumen;
  serie: FactorCargaPoint[];
  benchmark: FactorCargaBenchmarkPoint[];
  notas: {
    factorCarga: string;
  };
};
