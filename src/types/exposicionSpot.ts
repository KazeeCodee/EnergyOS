export type ExposicionSpotPoint = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  distribuidorNemo: string | null;
  demandaRealMwh: number | null;
  demandaRealPicoMwh: number | null;
  demandaRealValleMwh: number | null;
  demandaRealRestoMwh: number | null;
  demandaContratadaMwh: number | null;
  compraSpotMwh: number | null;
  compraSpotPicoMwh: number | null;
  compraSpotValleMwh: number | null;
  compraSpotRestoMwh: number | null;
  spotPesos: number | null;
  pctSpot: number | null;
  pctMat: number | null;
  sobreContratoMwh: number | null;
  subContratoMwh: number | null;
  costoSpotPromedioPesosMwh: number | null;
  calidadDato: "ok" | "gume_spot_only" | "sin_demanda" | "spot_mayor_demanda" | string;
};

export type ExposicionSpotResumen = {
  meses: number;
  demandaRealMwh: number;
  compraSpotMwh: number;
  demandaContratadaMwh: number;
  pctSpot: number | null;
  pctMat: number | null;
  spotPesos: number;
  costoSpotPromedioPesosMwh: number | null;
  subContratoMwh: number;
  sobreContratoMwh: number;
};

export type ExposicionSpotResponse = {
  nemo: string;
  meses: number;
  /** Mes ancla (YYYY-MM) usado como tope superior. null = último disponible. */
  hasta?: string | null;
  autorizados: string[];
  resumen: ExposicionSpotResumen;
  serie: ExposicionSpotPoint[];
};
