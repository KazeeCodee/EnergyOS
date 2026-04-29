export type Compliance27191Point = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  demandaRealMwh: number | null;
  renovableContratadoMwh: number | null;
  importeRenovablePesos: number | null;
  precioImplicitoPesosMwh: number | null;
  generadoresUnicos: number;
  comercializadoresUnicos: number;
  obligacionPct: number | null;
  obligacionMwh: number | null;
  pctRenovableReal: number | null;
  pctRenovableYtd: number | null;
  demandaYtdMwh: number | null;
  renovableYtdMwh: number | null;
  brechaYtdMwh: number | null;
  brechaMwh: number | null;
  multaEstimadaPesos: number | null;
  multaRefPesosMwh: number | null;
  multaMetodo: "tabla_obligacion" | "cliente_12m" | "universo_anual" | "sin_precio" | string;
  cumpleMes: boolean;
  cumpleYtd: boolean;
  obligacionFuente: string;
  calidadDato: "cumple" | "brecha" | "sin_renovable" | "sin_demanda" | string;
};

export type Compliance27191Resumen = {
  meses: number;
  ultimoMes: Compliance27191Point | null;
  pctRenovablePromedio: number | null;
  renovableContratadoMwh: number;
  brechaMwh: number;
  multaEstimadaPesos: number;
  anioEnCurso: number | null;
  brechaAnioEnCursoMwh: number;
  multaAnioEnCursoPesos: number;
  cumpleYtd: boolean;
  brechaYtdMwh: number | null;
};

export type Compliance27191Response = {
  nemo: string;
  meses: number;
  autorizados: string[];
  resumen: Compliance27191Resumen;
  serie: Compliance27191Point[];
  notas: {
    multa: string;
    obligacion: string;
  };
};
