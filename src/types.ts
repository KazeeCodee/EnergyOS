export type PlanId = "compliance" | "gestion" | "full" | "white-label";

export type Session = {
  email: string;
  empresa: string;
};

export type EmpresaData = {
  id: string;
  razon_social: string;
  nemo: string;
  tipo_usuario: "GUMA" | "GUME" | "GUDI";
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
