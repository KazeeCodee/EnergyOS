export type PlanId = "compliance" | "gestion" | "full" | "white-label";

export type Session = {
  email: string;
  empresa: string;
};

export type EmpresaData = {
  id: string;
  razon_social: string;
  nemo: string;
  tipo_usuario: string;
  comercializador: string;
  plan_activo: PlanId;
  miembro_desde: string;
  acuerdo_mensual_mwh: number | null;
};

export type ComplianceRow = {
  mes: string;
  anio: number;
  mes_numero: number;
  demanda_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  porcentaje_renovable: number;
  acuerdo_mes_mwh: number;
  cumple: boolean;
  alerta: boolean;
  dato_sospechoso: boolean;
  sospechoso_motivo: string | null;
};

export type CostRow = {
  mes: string;
  anio: number;
  mes_numero: number;
  tipo: "historico" | "proyeccion";
  costo_usd_mwh: number;
  demanda_mwh: number;
  total_usd: number;
  es_pico: boolean;
};

export type MercadoData = {
  mem_mix: { name: string; value: number }[];
  mater_spot: { name: string; value: number }[];
};

export type ContratoView = {
  id: string;
  tipo: "RPB" | "RPE" | "BAS";
  generador: string;
  precio_usd_mwh: number;
  score: "optimo" | "en_rango" | "caro" | "muy_caro" | "sin_referencia";
  vigencia: string;
  energia_anual_mwh: number;
};

export type ContratosData = {
  precio_mercado_referencia: number;
  precio_mercado_por_tipo: { RPB: number; RPE: number; BAS: number };
  contratos: ContratoView[];
};

export type DesgloseConcepto = {
  concepto: string;
  valor_usd: number;
  estimado: boolean;
};

export type CostosData = {
  serie: CostRow[];
  desglose_mes: DesgloseConcepto[];
  desglose_periodo: { anio: number; mes: number } | null;
};

export type AdminRawData = {
  anio: number;
  mes: number;
  mater_mwh: number;
  demanda_total_mwh: number;
  importe_mater_pesos: number;
  precio_efectivo_pesos_mwh: number;
  precio_spot_pico_pesos_mwh: number;
  precio_spot_valle_pesos_mwh: number;
  precio_spot_resto_pesos_mwh: number;
  cargo_transporte_pesos_mwh: number;
};

export type AdminEmpresaRow = {
  id: string;
  razon_social: string;
  tipo_usuario: string;
  plan_activo: PlanId;
  comercializador: string;
  nemos: string[];
  contratos: number;
  ultimo_mes: string;
  demanda_total_mwh: number;
  porcentaje_renovable: number;
};

export type AdminEmpresaOption = {
  id: string;
  razon_social: string;
  nemos: string[];
};

export type AdminStats = {
  empresas: number;
  nemos: number;
  contratos: number;
  demanda_total_mwh: number;
  mater_mwh: number;
  promedio_renovable: number;
  clientes_riesgo: number;
  archivos: number;
  procesamientos: number;
};

export type AdminArchivo = {
  id: string;
  tipo: "DTE" | "VARIABLES_RELEVANTES" | "OTRO";
  anio: number;
  mes: number;
  file_name: string;
  file_path: string;
  uploaded_by?: string | null;
  created_at: string;
};

export type AdminProcesamientoEmpresa = {
  id: string;
  procesamiento_id: string;
  empresa_id: string | null;
  empresa_nombre: string;
  estado: "pendiente" | "completo" | "error" | "sin_datos";
  mensaje: string | null;
  demanda_total_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  created_at: string;
};

export type AdminProcesamiento = {
  id: string;
  anio: number;
  mes: number;
  estado: "pendiente" | "procesando" | "completo" | "error";
  resumen: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  dte_archivo: AdminArchivo | null;
  variables_archivo: AdminArchivo | null;
  empresas: AdminProcesamientoEmpresa[];
};

