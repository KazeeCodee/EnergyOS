export type PlanId = "compliance" | "gestion" | "full" | "white-label";

export type Plan = {
  id: PlanId;
  nombre: string;
  precio_usd: number | null;
  descripcion: string;
  features: string[];
  recomendado?: boolean;
};

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
  acuerdo_mensual_mwh: number;
};

export type ComplianceRow = {
  mes: string;
  demanda_mwh: number;
  mater_mwh: number;
  spot_mwh: number;
  porcentaje_renovable: number;
  acuerdo_mes_mwh: number;
  cumple: boolean;
  alerta: boolean;
};

export type CostRow = {
  mes: string;
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
  score: "optimo" | "en_rango" | "caro" | "muy_caro";
  vigencia: string;
  energia_anual_mwh: number;
};

export type ContratosData = {
  precio_mercado_referencia: number;
  contratos: ContratoView[];
};

export type CostosData = {
  serie: CostRow[];
  desglose_oct_2025: { concepto: string; valor_usd: number }[];
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
  created_at: string;
};

export type AdminProcesamiento = {
  id: string;
  anio: number;
  mes: number;
  estado: "pendiente" | "procesando" | "completo" | "error";
  resumen: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};
