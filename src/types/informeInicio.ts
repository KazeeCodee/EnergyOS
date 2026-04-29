export type InformeInicioMix = {
  materEstimadoPct: number | null;
  spotPct: number | null;
  plusPct: number | null;
};

export type InformeInicioUniversoBucket = {
  disponible: boolean;
  demandaTotalGwh: number | null;
  agentesCount: number | null;
  mix: InformeInicioMix;
  plusDisponible: boolean;
};

export type InformeInicioResponse = {
  contexto: {
    anio: number;
    mes: number;
    periodo: string;
    ultimoMesDisponible: string;
    warnings: string[];
  };
  mercado: null | {
    fuente: string;
    periodoCompleto: boolean;
    fuenteDesde: string | null;
    fuenteHasta: string | null;
    generacionPorTipo: Array<{ tipo: string; pct: number | null; gwh: number | null }>;
    generacionTotalGwh: number | null;
    generacionTotalMomPct: number | null;
    generacionTotalYoyPct: number | null;
    generacionMaterGwh: number | null;
    generacionMaterMomPct: number | null;
    generacionMaterYoyPct: number | null;
    pctRenovableSistema: number | null;
  };
  universo: {
    guma: InformeInicioUniversoBucket;
    gume: InformeInicioUniversoBucket;
    gudi: InformeInicioUniversoBucket;
  };
  cliente: {
    disponible: boolean;
    razonNoDisponible: string | null;
    nemo: string;
    descripcion: string | null;
    tipoAgente: string | null;
    agrupacion: string | null;
    demandaAnioMovil: Array<{ anioMes: string; mwh: number | null }>;
    demandaMes: null | {
      totalGwh: number | null;
      energiaBandaPicoMwh: number | null;
      energiaBandaValleMwh: number | null;
      energiaBandaRestoMwh: number | null;
      mix: InformeInicioMix;
      plusDisponible: boolean;
    };
    demandaAnioMovilTotal: {
      totalGwh: number;
      mix: InformeInicioMix;
      plusDisponible: boolean;
    };
    pctRenovableAnio: number | null;
    cumple27191: boolean | null;
  };
};