export type AdminSystemTable = {
  nombre: string;
  proposito: string;
  campos: string[];
};

export type AdminSystemMetric = {
  nombre: string;
  descripcion: string;
  tablas: string[];
  campos: string[];
  operacion: string;
  salida: string;
};

export type AdminSystemAgent = {
  id: string;
  razon_social: string;
  nemo: string;
  tipo_agente: string;
  cobertura_desde: string | null;
  cobertura_hasta: string | null;
  meses_cargados: number;
  estado: "completo" | "parcial";
};

export type AdminSystemOverview = {
  ultima_actualizacion: string;
  resumen: {
    agentes_cammesa: number;
    agentes_monitoreados: number;
    agentes_con_datos: number;
    filas_datos_mensuales: number;
    periodos_cubiertos: number;
    periodo_desde: string | null;
    periodo_hasta: string | null;
  };
  tablas: AdminSystemTable[];
  metricas: AdminSystemMetric[];
  agentes: AdminSystemAgent[];
};

export type AdminAnalyticsAgentOption = {
  id: string;
  razon_social: string;
  nemo: string;
  tipo_agente: string;
};

export type AdminAnalyticsPeriodOption = {
  value: string;
  label: string;
};

export type AdminAnalyticsConsumptionPoint = {
  periodo: string;
  etiqueta: string;
  demanda_total_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  porcentaje_renovable: number;
};

export type AdminAnalyticsCostPoint = {
  periodo: string;
  etiqueta: string;
  costo_total_estimado_usd: number;
  costo_monomico_usd_mwh: number;
  costo_spot_usd_mwh: number;
  costo_renovable_usd_mwh: number;
  cargo_transporte_pesos_mwh: number;
  precio_spot_pesos_mwh: number;
};

export type AdminAnalyticsMarketPoint = {
  periodo: string;
  etiqueta: string;
  mix_termica_pct: number;
  mix_hidraulica_pct: number;
  mix_nuclear_pct: number;
  mix_renovable_pct: number;
  precio_spot_usd_mwh: number;
  costo_renovable_usd_mwh: number;
  costo_cammesa_usd_mwh: number;
};

export type AdminAnalyticsQualityPoint = {
  periodo: string;
  etiqueta: string;
  dato_sospechoso: boolean;
  sospechoso_motivo: string | null;
};

export type AdminAnalyticsOverview = {
  agentes: AdminAnalyticsAgentOption[];
  periodos: AdminAnalyticsPeriodOption[];
  seleccionado: {
    agente_id: string;
    desde: string;
    hasta: string;
  };
  agente_actual: {
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  } | null;
  resumen: {
    meses_disponibles: number;
    meses_seleccionados: number;
    demanda_total_mwh: number;
    mater_total_mwh: number;
    spot_total_mwh: number;
    porcentaje_renovable_promedio: number;
    costo_total_usd: number;
    costo_monomico_promedio_usd_mwh: number;
    precio_spot_promedio_usd_mwh: number;
    transporte_promedio_pesos_mwh: number;
    mix_renovable_promedio_pct: number;
    meses_sospechosos: number;
    cobertura_pct: number;
    ultimo_procesado_en: string | null;
  };
  consumo_serie: AdminAnalyticsConsumptionPoint[];
  costos_serie: AdminAnalyticsCostPoint[];
  mercado_serie: AdminAnalyticsMarketPoint[];
  calidad_serie: AdminAnalyticsQualityPoint[];
  mix_promedio: { name: string; value: number }[];
};

export type AdminModule1MonthlyPoint = {
  periodo: string;
  etiqueta: string;
  demanda_total_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  porcentaje_renovable: number;
  importe_mater_pesos: number | null;
  precio_efectivo_pesos_mwh: number | null;
  procesado_en: string | null;
};

