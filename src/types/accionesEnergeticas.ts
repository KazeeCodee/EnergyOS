export type AccionEstado = "pendiente" | "en_revision" | "resuelta" | "descartada";

export type AccionEnergetica = {
  id: number;
  nemo: string;
  tipoAgente: string | null;
  anio: number;
  mes: number;
  periodoLabel: string;
  reglaCodigo: string;
  titulo: string;
  descripcion: string;
  severidad: "critica" | "alta" | "media" | "baja" | string;
  estado: AccionEstado;
  impactoEstimadoPesos: number | null;
  origenModulo: string;
  origenTabla: string;
  detalle: Record<string, unknown>;
  generadaEn: string;
  actualizadaEn: string;
  resueltaEn: string | null;
  comentarioUltimo: string | null;
};

export type AccionEvento = {
  id: number;
  accionId: number;
  actorUserId: string | null;
  estadoAnterior: AccionEstado | null;
  estadoNuevo: AccionEstado | null;
  comentario: string | null;
  creadoEn: string;
};

export type AccionesEnergeticasResumen = {
  total: number;
  abiertas: number;
  pendientes: number;
  enRevision: number;
  resueltas: number;
  descartadas: number;
  criticas: number;
  altas: number;
  impactoAbiertoPesos: number;
};

export type AccionesEnergeticasResponse = {
  nemo: string;
  meses: number;
  estado: "abiertas" | "todas" | AccionEstado;
  autorizados: string[];
  resumen: AccionesEnergeticasResumen;
  acciones: AccionEnergetica[];
  eventos: AccionEvento[];
  notas: {
    alcance: string;
  };
};
