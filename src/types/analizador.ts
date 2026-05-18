export type AnalizadorModuloOrigen =
  | "spot"
  | "dte"
  | "renovables"
  | "perfil_carga"
  | "historia"
  | "mercado"
  | "inicio";

export type AnalizadorTipo = "alerta" | "riesgo" | "oportunidad" | "mejora";
export type AnalizadorPrioridad = "alta" | "media" | "baja";
export type AnalizadorConfianza = "alta" | "media" | "baja";
export type AnalizadorEstadoGeneral = "normal" | "observacion" | "critico";
export type AnalizadorHorizonte = "ahora" | "tendencia" | "anticipacion" | "ytd";

export type AnalizadorEvidencia = {
  label: string;
  valor: string;
  fuente: string;
  urlModulo: string;
};

export type AnalizadorInsight = {
  id: string;
  periodo: string;
  moduloOrigen: AnalizadorModuloOrigen;
  tipo: AnalizadorTipo;
  prioridad: AnalizadorPrioridad;
  horizonte: AnalizadorHorizonte;
  periodoAnalizado: string;
  confianza: AnalizadorConfianza;
  titulo: string;
  problema: string;
  impacto: string;
  accionRecomendada: string;
  responsableSugerido: "duenio" | "finanzas" | "administracion" | "energia" | "asesor";
  evidencia: AnalizadorEvidencia[];
};

export type AnalizadorLectura = {
  id: string;
  moduloOrigen: AnalizadorModuloOrigen;
  titulo: string;
  valor: string;
  estado: "bien" | "observar" | "accion";
  periodoAnalizado: string;
  lectura: string;
  accionSugerida: string;
  urlModulo: string;
};

export type AnalizadorProyeccion = {
  id: string;
  moduloOrigen: AnalizadorModuloOrigen;
  titulo: string;
  periodoProyectado: string;
  baseAnalizada: string;
  escenario: "base" | "riesgo" | "oportunidad";
  rango: string;
  lectura: string;
  accionRecomendada: string;
  confianza: AnalizadorConfianza;
  evidencia: AnalizadorEvidencia[];
};

export type AnalizadorResumen = {
  estadoGeneral: AnalizadorEstadoGeneral;
  focoPrincipal: string;
  prioridadMaxima: AnalizadorPrioridad | null;
  totalInsights: number;
  insightsAlta: number;
  insightsMedia: number;
  insightsBaja: number;
  analisisParcial: boolean;
};

export type AnalizadorResponse = {
  resumen: AnalizadorResumen;
  lecturas: AnalizadorLectura[];
  proyecciones: AnalizadorProyeccion[];
  insights: AnalizadorInsight[];
  warnings: string[];
};