export type AdminModule1Overview = {
  agentes: AdminAnalyticsAgentOption[];
  periodos: AdminAnalyticsPeriodOption[];
  seleccionado: {
    agente_id: string;
    desde: string;
    hasta: string;
  };
  agente_actual: {
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  } | null;
  resumen: {
    meses_en_rango: number;
    meses_con_datos: number;
    demanda_total_mwh: number;
    mater_total_mwh: number;
    spot_total_mwh: number;
    porcentaje_renovable_ponderado: number;
    importe_mater_pesos: number;
    precio_efectivo_promedio_pesos_mwh: number;
    primer_periodo_con_datos: string | null;
    ultimo_periodo_con_datos: string | null;
    ultimo_procesado_en: string | null;
  };
  serie: AdminModule1MonthlyPoint[];
};

export type AdminModule2MonthlyPoint = {
  periodo: string;
  etiqueta: string;
  demanda_total_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  costo_total_estimado_usd: number;
  costo_monomico_usd_mwh: number;
  costo_spot_usd_mwh: number;
  costo_renovable_usd_mwh: number;
  cargo_transporte_pesos_mwh: number | null;
  precio_spot_pesos_mwh: number | null;
  dato_sospechoso: boolean;
  sospechoso_motivo: string | null;
  raw_completo: boolean;
  procesado_en: string | null;
};

export type AdminModule2Overview = {
  agentes: AdminAnalyticsAgentOption[];
  periodos: AdminAnalyticsPeriodOption[];
  seleccionado: {
    agente_id: string;
    desde: string;
    hasta: string;
  };
  agente_actual: {
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  } | null;
  resumen: {
    meses_en_rango: number;
    meses_con_datos: number;
    meses_raw_completos: number;
    costo_total_usd: number;
    costo_monomico_promedio_usd_mwh: number;
    costo_spot_promedio_usd_mwh: number;
    costo_renovable_promedio_usd_mwh: number;
    transporte_promedio_pesos_mwh: number;
    ultimo_procesado_en: string | null;
  };
  serie: AdminModule2MonthlyPoint[];
};

export type AdminModule3MonthlyPoint = {
  periodo: string;
  etiqueta: string;
  mix_termica_pct: number;
  mix_hidraulica_pct: number;
  mix_nuclear_pct: number;
  mix_renovable_pct: number;
  precio_spot_usd_mwh: number;
  costo_renovable_usd_mwh: number;
  costo_cammesa_usd_mwh: number;
  raw_economico_completo: boolean;
  tiene_datos_agente: boolean;
};

export type AdminModule3Overview = {
  agentes: AdminAnalyticsAgentOption[];
  periodos: AdminAnalyticsPeriodOption[];
  seleccionado: {
    agente_id: string;
    desde: string;
    hasta: string;
  };
  agente_actual: {
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  } | null;
  resumen: {
    meses_en_rango: number;
    meses_con_mercado: number;
    meses_raw_economicos: number;
    mix_renovable_promedio_pct: number;
    precio_spot_promedio_usd_mwh: number;
    costo_renovable_promedio_usd_mwh: number;
    costo_cammesa_promedio_usd_mwh: number;
  };
  serie: AdminModule3MonthlyPoint[];
  mix_promedio: { name: string; value: number }[];
};

export type AdminModule4QualityPoint = {
  periodo: string;
  etiqueta: string;
  dato_sospechoso: boolean;
  sospechoso_motivo: string | null;
  raw_completo: boolean;
  mercado_publicado: boolean;
  procesado_en: string | null;
};

export type AdminModule4Overview = {
  agentes: AdminAnalyticsAgentOption[];
  periodos: AdminAnalyticsPeriodOption[];
  seleccionado: {
    agente_id: string;
    desde: string;
    hasta: string;
  };
  agente_actual: {
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  } | null;
  resumen: {
    meses_en_rango: number;
    meses_con_datos_agente: number;
    meses_raw_completos: number;
    meses_mercado_publicado: number;
    meses_sospechosos: number;
    cobertura_agente_pct: number;
    ultimo_procesado_en: string | null;
  };
  serie: AdminModule4QualityPoint[];
};
