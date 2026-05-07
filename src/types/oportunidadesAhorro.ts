export type OportunidadAhorro = {
  rankingNemo: number;
  nemo: string;
  tipoAgente: string | null;
  anio: number;
  mes: number;
  periodoLabel: string;
  oportunidadCodigo: string;
  oportunidadNombre: string;
  dolorCliente: string;
  accionRecomendada: string;
  impactoEstimadoPesos: number;
  prioridad: "alta" | "media" | "baja" | string;
  confianza: "alta" | "media" | "baja" | string;
  rankingScore: number;
  origenModulo: string;
  origenTabla: string;
  detalle: Record<string, unknown>;
};

export type OportunidadCategoria = {
  ranking: number;
  oportunidadCodigo: string;
  oportunidadNombre: string;
  dolorCliente: string;
  accionRecomendada: string;
  impactoTotalPesos: number;
  rankingScore: number;
  prioridad: "alta" | "media" | "baja" | string;
  confianza: "alta" | "media" | "baja" | string;
  periodosCount: number;
  periodoTop: string;
  origenModulo: string;
};

export type OportunidadesAhorroResumen = {
  oportunidades: number;
  categorias: number;
  impactoTotalPesos: number;
  topCategoria: OportunidadCategoria | null;
  altas: number;
  confianzaAlta: number;
};

export type OportunidadesAhorroResponse = {
  nemo: string;
  meses: number;
  autorizados: string[];
  resumen: OportunidadesAhorroResumen;
  categorias: OportunidadCategoria[];
  oportunidades: OportunidadAhorro[];
  notas: {
    alcance: string;
  };
};
