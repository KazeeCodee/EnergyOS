import { supabase } from "../lib/supabase";
import type {
  AdminAnalyticsAgentOption,
  AdminAnalyticsConsumptionPoint,
  AdminAnalyticsCostPoint,
  AdminAnalyticsMarketPoint,
  AdminAnalyticsOverview,
  AdminAnalyticsPeriodOption,
  AdminAnalyticsQualityPoint,
  AdminArchivo,
  AdminEmpresaOption,
  AdminEmpresaRow,
  AdminModule1MonthlyPoint,
  AdminModule1Overview,
  AdminModule2MonthlyPoint,
  AdminModule2Overview,
  AdminModule3MonthlyPoint,
  AdminModule3Overview,
  AdminModule4Overview,
  AdminModule4QualityPoint,
  AdminProcesamiento,
  AdminProcesamientoEmpresa,
  AdminStats,
  AdminSystemAgent,
  AdminSystemMetric,
  AdminSystemOverview,
  AdminSystemTable,
} from "../types";

type MonitoredAgentRow = {
  id: string;
  razon_social: string;
  tipo_agente: string | null;
  nemo: string;
};

type MensualRow = {
  empresa_id: string;
  anio: number;
  mes: number;
  demanda_total_mwh: number | string;
  mater_mwh: number | string;
  porcentaje_renovable: number | string;
  dato_sospechoso?: boolean | null;
};

type ProcesoEmpresaRow = {
  id: string;
  procesamiento_id: string;
  empresa_id: string | null;
  estado: "pendiente" | "completo" | "error" | "sin_datos";
  mensaje: string | null;
  demanda_total_mwh: number | string | null;
  mater_mwh: number | string | null;
  spot_mwh: number | string | null;
  created_at: string;
  empresa?: {
    razon_social?: string | null;
  } | null;
};

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const systemTables: AdminSystemTable[] = [
  {
    nombre: "cammesa_agentes_mem",
    proposito: "Catalogo fuente de agentes CAMMESA disponibles para ser monitoreados por EnergyOS.",
    campos: ["id", "nemo", "descripcion", "agrupacion", "tipo_agente", "fecha_proceso", "lote_id_log"],
  },
  {
    nombre: "agentes_monitoreados",
    proposito: "Agentes que EnergyOS sigue activamente y sobre los que conserva historico procesado.",
    campos: [
      "id",
      "cammesa_agente_id",
      "nemo",
      "razon_social",
      "tipo_agente",
      "agrupacion",
      "activo",
      "seguimiento_desde",
      "cobertura_desde",
      "cobertura_hasta",
      "ultima_captura_periodo",
      "created_at",
    ],
  },
  {
    nombre: "datos_mensuales",
    proposito: "Resultado mensual por agente monitoreado luego del cruce y procesamiento de archivos CAMMESA.",
    campos: [
      "empresa_id",
      "nemo",
      "anio",
      "mes",
      "demanda_total_mwh",
      "mater_mwh",
      "spot_mwh",
      "saldo_total_mwh",
      "porcentaje_renovable",
      "costo_renovable_usd_mwh",
      "costo_spot_usd_mwh",
      "costo_total_estimado_usd",
      "importe_mater_pesos",
      "precio_efectivo_pesos_mwh",
      "cargo_transporte_pesos_mwh",
      "precio_spot_pesos_mwh",
      "dato_sospechoso",
      "sospechoso_motivo",
      "procesado_en",
    ],
  },
  {
    nombre: "datos_mercado",
    proposito: "Contexto mensual de mercado usado para comparar mix de generacion, spot y costos medios.",
    campos: [
      "anio",
      "mes",
      "generacion_total_gwh",
      "generacion_mater_gwh",
      "mix_termica_pct",
      "mix_hidraulica_pct",
      "mix_nuclear_pct",
      "mix_renovable_pct",
      "precio_spot_usd_mwh",
      "costo_renovable_usd_mwh",
      "costo_cammesa_usd_mwh",
      "mater_mom_pct",
      "mater_yoy_pct",
      "precio_spot_pico_pesos_mwh",
      "precio_spot_valle_pesos_mwh",
      "precio_spot_resto_pesos_mwh",
      "cargo_transporte_pesos_mwh",
    ],
  },
  {
    nombre: "cammesa_archivos",
    proposito: "Registro de archivos subidos o descargados para cada proceso operativo.",
    campos: ["id", "tipo", "anio", "mes", "file_path", "file_name", "size_bytes", "content_type", "uploaded_by", "created_at"],
  },
  {
    nombre: "procesamientos",
    proposito: "Corridas mensuales del pipeline con estado, resumen y referencias a archivos.",
    campos: ["id", "anio", "mes", "dte_archivo_id", "variables_archivo_id", "estado", "resumen", "creado_por", "started_at", "completed_at", "error_message", "created_at"],
  },
  {
    nombre: "procesamiento_empresas",
    proposito: "Detalle por agente monitoreado dentro de cada corrida mensual.",
    campos: ["id", "procesamiento_id", "empresa_id", "estado", "mensaje", "demanda_total_mwh", "mater_mwh", "spot_mwh", "created_at"],
  },
  {
    nombre: "audit_logs",
    proposito: "Traza administrativa de acciones operativas ejecutadas sobre el sistema.",
    campos: ["id", "actor_user_id", "action", "entity", "entity_id", "metadata", "created_at"],
  },
  {
    nombre: "admin_profiles",
    proposito: "Usuarios administradores con acceso al backoffice interno.",
    campos: ["user_id", "is_admin", "created_at"],
  },
  {
    nombre: "cammesa_demanda_historica",
    proposito: "Historico de demanda por agente para analisis de soporte y cruces secundarios.",
    campos: ["anio", "mes", "agente_nemo", "agente_descripcion", "tipo_agente", "region", "provincia", "categoria_area", "categoria_demanda", "tarifa", "categoria_tarifa", "demanda_mwh", "indice_tiempo"],
  },
  {
    nombre: "cammesa_demanda_ultimos_anos",
    proposito: "Serie consolidada de demanda reciente de CAMMESA por agente.",
    campos: ["id", "anio", "mes", "agente_nemo", "agente_descripcion", "tipo_agente", "region", "provincia", "categoria_area", "categoria_demanda", "tarifa", "categoria_tarifa", "demanda_mwh", "fecha_proceso", "lote_id_log", "indice_tiempo"],
  },
  {
    nombre: "cammesa_generacion",
    proposito: "Generacion neta por maquina, central y fuente para contexto de mercado.",
    campos: ["id", "anio", "mes", "maquina", "central", "agente", "agente_descripcion", "region", "pais", "tipo_maquina", "fuente_generacion", "tecnologia", "categoria_hidraulica", "categoria_region", "generacion_neta_mwh", "fecha_proceso", "lote_id_log", "indice_tiempo"],
  },
  {
    nombre: "cammesa_potencia_instalada",
    proposito: "Potencia instalada por central y fuente de generacion.",
    campos: ["id", "periodo", "central", "agente", "agente_descripcion", "region", "categoria_region", "tipo_maquina", "fuente_generacion", "tecnologia", "potencia_instalada_mw", "fecha_proceso", "lote_id_log", "mes", "indice_tiempo", "anio"],
  },
  {
    nombre: "cammesa_combustibles",
    proposito: "Consumo de combustibles por maquina para entender el mix termico.",
    campos: ["id", "anio", "mes", "maquina", "central", "agente", "agente_descripcion", "tipo_maquina", "fuente_generacion", "tecnologia", "combustible", "consumo", "fecha_proceso", "lote_id_log", "indice_tiempo"],
  },
  {
    nombre: "cammesa_balance_energia",
    proposito: "Balances de energia del sistema electrico para series agregadas.",
    campos: ["id", "anio", "mes", "balance", "tipo", "energia_mwh", "fecha_proceso", "lote_id_log", "indice_tiempo"],
  },
  {
    nombre: "cammesa_importaciones_exportaciones",
    proposito: "Intercambios de energia por pais y periodo.",
    campos: ["id", "anio", "mes", "pais", "tipo", "energia_mwh", "fecha_proceso", "lote_id_log", "indice_tiempo"],
  },
  {
    nombre: "cammesa_demanda_temperatura",
    proposito: "Serie corta de demanda y temperatura usada como referencia operativa diaria.",
    campos: ["fecha", "prevista", "semana_ant", "ayer", "hoy", "tem_prevista", "tem_semana_ant", "tem_ayer", "tem_hoy"],
  },
  {
    nombre: "cammesa_porcentaje_generacion",
    proposito: "Composicion porcentual diaria de generacion por fuente.",
    campos: ["fecha", "nuclear", "termico", "renovable_hidro_50mw", "renovable_ley_26190", "importacion"],
  },
];

const systemMetrics: AdminSystemMetric[] = [
  {
    nombre: "Demanda total mensual",
    descripcion: "Energia mensual total asignada al agente monitoreado.",
    tablas: ["agentes_monitoreados", "datos_mensuales"],
    campos: ["agentes_monitoreados.id", "datos_mensuales.empresa_id", "datos_mensuales.demanda_total_mwh"],
    operacion: "Cruce por empresa_id y lectura directa del campo mensual procesado.",
    salida: "MWh mensuales de demanda total por agente.",
  },
  {
    nombre: "Energia MATER mensual",
    descripcion: "Volumen mensual de energia renovable contratada o informada para el agente.",
    tablas: ["datos_mensuales"],
    campos: ["mater_mwh"],
    operacion: "Lectura directa del valor procesado en la corrida mensual.",
    salida: "MWh MATER por mes y por agente.",
  },
  {
    nombre: "Energia SPOT mensual",
    descripcion: "Volumen que no estuvo cubierto por MATER y queda expuesto a spot.",
    tablas: ["datos_mensuales"],
    campos: ["spot_mwh"],
    operacion: "Lectura directa del valor procesado o inferido en el pipeline.",
    salida: "MWh SPOT por mes y por agente.",
  },
  {
    nombre: "Porcentaje renovable",
    descripcion: "Nivel de cumplimiento renovable mensual del agente monitoreado.",
    tablas: ["datos_mensuales"],
    campos: ["mater_mwh", "demanda_total_mwh", "porcentaje_renovable"],
    operacion: "mater_mwh / demanda_total_mwh * 100, persistido en porcentaje_renovable.",
    salida: "Porcentaje renovable mensual por agente.",
  },
  {
    nombre: "Costo monomico mensual",
    descripcion: "Costo promedio mensual por MWh para el agente, usando costo total y demanda.",
    tablas: ["datos_mensuales"],
    campos: ["costo_total_estimado_usd", "demanda_total_mwh"],
    operacion: "costo_total_estimado_usd / demanda_total_mwh.",
    salida: "USD/MWh historico y base de proyeccion.",
  },
  {
    nombre: "Desglose de costo del mes",
    descripcion: "Separacion operativa entre energia MATER, SPOT, transporte, potencia y cargos.",
    tablas: ["datos_mensuales", "datos_mercado"],
    campos: [
      "mater_mwh",
      "costo_renovable_usd_mwh",
      "spot_mwh",
      "costo_spot_usd_mwh",
      "cargo_transporte_pesos_mwh",
      "precio_spot_usd_mwh",
    ],
    operacion: "Combina multiplicaciones por energia y estimaciones residuales para completar el total.",
    salida: "Desglose mensual del costo estimado.",
  },
  {
    nombre: "Mix de mercado",
    descripcion: "Composicion de la generacion del sistema en el periodo seleccionado.",
    tablas: ["datos_mercado"],
    campos: ["mix_termica_pct", "mix_hidraulica_pct", "mix_nuclear_pct", "mix_renovable_pct"],
    operacion: "Lectura directa de porcentajes agregados de mercado.",
    salida: "Distribucion del mix energetico del MEM.",
  },
  {
    nombre: "Participacion MATER vs SPOT",
    descripcion: "Comparacion entre cobertura renovable y volumen expuesto a spot de cada agente.",
    tablas: ["datos_mensuales"],
    campos: ["mater_mwh", "spot_mwh", "demanda_total_mwh"],
    operacion: "mater_mwh / demanda_total_mwh y spot_mwh / demanda_total_mwh.",
    salida: "Peso relativo de MATER y SPOT en cada mes.",
  },
  {
    nombre: "Cobertura historica del seguimiento",
    descripcion: "Estado del backfill de cada agente monitoreado.",
    tablas: ["agentes_monitoreados", "datos_mensuales"],
    campos: ["cobertura_desde", "cobertura_hasta", "anio", "mes"],
    operacion: "Conteo de periodos por agente y contraste contra el rango esperado 2020-02 a la actualidad.",
    salida: "Estado completo o parcial del historico.",
  },
];

function num(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(anio: number, mes: number) {
  const valid = Number.isInteger(mes) && mes >= 1 && mes <= 12;
  const label = valid ? monthLabels[mes - 1] : `M${mes}`;
  return `${label} ${anio}`;
}

export async function isCurrentUserAdmin() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return false;

  const { data, error } = await supabase
    .from("admin_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_admin);
}

export async function listAdminEmpresasOptions() {
  const { data, error } = await supabase
    .from("agentes_monitoreados")
    .select("id,razon_social,nemo")
    .eq("activo", true)
    .order("razon_social");

  if (error) throw error;

  const agentes = (data ?? []) as Array<Pick<MonitoredAgentRow, "id" | "razon_social" | "nemo">>;
  return agentes.map<AdminEmpresaOption>((agente) => ({
    id: agente.id,
    razon_social: agente.razon_social,
    nemos: agente.nemo ? [agente.nemo] : [],
  }));
}

export async function downloadCammesaDte(params: { anio: number; mes: number }) {
  const { data, error } = await supabase.functions.invoke("download-cammesa-dte", {
    body: { anio: params.anio, mes: params.mes },
  });
  if (error) throw error;
  return data as { ok?: boolean; procesamiento_id?: string; archivo_id?: string; message?: string };
}

export async function loadAdminCargaMensual() {
  const [archivosResponse, procesamientosResponse] = await Promise.all([
    supabase.from("cammesa_archivos").select("*").order("created_at", { ascending: false }).limit(10),
    supabase
      .from("procesamientos")
      .select(
        "*," +
          "dte_archivo:cammesa_archivos!procesamientos_dte_archivo_id_fkey(*)," +
          "variables_archivo:cammesa_archivos!procesamientos_variables_archivo_id_fkey(*)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (archivosResponse.error) throw archivosResponse.error;
  if (procesamientosResponse.error) throw procesamientosResponse.error;

  const procesamientos = (procesamientosResponse.data ?? []) as unknown as AdminProcesamiento[];
  const empresasByProcesamiento = await fetchProcesamientoEmpresas(procesamientos.map((p) => p.id));

  return {
    archivos: (archivosResponse.data ?? []) as AdminArchivo[],
    procesamientos: procesamientos.map((item) => ({
      ...item,
      started_at: item.started_at ?? null,
      completed_at: item.completed_at ?? null,
      dte_archivo: item.dte_archivo ?? null,
      variables_archivo: item.variables_archivo ?? null,
      empresas: empresasByProcesamiento.get(item.id) ?? [],
    })),
  };
}

async function fetchProcesamientoEmpresas(
  procesamientoIds: string[],
): Promise<Map<string, AdminProcesamientoEmpresa[]>> {
  const result = new Map<string, AdminProcesamientoEmpresa[]>();
  if (!procesamientoIds.length) return result;

  const { data, error } = await supabase
    .from("procesamiento_empresas")
    .select("*,empresa:agentes_monitoreados!procesamiento_empresas_empresa_id_fkey(razon_social)")
    .in("procesamiento_id", procesamientoIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  (data as ProcesoEmpresaRow[] | null ?? []).forEach((row) => {
    const empresaRow: AdminProcesamientoEmpresa = {
      id: row.id,
      procesamiento_id: row.procesamiento_id,
      empresa_id: row.empresa_id,
      empresa_nombre: row.empresa?.razon_social?.trim() || "Agente sin referencia",
      estado: row.estado,
      mensaje: row.mensaje,
      demanda_total_mwh: num(row.demanda_total_mwh),
      mater_mwh: num(row.mater_mwh),
      spot_mwh: num(row.spot_mwh),
      created_at: row.created_at,
    };
    const current = result.get(row.procesamiento_id) ?? [];
    current.push(empresaRow);
    result.set(row.procesamiento_id, current);
  });
  return result;
}

function pickLatestClean(rows: MensualRow[]) {
  const map = new Map<string, MensualRow>();
  rows.forEach((row) => {
    if (row.dato_sospechoso) return;
    if (!map.has(row.empresa_id)) map.set(row.empresa_id, row);
  });
  return map;
}

function toAdminEmpresaRow(agente: MonitoredAgentRow, latest: MensualRow | undefined): AdminEmpresaRow {
  return {
    id: agente.id,
    razon_social: agente.razon_social,
    tipo_usuario: agente.tipo_agente ?? "Sin tipo CAMMESA",
    plan_activo: "compliance",
    comercializador: "",
    nemos: agente.nemo ? [agente.nemo] : [],
    contratos: 0,
    ultimo_mes: latest ? monthLabel(latest.anio, latest.mes) : "Sin datos",
    demanda_total_mwh: num(latest?.demanda_total_mwh),
    porcentaje_renovable: num(latest?.porcentaje_renovable),
  };
}

export async function loadAdminEmpresas() {
  const [agentesResponse, mensualesResponse] = await Promise.all([
    supabase.from("agentes_monitoreados").select("id,razon_social,tipo_agente,nemo").eq("activo", true).order("razon_social"),
    supabase
      .from("datos_mensuales")
      .select("empresa_id,anio,mes,demanda_total_mwh,mater_mwh,porcentaje_renovable,dato_sospechoso")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
  ]);

  if (agentesResponse.error) throw agentesResponse.error;
  if (mensualesResponse.error) throw mensualesResponse.error;

  const agentes = (agentesResponse.data ?? []) as MonitoredAgentRow[];
  const mensuales = (mensualesResponse.data ?? []) as MensualRow[];
  const latestByEmpresa = pickLatestClean(mensuales);

  return agentes.map((agente) => toAdminEmpresaRow(agente, latestByEmpresa.get(agente.id)));
}

export async function loadAdminDashboard() {
  const [agentesResponse, mensualesResponse, archivosResponse, procesamientosResponse] = await Promise.all([
    supabase.from("agentes_monitoreados").select("id,razon_social,tipo_agente,nemo").eq("activo", true).order("razon_social"),
    supabase
      .from("datos_mensuales")
      .select("empresa_id,anio,mes,demanda_total_mwh,mater_mwh,porcentaje_renovable,dato_sospechoso")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
    supabase.from("cammesa_archivos").select("*").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("procesamientos")
      .select(
        "*," +
          "dte_archivo:cammesa_archivos!procesamientos_dte_archivo_id_fkey(*)," +
          "variables_archivo:cammesa_archivos!procesamientos_variables_archivo_id_fkey(*)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  for (const response of [agentesResponse, mensualesResponse, archivosResponse, procesamientosResponse]) {
    if (response.error) throw response.error;
  }

  const procesamientos = (procesamientosResponse.data ?? []) as unknown as AdminProcesamiento[];
  const empresasByProcesamiento = await fetchProcesamientoEmpresas(procesamientos.map((p) => p.id));

  const agentes = (agentesResponse.data ?? []) as MonitoredAgentRow[];
  const mensuales = (mensualesResponse.data ?? []) as MensualRow[];
  const latestByEmpresa = pickLatestClean(mensuales);

  const ytdByEmpresa = new Map<string, { demanda: number; mater: number }>();
  const currentYear = new Date().getFullYear();
  mensuales.forEach((row) => {
    if (row.dato_sospechoso || row.anio !== currentYear) return;
    const acc = ytdByEmpresa.get(row.empresa_id) ?? { demanda: 0, mater: 0 };
    acc.demanda += num(row.demanda_total_mwh);
    acc.mater += num(row.mater_mwh);
    ytdByEmpresa.set(row.empresa_id, acc);
  });

  const empresaRows = agentes.map((agente) => toAdminEmpresaRow(agente, latestByEmpresa.get(agente.id)));
  const ytdRows = [...ytdByEmpresa.values()];
  const totalDemandYtd = ytdRows.reduce((sum, row) => sum + row.demanda, 0);
  const totalMaterYtd = ytdRows.reduce((sum, row) => sum + row.mater, 0);
  const promedioRenovable = totalDemandYtd ? (totalMaterYtd / totalDemandYtd) * 100 : 0;
  const clientesRiesgo = agentes.filter((agente) => {
    const ytd = ytdByEmpresa.get(agente.id);
    if (!ytd || !ytd.demanda) return false;
    return (ytd.mater / ytd.demanda) * 100 < 20;
  }).length;

  const stats: AdminStats = {
    empresas: agentes.length,
    nemos: agentes.filter((agente) => Boolean(agente.nemo)).length,
    contratos: 0,
    demanda_total_mwh: totalDemandYtd,
    mater_mwh: totalMaterYtd,
    promedio_renovable: Number(promedioRenovable.toFixed(2)),
    clientes_riesgo: clientesRiesgo,
    archivos: (archivosResponse.data ?? []).length,
    procesamientos: (procesamientosResponse.data ?? []).length,
  };

  return {
    stats,
    empresas: empresaRows,
    archivos: (archivosResponse.data ?? []) as AdminArchivo[],
    procesamientos: procesamientos.map((item) => ({
      ...item,
      started_at: item.started_at ?? null,
      completed_at: item.completed_at ?? null,
      dte_archivo: item.dte_archivo ?? null,
      variables_archivo: item.variables_archivo ?? null,
      empresas: empresasByProcesamiento.get(item.id) ?? [],
    })),
  };
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMonthDate(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

function toMonthKey(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function isMonthKeyInRange(value: string, desde: string, hasta: string) {
  return compareMonthKeys(value, desde) >= 0 && compareMonthKeys(value, hasta) <= 0;
}

function countMonthsInclusive(desde: string, hasta: string) {
  const [desdeAnio, desdeMes] = desde.split("-").map(Number);
  const [hastaAnio, hastaMes] = hasta.split("-").map(Number);
  return (hastaAnio - desdeAnio) * 12 + (hastaMes - desdeMes) + 1;
}

function monthLabelFromKey(value: string) {
  const [anio, mes] = value.split("-").map(Number);
  return monthLabel(anio, mes);
}

function uniqueMonthKeys(rows: Array<{ anio: number; mes: number }>) {
  return [...new Set(rows.map((row) => toMonthKey(row.anio, row.mes)))];
}

type AdminAgentCoverageRow = {
  id: string;
  razon_social: string;
  nemo: string;
  tipo_agente: string | null;
  cobertura_desde: string | null;
  cobertura_hasta: string | null;
};

type RawCoverageStatus = {
  raw_amat: boolean;
  raw_agum: boolean;
  raw_atra: boolean;
};

function averageNumbers(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function latestNonNull(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function normalizeMonthRange(
  periodKeys: string[],
  requestedDesde?: string,
  requestedHasta?: string,
  fallbackKey?: string,
) {
  const safeFallback = fallbackKey ?? periodKeys[periodKeys.length - 1] ?? "";
  const safeDesde = requestedDesde && periodKeys.includes(requestedDesde) ? requestedDesde : safeFallback;
  const safeHasta = requestedHasta && periodKeys.includes(requestedHasta) ? requestedHasta : safeFallback;
  return compareMonthKeys(safeDesde, safeHasta) <= 0
    ? { desde: safeDesde, hasta: safeHasta }
    : { desde: safeHasta, hasta: safeDesde };
}

async function fetchAdminAgentRows() {
  const response = await supabase
    .from("agentes_monitoreados")
    .select("id,razon_social,nemo,tipo_agente,cobertura_desde,cobertura_hasta")
    .eq("activo", true)
    .order("razon_social");

  if (response.error) throw response.error;
  return (response.data ?? []) as AdminAgentCoverageRow[];
}

function mapAdminAgents(rows: AdminAgentCoverageRow[]) {
  return rows.map<AdminAnalyticsAgentOption>((row) => ({
    id: row.id,
    razon_social: row.razon_social,
    nemo: row.nemo,
    tipo_agente: row.tipo_agente ?? "Sin tipo CAMMESA",
  }));
}

function buildAgentDescriptor(row: AdminAgentCoverageRow | null) {
  return row
    ? {
        id: row.id,
        razon_social: row.razon_social,
        nemo: row.nemo,
        tipo_agente: row.tipo_agente ?? "Sin tipo CAMMESA",
        cobertura_desde: row.cobertura_desde,
        cobertura_hasta: row.cobertura_hasta,
      }
    : null;
}

async function fetchRawCoverageMap(): Promise<Map<string, RawCoverageStatus>> {
  const [amatResponse, agumResponse, atraResponse] = await Promise.all([
    supabase.from("raw_amat").select("anio,mes"),
    supabase.from("raw_agum").select("anio,mes"),
    supabase.from("raw_atra").select("anio,mes"),
  ]);

  if (amatResponse.error) throw amatResponse.error;
  if (agumResponse.error) throw agumResponse.error;
  if (atraResponse.error) throw atraResponse.error;

  const map = new Map<string, RawCoverageStatus>();
  const mark = (key: string, field: keyof RawCoverageStatus) => {
    const current = map.get(key) ?? { raw_amat: false, raw_agum: false, raw_atra: false };
    current[field] = true;
    map.set(key, current);
  };

  ((amatResponse.data ?? []) as Array<{ anio: number; mes: number }>).forEach((row) =>
    mark(toMonthKey(row.anio, row.mes), "raw_amat"),
  );
  ((agumResponse.data ?? []) as Array<{ anio: number; mes: number }>).forEach((row) =>
    mark(toMonthKey(row.anio, row.mes), "raw_agum"),
  );
  ((atraResponse.data ?? []) as Array<{ anio: number; mes: number }>).forEach((row) =>
    mark(toMonthKey(row.anio, row.mes), "raw_atra"),
  );

  return map;
}

function isRawCoverageComplete(coverage: RawCoverageStatus | undefined) {
  return Boolean(coverage?.raw_amat && coverage?.raw_agum && coverage?.raw_atra);
}

export async function loadAdminSystemOverview(): Promise<AdminSystemOverview> {
  const today = new Date();
  const [
    cammesaCountResponse,
    agentesResponse,
    datosMensualesResponse,
  ] = await Promise.all([
    supabase.from("cammesa_agentes_mem").select("*", { count: "exact", head: true }),
    supabase
      .from("agentes_monitoreados")
      .select("id,razon_social,nemo,tipo_agente,cobertura_desde,cobertura_hasta")
      .eq("activo", true)
      .order("razon_social"),
    supabase
      .from("datos_mensuales")
      .select("empresa_id,anio,mes")
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
  ]);

  if (cammesaCountResponse.error) throw cammesaCountResponse.error;
  if (agentesResponse.error) throw agentesResponse.error;
  if (datosMensualesResponse.error) throw datosMensualesResponse.error;

  const agentes = (agentesResponse.data ?? []) as Array<{
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string | null;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  }>;
  const datosMensuales = (datosMensualesResponse.data ?? []) as Array<{
    empresa_id: string;
    anio: number;
    mes: number;
  }>;

  const monthsByAgent = new Map<string, Set<string>>();
  datosMensuales.forEach((row) => {
    const bucket = monthsByAgent.get(row.empresa_id) ?? new Set<string>();
    bucket.add(`${row.anio}-${row.mes}`);
    monthsByAgent.set(row.empresa_id, bucket);
  });

  const agentesConDatos = new Set(datosMensuales.map((row) => row.empresa_id)).size;
  const sortedPeriods = datosMensuales.map((row) => toMonthDate(row.anio, row.mes)).sort();
  const periodoDesde = sortedPeriods[0] ?? null;
  const periodoHasta = sortedPeriods[sortedPeriods.length - 1] ?? null;
  const periodosCubiertos = new Set(sortedPeriods).size;

  const monitoredAgents: AdminSystemAgent[] = agentes.map((agente) => {
    const meses = monthsByAgent.get(agente.id)?.size ?? 0;
    return {
      id: agente.id,
      razon_social: agente.razon_social,
      nemo: agente.nemo,
      tipo_agente: agente.tipo_agente ?? "Sin tipo CAMMESA",
      cobertura_desde: agente.cobertura_desde,
      cobertura_hasta: agente.cobertura_hasta,
      meses_cargados: meses,
      estado: meses >= 74 ? "completo" : "parcial",
    };
  });

  return {
    ultima_actualizacion: formatIsoDate(today),
    resumen: {
      agentes_cammesa: cammesaCountResponse.count ?? 0,
      agentes_monitoreados: agentes.length,
      agentes_con_datos: agentesConDatos,
      filas_datos_mensuales: datosMensuales.length,
      periodos_cubiertos: periodosCubiertos,
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
    },
    tablas: systemTables,
    metricas: systemMetrics,
    agentes: monitoredAgents,
  };
}

export async function loadAdminAnalytics(params?: {
  agenteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<AdminAnalyticsOverview> {
  const agentesResponse = await supabase
    .from("agentes_monitoreados")
    .select("id,razon_social,nemo,tipo_agente,cobertura_desde,cobertura_hasta")
    .eq("activo", true)
    .order("razon_social");

  if (agentesResponse.error) throw agentesResponse.error;

  const agentesRows = (agentesResponse.data ?? []) as Array<{
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string | null;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  }>;

  const agentes: AdminAnalyticsAgentOption[] = agentesRows.map((row) => ({
    id: row.id,
    razon_social: row.razon_social,
    nemo: row.nemo,
    tipo_agente: row.tipo_agente ?? "Sin tipo CAMMESA",
  }));

  const selectedAgenteId = params?.agenteId ?? agentes[0]?.id ?? "";
  if (!selectedAgenteId) {
    return {
      agentes: [],
      periodos: [],
      seleccionado: { agente_id: "", desde: "", hasta: "" },
      agente_actual: null,
      resumen: {
        meses_disponibles: 0,
        meses_seleccionados: 0,
        demanda_total_mwh: 0,
        mater_total_mwh: 0,
        spot_total_mwh: 0,
        porcentaje_renovable_promedio: 0,
        costo_total_usd: 0,
        costo_monomico_promedio_usd_mwh: 0,
        precio_spot_promedio_usd_mwh: 0,
        transporte_promedio_pesos_mwh: 0,
        mix_renovable_promedio_pct: 0,
        meses_sospechosos: 0,
        cobertura_pct: 0,
        ultimo_procesado_en: null,
      },
      consumo_serie: [],
      costos_serie: [],
      mercado_serie: [],
      calidad_serie: [],
      mix_promedio: [],
    };
  }

  const [mensualesResponse, mercadoResponse] = await Promise.all([
    supabase
      .from("datos_mensuales")
      .select(
        "empresa_id,anio,mes,demanda_total_mwh,mater_mwh,spot_mwh,porcentaje_renovable,costo_total_estimado_usd,costo_renovable_usd_mwh,costo_spot_usd_mwh,cargo_transporte_pesos_mwh,precio_spot_pesos_mwh,dato_sospechoso,sospechoso_motivo,procesado_en",
      )
      .eq("empresa_id", selectedAgenteId)
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    supabase
      .from("datos_mercado")
      .select(
        "anio,mes,mix_termica_pct,mix_hidraulica_pct,mix_nuclear_pct,mix_renovable_pct,precio_spot_usd_mwh,costo_renovable_usd_mwh,costo_cammesa_usd_mwh",
      )
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
  ]);

  if (mensualesResponse.error) throw mensualesResponse.error;
  if (mercadoResponse.error) throw mercadoResponse.error;

  const mensuales = (mensualesResponse.data ?? []) as Array<{
    empresa_id: string;
    anio: number;
    mes: number;
    demanda_total_mwh: number | string;
    mater_mwh: number | string;
    spot_mwh: number | string;
    porcentaje_renovable: number | string;
    costo_total_estimado_usd: number | string;
    costo_renovable_usd_mwh: number | string;
    costo_spot_usd_mwh: number | string;
    cargo_transporte_pesos_mwh: number | string;
    precio_spot_pesos_mwh: number | string;
    dato_sospechoso: boolean | null;
    sospechoso_motivo: string | null;
    procesado_en: string | null;
  }>;

  const mercado = (mercadoResponse.data ?? []) as Array<{
    anio: number;
    mes: number;
    mix_termica_pct: number | string | null;
    mix_hidraulica_pct: number | string | null;
    mix_nuclear_pct: number | string | null;
    mix_renovable_pct: number | string | null;
    precio_spot_usd_mwh: number | string | null;
    costo_renovable_usd_mwh: number | string | null;
    costo_cammesa_usd_mwh: number | string | null;
  }>;

  const periodKeys = mensuales.map((row) => toMonthKey(row.anio, row.mes));
  const periodos: AdminAnalyticsPeriodOption[] = periodKeys.map((value) => ({
    value,
    label: monthLabelFromKey(value),
  }));

  const defaultDesde = periodKeys[0] ?? "";
  const defaultHasta = periodKeys[periodKeys.length - 1] ?? "";
  const requestedDesde = params?.desde ?? "";
  const requestedHasta = params?.hasta ?? "";
  const safeDesde = periodKeys.includes(requestedDesde) ? requestedDesde : defaultDesde;
  const safeHasta = periodKeys.includes(requestedHasta) ? requestedHasta : defaultHasta;
  const selectedDesde = compareMonthKeys(safeDesde, safeHasta) <= 0 ? safeDesde : safeHasta;
  const selectedHasta = compareMonthKeys(safeDesde, safeHasta) <= 0 ? safeHasta : safeDesde;

  const mensualesFiltrados = mensuales.filter((row) =>
    isMonthKeyInRange(toMonthKey(row.anio, row.mes), selectedDesde, selectedHasta),
  );
  const mercadoFiltrado = mercado.filter((row) =>
    isMonthKeyInRange(toMonthKey(row.anio, row.mes), selectedDesde, selectedHasta),
  );

  const consumoSerie: AdminAnalyticsConsumptionPoint[] = mensualesFiltrados.map((row) => ({
    periodo: toMonthKey(row.anio, row.mes),
    etiqueta: monthLabel(row.anio, row.mes),
    demanda_total_mwh: num(row.demanda_total_mwh),
    mater_mwh: num(row.mater_mwh),
    spot_mwh: num(row.spot_mwh),
    porcentaje_renovable: num(row.porcentaje_renovable),
  }));

  const costosSerie: AdminAnalyticsCostPoint[] = mensualesFiltrados.map((row) => {
    const demanda = num(row.demanda_total_mwh);
    const costoTotal = num(row.costo_total_estimado_usd);
    return {
      periodo: toMonthKey(row.anio, row.mes),
      etiqueta: monthLabel(row.anio, row.mes),
      costo_total_estimado_usd: costoTotal,
      costo_monomico_usd_mwh: demanda > 0 ? costoTotal / demanda : 0,
      costo_spot_usd_mwh: num(row.costo_spot_usd_mwh),
      costo_renovable_usd_mwh: num(row.costo_renovable_usd_mwh),
      cargo_transporte_pesos_mwh: num(row.cargo_transporte_pesos_mwh),
      precio_spot_pesos_mwh: num(row.precio_spot_pesos_mwh),
    };
  });

  const mercadoSerie: AdminAnalyticsMarketPoint[] = mercadoFiltrado.map((row) => ({
    periodo: toMonthKey(row.anio, row.mes),
    etiqueta: monthLabel(row.anio, row.mes),
    mix_termica_pct: num(row.mix_termica_pct),
    mix_hidraulica_pct: num(row.mix_hidraulica_pct),
    mix_nuclear_pct: num(row.mix_nuclear_pct),
    mix_renovable_pct: num(row.mix_renovable_pct),
    precio_spot_usd_mwh: num(row.precio_spot_usd_mwh),
    costo_renovable_usd_mwh: num(row.costo_renovable_usd_mwh),
    costo_cammesa_usd_mwh: num(row.costo_cammesa_usd_mwh),
  }));

  const calidadSerie: AdminAnalyticsQualityPoint[] = mensualesFiltrados.map((row) => ({
    periodo: toMonthKey(row.anio, row.mes),
    etiqueta: monthLabel(row.anio, row.mes),
    dato_sospechoso: Boolean(row.dato_sospechoso),
    sospechoso_motivo: row.sospechoso_motivo,
  }));

  const totalDemanda = consumoSerie.reduce((sum, row) => sum + row.demanda_total_mwh, 0);
  const totalMater = consumoSerie.reduce((sum, row) => sum + row.mater_mwh, 0);
  const totalSpot = consumoSerie.reduce((sum, row) => sum + row.spot_mwh, 0);
  const totalCostoUsd = costosSerie.reduce((sum, row) => sum + row.costo_total_estimado_usd, 0);
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const mixTermicaPromedio = average(mercadoSerie.map((row) => row.mix_termica_pct));
  const mixHidraulicaPromedio = average(mercadoSerie.map((row) => row.mix_hidraulica_pct));
  const mixNuclearPromedio = average(mercadoSerie.map((row) => row.mix_nuclear_pct));
  const mixRenovablePromedio = average(mercadoSerie.map((row) => row.mix_renovable_pct));
  const mesesEsperados =
    selectedDesde && selectedHasta ? countMonthsInclusive(selectedDesde, selectedHasta) : mensualesFiltrados.length;
  const sospechosos = calidadSerie.filter((row) => row.dato_sospechoso);
  const ultimoProcesadoEn =
    mensualesFiltrados
      .map((row) => row.procesado_en)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  const agenteActualRow = agentesRows.find((row) => row.id === selectedAgenteId) ?? null;

  return {
    agentes,
    periodos,
    seleccionado: {
      agente_id: selectedAgenteId,
      desde: selectedDesde,
      hasta: selectedHasta,
    },
    agente_actual: agenteActualRow
      ? {
          id: agenteActualRow.id,
          razon_social: agenteActualRow.razon_social,
          nemo: agenteActualRow.nemo,
          tipo_agente: agenteActualRow.tipo_agente ?? "Sin tipo CAMMESA",
          cobertura_desde: agenteActualRow.cobertura_desde,
          cobertura_hasta: agenteActualRow.cobertura_hasta,
        }
      : null,
    resumen: {
      meses_disponibles: mensuales.length,
      meses_seleccionados: mensualesFiltrados.length,
      demanda_total_mwh: totalDemanda,
      mater_total_mwh: totalMater,
      spot_total_mwh: totalSpot,
      porcentaje_renovable_promedio: totalDemanda > 0 ? (totalMater / totalDemanda) * 100 : 0,
      costo_total_usd: totalCostoUsd,
      costo_monomico_promedio_usd_mwh: totalDemanda > 0 ? totalCostoUsd / totalDemanda : 0,
      precio_spot_promedio_usd_mwh: average(costosSerie.map((row) => row.costo_spot_usd_mwh)),
      transporte_promedio_pesos_mwh: average(costosSerie.map((row) => row.cargo_transporte_pesos_mwh)),
      mix_renovable_promedio_pct: mixRenovablePromedio,
      meses_sospechosos: sospechosos.length,
      cobertura_pct: mesesEsperados > 0 ? (mensualesFiltrados.length / mesesEsperados) * 100 : 0,
      ultimo_procesado_en: ultimoProcesadoEn,
    },
    consumo_serie: consumoSerie,
    costos_serie: costosSerie,
    mercado_serie: mercadoSerie,
    calidad_serie: calidadSerie,
    mix_promedio: [
      { name: "Termica", value: mixTermicaPromedio },
      { name: "Hidraulica", value: mixHidraulicaPromedio },
      { name: "Nuclear", value: mixNuclearPromedio },
      { name: "Renovable", value: mixRenovablePromedio },
    ],
  };
}

export async function loadAdminModule1(params?: {
  agenteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<AdminModule1Overview> {
  const agentesResponse = await supabase
    .from("agentes_monitoreados")
    .select("id,razon_social,nemo,tipo_agente,cobertura_desde,cobertura_hasta")
    .eq("activo", true)
    .order("razon_social");

  if (agentesResponse.error) throw agentesResponse.error;

  const agentesRows = (agentesResponse.data ?? []) as Array<{
    id: string;
    razon_social: string;
    nemo: string;
    tipo_agente: string | null;
    cobertura_desde: string | null;
    cobertura_hasta: string | null;
  }>;

  const agentes: AdminAnalyticsAgentOption[] = agentesRows.map((row) => ({
    id: row.id,
    razon_social: row.razon_social,
    nemo: row.nemo,
    tipo_agente: row.tipo_agente ?? "Sin tipo CAMMESA",
  }));

  if (!agentes.length) {
    return {
      agentes: [],
      periodos: [],
      seleccionado: { agente_id: "", desde: "", hasta: "" },
      agente_actual: null,
      resumen: {
        meses_en_rango: 0,
        meses_con_datos: 0,
        demanda_total_mwh: 0,
        mater_total_mwh: 0,
        spot_total_mwh: 0,
        porcentaje_renovable_ponderado: 0,
        importe_mater_pesos: 0,
        precio_efectivo_promedio_pesos_mwh: 0,
        primer_periodo_con_datos: null,
        ultimo_periodo_con_datos: null,
        ultimo_procesado_en: null,
      },
      serie: [],
    };
  }

  const selectedAgenteId = params?.agenteId ?? agentes[0]?.id ?? "";
  const [globalPeriodsResponse, mensualesResponse] = await Promise.all([
    supabase.from("datos_mensuales").select("anio,mes").order("anio", { ascending: true }).order("mes", { ascending: true }),
    supabase
      .from("datos_mensuales")
      .select(
        "empresa_id,anio,mes,demanda_total_mwh,mater_mwh,spot_mwh,porcentaje_renovable,importe_mater_pesos,precio_efectivo_pesos_mwh,procesado_en",
      )
      .eq("empresa_id", selectedAgenteId)
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
  ]);

  if (globalPeriodsResponse.error) throw globalPeriodsResponse.error;
  if (mensualesResponse.error) throw mensualesResponse.error;

  const globalRows = (globalPeriodsResponse.data ?? []) as Array<{ anio: number; mes: number }>;
  const mensuales = (mensualesResponse.data ?? []) as Array<{
    empresa_id: string;
    anio: number;
    mes: number;
    demanda_total_mwh: number | string;
    mater_mwh: number | string;
    spot_mwh: number | string;
    porcentaje_renovable: number | string;
    importe_mater_pesos: number | string | null;
    precio_efectivo_pesos_mwh: number | string | null;
    procesado_en: string | null;
  }>;

  const globalKeys = uniqueMonthKeys(globalRows);
  const agentKeys = uniqueMonthKeys(mensuales);
  const periodKeys = globalKeys.length ? globalKeys : agentKeys;
  const periodos: AdminAnalyticsPeriodOption[] = periodKeys.map((value) => ({
    value,
    label: monthLabelFromKey(value),
  }));

  const defaultRangeKey = agentKeys[agentKeys.length - 1] ?? periodKeys[periodKeys.length - 1] ?? "";
  const requestedDesde = params?.desde ?? "";
  const requestedHasta = params?.hasta ?? "";
  const safeDesde = periodKeys.includes(requestedDesde) ? requestedDesde : defaultRangeKey;
  const safeHasta = periodKeys.includes(requestedHasta) ? requestedHasta : defaultRangeKey;
  const selectedDesde = compareMonthKeys(safeDesde, safeHasta) <= 0 ? safeDesde : safeHasta;
  const selectedHasta = compareMonthKeys(safeDesde, safeHasta) <= 0 ? safeHasta : safeDesde;

  const mensualesFiltrados = mensuales.filter((row) =>
    selectedDesde && selectedHasta
      ? isMonthKeyInRange(toMonthKey(row.anio, row.mes), selectedDesde, selectedHasta)
      : true,
  );

  const serie: AdminModule1MonthlyPoint[] = mensualesFiltrados.map((row) => ({
    periodo: toMonthKey(row.anio, row.mes),
    etiqueta: monthLabel(row.anio, row.mes),
    demanda_total_mwh: num(row.demanda_total_mwh),
    mater_mwh: num(row.mater_mwh),
    spot_mwh: num(row.spot_mwh),
    porcentaje_renovable: num(row.porcentaje_renovable),
    importe_mater_pesos: row.importe_mater_pesos == null ? null : num(row.importe_mater_pesos),
    precio_efectivo_pesos_mwh:
      row.precio_efectivo_pesos_mwh == null ? null : num(row.precio_efectivo_pesos_mwh),
    procesado_en: row.procesado_en,
  }));

  const totalDemanda = serie.reduce((sum, row) => sum + row.demanda_total_mwh, 0);
  const totalMater = serie.reduce((sum, row) => sum + row.mater_mwh, 0);
  const totalSpot = serie.reduce((sum, row) => sum + row.spot_mwh, 0);
  const totalImporte = serie.reduce((sum, row) => sum + (row.importe_mater_pesos ?? 0), 0);
  const ultimoProcesadoEn =
    serie
      .map((row) => row.procesado_en)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const agenteActualRow = agentesRows.find((row) => row.id === selectedAgenteId) ?? null;

  return {
    agentes,
    periodos,
    seleccionado: {
      agente_id: selectedAgenteId,
      desde: selectedDesde,
      hasta: selectedHasta,
    },
    agente_actual: agenteActualRow
      ? {
          id: agenteActualRow.id,
          razon_social: agenteActualRow.razon_social,
          nemo: agenteActualRow.nemo,
          tipo_agente: agenteActualRow.tipo_agente ?? "Sin tipo CAMMESA",
          cobertura_desde: agenteActualRow.cobertura_desde,
          cobertura_hasta: agenteActualRow.cobertura_hasta,
        }
      : null,
    resumen: {
      meses_en_rango:
        selectedDesde && selectedHasta ? countMonthsInclusive(selectedDesde, selectedHasta) : serie.length,
      meses_con_datos: serie.length,
      demanda_total_mwh: totalDemanda,
      mater_total_mwh: totalMater,
      spot_total_mwh: totalSpot,
      porcentaje_renovable_ponderado: totalDemanda > 0 ? (totalMater / totalDemanda) * 100 : 0,
      importe_mater_pesos: totalImporte,
      precio_efectivo_promedio_pesos_mwh: totalMater > 0 ? totalImporte / totalMater : 0,
      primer_periodo_con_datos: serie[0]?.periodo ?? null,
      ultimo_periodo_con_datos: serie[serie.length - 1]?.periodo ?? null,
      ultimo_procesado_en: ultimoProcesadoEn,
    },
    serie,
  };
}

export async function loadAdminModule2(params?: {
  agenteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<AdminModule2Overview> {
  const agentesRows = await fetchAdminAgentRows();
  const agentes = mapAdminAgents(agentesRows);

  if (!agentes.length) {
    return {
      agentes: [],
      periodos: [],
      seleccionado: { agente_id: "", desde: "", hasta: "" },
      agente_actual: null,
      resumen: {
        meses_en_rango: 0,
        meses_con_datos: 0,
        meses_raw_completos: 0,
        costo_total_usd: 0,
        costo_monomico_promedio_usd_mwh: 0,
        costo_spot_promedio_usd_mwh: 0,
        costo_renovable_promedio_usd_mwh: 0,
        transporte_promedio_pesos_mwh: 0,
        ultimo_procesado_en: null,
      },
      serie: [],
    };
  }

  const selectedAgenteId = params?.agenteId ?? agentes[0]?.id ?? "";
  const [globalPeriodsResponse, mensualesResponse, rawCoverage] = await Promise.all([
    supabase.from("datos_mensuales").select("anio,mes").order("anio", { ascending: true }).order("mes", { ascending: true }),
    supabase
      .from("datos_mensuales")
      .select(
        "empresa_id,anio,mes,demanda_total_mwh,mater_mwh,spot_mwh,costo_total_estimado_usd,costo_spot_usd_mwh,costo_renovable_usd_mwh,cargo_transporte_pesos_mwh,precio_spot_pesos_mwh,dato_sospechoso,sospechoso_motivo,procesado_en",
      )
      .eq("empresa_id", selectedAgenteId)
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    fetchRawCoverageMap(),
  ]);

  if (globalPeriodsResponse.error) throw globalPeriodsResponse.error;
  if (mensualesResponse.error) throw mensualesResponse.error;

  const globalRows = (globalPeriodsResponse.data ?? []) as Array<{ anio: number; mes: number }>;
  const mensuales = (mensualesResponse.data ?? []) as Array<{
    empresa_id: string;
    anio: number;
    mes: number;
    demanda_total_mwh: number | string;
    mater_mwh: number | string;
    spot_mwh: number | string;
    costo_total_estimado_usd: number | string;
    costo_spot_usd_mwh: number | string;
    costo_renovable_usd_mwh: number | string;
    cargo_transporte_pesos_mwh: number | string | null;
    precio_spot_pesos_mwh: number | string | null;
    dato_sospechoso: boolean | null;
    sospechoso_motivo: string | null;
    procesado_en: string | null;
  }>;

  const globalKeys = uniqueMonthKeys(globalRows);
  const agentKeys = uniqueMonthKeys(mensuales);
  const periodKeys = globalKeys.length ? globalKeys : agentKeys;
  const periodos: AdminAnalyticsPeriodOption[] = periodKeys.map((value) => ({
    value,
    label: monthLabelFromKey(value),
  }));

  const { desde: selectedDesde, hasta: selectedHasta } = normalizeMonthRange(
    periodKeys,
    params?.desde,
    params?.hasta,
    agentKeys[agentKeys.length - 1] ?? periodKeys[periodKeys.length - 1] ?? "",
  );

  const serie: AdminModule2MonthlyPoint[] = mensuales
    .filter((row) =>
      selectedDesde && selectedHasta
        ? isMonthKeyInRange(toMonthKey(row.anio, row.mes), selectedDesde, selectedHasta)
        : true,
    )
    .map((row) => {
      const periodo = toMonthKey(row.anio, row.mes);
      const demanda = num(row.demanda_total_mwh);
      const costoTotal = num(row.costo_total_estimado_usd);
      return {
        periodo,
        etiqueta: monthLabel(row.anio, row.mes),
        demanda_total_mwh: demanda,
        mater_mwh: num(row.mater_mwh),
        spot_mwh: num(row.spot_mwh),
        costo_total_estimado_usd: costoTotal,
        costo_monomico_usd_mwh: demanda > 0 ? costoTotal / demanda : 0,
        costo_spot_usd_mwh: num(row.costo_spot_usd_mwh),
        costo_renovable_usd_mwh: num(row.costo_renovable_usd_mwh),
        cargo_transporte_pesos_mwh:
          row.cargo_transporte_pesos_mwh == null ? null : num(row.cargo_transporte_pesos_mwh),
        precio_spot_pesos_mwh: row.precio_spot_pesos_mwh == null ? null : num(row.precio_spot_pesos_mwh),
        dato_sospechoso: Boolean(row.dato_sospechoso),
        sospechoso_motivo: row.sospechoso_motivo,
        raw_completo: isRawCoverageComplete(rawCoverage.get(periodo)),
        procesado_en: row.procesado_en,
      };
    });

  const totalDemanda = serie.reduce((sum, row) => sum + row.demanda_total_mwh, 0);
  const totalCosto = serie.reduce((sum, row) => sum + row.costo_total_estimado_usd, 0);
  const agenteActualRow = agentesRows.find((row) => row.id === selectedAgenteId) ?? null;

  return {
    agentes,
    periodos,
    seleccionado: {
      agente_id: selectedAgenteId,
      desde: selectedDesde,
      hasta: selectedHasta,
    },
    agente_actual: buildAgentDescriptor(agenteActualRow),
    resumen: {
      meses_en_rango:
        selectedDesde && selectedHasta ? countMonthsInclusive(selectedDesde, selectedHasta) : serie.length,
      meses_con_datos: serie.length,
      meses_raw_completos: serie.filter((row) => row.raw_completo).length,
      costo_total_usd: totalCosto,
      costo_monomico_promedio_usd_mwh: totalDemanda > 0 ? totalCosto / totalDemanda : 0,
      costo_spot_promedio_usd_mwh: averageNumbers(serie.map((row) => row.costo_spot_usd_mwh)),
      costo_renovable_promedio_usd_mwh: averageNumbers(serie.map((row) => row.costo_renovable_usd_mwh)),
      transporte_promedio_pesos_mwh: averageNumbers(
        serie.map((row) => row.cargo_transporte_pesos_mwh ?? 0).filter((value) => value > 0),
      ),
      ultimo_procesado_en: latestNonNull(serie.map((row) => row.procesado_en)),
    },
    serie,
  };
}

export async function loadAdminModule3(params?: {
  agenteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<AdminModule3Overview> {
  const agentesRows = await fetchAdminAgentRows();
  const agentes = mapAdminAgents(agentesRows);

  if (!agentes.length) {
    return {
      agentes: [],
      periodos: [],
      seleccionado: { agente_id: "", desde: "", hasta: "" },
      agente_actual: null,
      resumen: {
        meses_en_rango: 0,
        meses_con_mercado: 0,
        meses_raw_economicos: 0,
        mix_renovable_promedio_pct: 0,
        precio_spot_promedio_usd_mwh: 0,
        costo_renovable_promedio_usd_mwh: 0,
        costo_cammesa_promedio_usd_mwh: 0,
      },
      serie: [],
      mix_promedio: [],
    };
  }

  const selectedAgenteId = params?.agenteId ?? agentes[0]?.id ?? "";
  const [globalPeriodsResponse, agenteMensualResponse, mercadoResponse, rawCoverage] = await Promise.all([
    supabase.from("datos_mensuales").select("anio,mes").order("anio", { ascending: true }).order("mes", { ascending: true }),
    supabase
      .from("datos_mensuales")
      .select("anio,mes")
      .eq("empresa_id", selectedAgenteId)
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    supabase
      .from("datos_mercado")
      .select(
        "anio,mes,mix_termica_pct,mix_hidraulica_pct,mix_nuclear_pct,mix_renovable_pct,precio_spot_usd_mwh,costo_renovable_usd_mwh,costo_cammesa_usd_mwh",
      )
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    fetchRawCoverageMap(),
  ]);

  if (globalPeriodsResponse.error) throw globalPeriodsResponse.error;
  if (agenteMensualResponse.error) throw agenteMensualResponse.error;
  if (mercadoResponse.error) throw mercadoResponse.error;

  const globalRows = (globalPeriodsResponse.data ?? []) as Array<{ anio: number; mes: number }>;
  const agenteRows = (agenteMensualResponse.data ?? []) as Array<{ anio: number; mes: number }>;
  const mercadoRows = (mercadoResponse.data ?? []) as Array<{
    anio: number;
    mes: number;
    mix_termica_pct: number | string | null;
    mix_hidraulica_pct: number | string | null;
    mix_nuclear_pct: number | string | null;
    mix_renovable_pct: number | string | null;
    precio_spot_usd_mwh: number | string | null;
    costo_renovable_usd_mwh: number | string | null;
    costo_cammesa_usd_mwh: number | string | null;
  }>;

  const globalKeys = uniqueMonthKeys(globalRows);
  const agentKeys = uniqueMonthKeys(agenteRows);
  const periodKeys = globalKeys.length ? globalKeys : agentKeys;
  const periodos: AdminAnalyticsPeriodOption[] = periodKeys.map((value) => ({
    value,
    label: monthLabelFromKey(value),
  }));
  const { desde: selectedDesde, hasta: selectedHasta } = normalizeMonthRange(
    periodKeys,
    params?.desde,
    params?.hasta,
    agentKeys[agentKeys.length - 1] ?? periodKeys[periodKeys.length - 1] ?? "",
  );

  const agentKeySet = new Set(
    agentKeys.filter((key) =>
      selectedDesde && selectedHasta ? isMonthKeyInRange(key, selectedDesde, selectedHasta) : true,
    ),
  );

  const serie: AdminModule3MonthlyPoint[] = mercadoRows
    .map((row) => {
      const periodo = toMonthKey(row.anio, row.mes);
      return {
        periodo,
        etiqueta: monthLabel(row.anio, row.mes),
        mix_termica_pct: num(row.mix_termica_pct),
        mix_hidraulica_pct: num(row.mix_hidraulica_pct),
        mix_nuclear_pct: num(row.mix_nuclear_pct),
        mix_renovable_pct: num(row.mix_renovable_pct),
        precio_spot_usd_mwh: num(row.precio_spot_usd_mwh),
        costo_renovable_usd_mwh: num(row.costo_renovable_usd_mwh),
        costo_cammesa_usd_mwh: num(row.costo_cammesa_usd_mwh),
        raw_economico_completo: isRawCoverageComplete(rawCoverage.get(periodo)),
        tiene_datos_agente: agentKeySet.has(periodo),
      };
    })
    .filter(
      (row) =>
        row.tiene_datos_agente &&
        (selectedDesde && selectedHasta ? isMonthKeyInRange(row.periodo, selectedDesde, selectedHasta) : true),
    );

  const agenteActualRow = agentesRows.find((row) => row.id === selectedAgenteId) ?? null;
  const mixTermicaPromedio = averageNumbers(serie.map((row) => row.mix_termica_pct));
  const mixHidraulicaPromedio = averageNumbers(serie.map((row) => row.mix_hidraulica_pct));
  const mixNuclearPromedio = averageNumbers(serie.map((row) => row.mix_nuclear_pct));
  const mixRenovablePromedio = averageNumbers(serie.map((row) => row.mix_renovable_pct));

  return {
    agentes,
    periodos,
    seleccionado: {
      agente_id: selectedAgenteId,
      desde: selectedDesde,
      hasta: selectedHasta,
    },
    agente_actual: buildAgentDescriptor(agenteActualRow),
    resumen: {
      meses_en_rango:
        selectedDesde && selectedHasta ? countMonthsInclusive(selectedDesde, selectedHasta) : serie.length,
      meses_con_mercado: serie.length,
      meses_raw_economicos: serie.filter((row) => row.raw_economico_completo).length,
      mix_renovable_promedio_pct: mixRenovablePromedio,
      precio_spot_promedio_usd_mwh: averageNumbers(serie.map((row) => row.precio_spot_usd_mwh)),
      costo_renovable_promedio_usd_mwh: averageNumbers(serie.map((row) => row.costo_renovable_usd_mwh)),
      costo_cammesa_promedio_usd_mwh: averageNumbers(serie.map((row) => row.costo_cammesa_usd_mwh)),
    },
    serie,
    mix_promedio: [
      { name: "Termica", value: mixTermicaPromedio },
      { name: "Hidraulica", value: mixHidraulicaPromedio },
      { name: "Nuclear", value: mixNuclearPromedio },
      { name: "Renovable", value: mixRenovablePromedio },
    ],
  };
}

export async function loadAdminModule4(params?: {
  agenteId?: string;
  desde?: string;
  hasta?: string;
}): Promise<AdminModule4Overview> {
  const agentesRows = await fetchAdminAgentRows();
  const agentes = mapAdminAgents(agentesRows);

  if (!agentes.length) {
    return {
      agentes: [],
      periodos: [],
      seleccionado: { agente_id: "", desde: "", hasta: "" },
      agente_actual: null,
      resumen: {
        meses_en_rango: 0,
        meses_con_datos_agente: 0,
        meses_raw_completos: 0,
        meses_mercado_publicado: 0,
        meses_sospechosos: 0,
        cobertura_agente_pct: 0,
        ultimo_procesado_en: null,
      },
      serie: [],
    };
  }

  const selectedAgenteId = params?.agenteId ?? agentes[0]?.id ?? "";
  const [globalPeriodsResponse, mensualesResponse, mercadoPeriodsResponse, rawCoverage] = await Promise.all([
    supabase.from("datos_mensuales").select("anio,mes").order("anio", { ascending: true }).order("mes", { ascending: true }),
    supabase
      .from("datos_mensuales")
      .select("anio,mes,dato_sospechoso,sospechoso_motivo,procesado_en")
      .eq("empresa_id", selectedAgenteId)
      .order("anio", { ascending: true })
      .order("mes", { ascending: true }),
    supabase.from("datos_mercado").select("anio,mes").order("anio", { ascending: true }).order("mes", { ascending: true }),
    fetchRawCoverageMap(),
  ]);

  if (globalPeriodsResponse.error) throw globalPeriodsResponse.error;
  if (mensualesResponse.error) throw mensualesResponse.error;
  if (mercadoPeriodsResponse.error) throw mercadoPeriodsResponse.error;

  const globalRows = (globalPeriodsResponse.data ?? []) as Array<{ anio: number; mes: number }>;
  const mensuales = (mensualesResponse.data ?? []) as Array<{
    anio: number;
    mes: number;
    dato_sospechoso: boolean | null;
    sospechoso_motivo: string | null;
    procesado_en: string | null;
  }>;
  const mercadoRows = (mercadoPeriodsResponse.data ?? []) as Array<{ anio: number; mes: number }>;

  const globalKeys = uniqueMonthKeys(globalRows);
  const agentKeys = uniqueMonthKeys(mensuales);
  const marketKeys = new Set(uniqueMonthKeys(mercadoRows));
  const periodKeys = globalKeys.length ? globalKeys : agentKeys;
  const periodos: AdminAnalyticsPeriodOption[] = periodKeys.map((value) => ({
    value,
    label: monthLabelFromKey(value),
  }));
  const { desde: selectedDesde, hasta: selectedHasta } = normalizeMonthRange(
    periodKeys,
    params?.desde,
    params?.hasta,
    agentKeys[agentKeys.length - 1] ?? periodKeys[periodKeys.length - 1] ?? "",
  );

  const serie: AdminModule4QualityPoint[] = mensuales
    .filter((row) =>
      selectedDesde && selectedHasta
        ? isMonthKeyInRange(toMonthKey(row.anio, row.mes), selectedDesde, selectedHasta)
        : true,
    )
    .map((row) => {
      const periodo = toMonthKey(row.anio, row.mes);
      return {
        periodo,
        etiqueta: monthLabel(row.anio, row.mes),
        dato_sospechoso: Boolean(row.dato_sospechoso),
        sospechoso_motivo: row.sospechoso_motivo,
        raw_completo: isRawCoverageComplete(rawCoverage.get(periodo)),
        mercado_publicado: marketKeys.has(periodo),
        procesado_en: row.procesado_en,
      };
    });

  const agenteActualRow = agentesRows.find((row) => row.id === selectedAgenteId) ?? null;

  return {
    agentes,
    periodos,
    seleccionado: {
      agente_id: selectedAgenteId,
      desde: selectedDesde,
      hasta: selectedHasta,
    },
    agente_actual: buildAgentDescriptor(agenteActualRow),
    resumen: {
      meses_en_rango:
        selectedDesde && selectedHasta ? countMonthsInclusive(selectedDesde, selectedHasta) : serie.length,
      meses_con_datos_agente: serie.length,
      meses_raw_completos: serie.filter((row) => row.raw_completo).length,
      meses_mercado_publicado: serie.filter((row) => row.mercado_publicado).length,
      meses_sospechosos: serie.filter((row) => row.dato_sospechoso).length,
      cobertura_agente_pct:
        selectedDesde && selectedHasta
          ? (serie.length / countMonthsInclusive(selectedDesde, selectedHasta)) * 100
          : 0,
      ultimo_procesado_en: latestNonNull(serie.map((row) => row.procesado_en)),
    },
    serie,
  };
}

export async function createEmpresaCliente(_payload: unknown) {
  throw new Error("El alta comercial de clientes quedó deshabilitada hasta definir el nuevo flujo.");
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 180);
}

export async function uploadCammesaFile(params: {
  file: File;
  tipo: AdminArchivo["tipo"];
  anio: number;
  mes: number;
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sesion no disponible");

  const safeName = sanitizeFileName(params.file.name);
  if (!safeName) throw new Error("Nombre de archivo invalido");
  const path = `${params.anio}/${String(params.mes).padStart(2, "0")}/${params.tipo.toLowerCase()}-${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("cammesa-uploads")
    .upload(path, params.file, { upsert: false, contentType: params.file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("cammesa_archivos")
    .insert({
      tipo: params.tipo,
      anio: params.anio,
      mes: params.mes,
      file_path: path,
      file_name: params.file.name,
      size_bytes: params.file.size,
      content_type: params.file.type || null,
      uploaded_by: userId,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("cammesa-uploads").remove([path]).catch(() => {});
    throw error;
  }
  return data as AdminArchivo;
}

export async function createProcesamiento(params: {
  anio: number;
  mes: number;
  dte_archivo_id?: string;
  variables_archivo_id?: string;
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sesion no disponible");

  const { data, error } = await supabase
    .from("procesamientos")
    .insert({
      anio: params.anio,
      mes: params.mes,
      dte_archivo_id: params.dte_archivo_id ?? null,
      variables_archivo_id: params.variables_archivo_id ?? null,
      estado: "pendiente",
      resumen: {
        nota: "Archivos cargados. Ejecutar pipeline/procesar_pendientes.py para generar los informes.",
      },
      creado_por: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdminProcesamiento;
}

export async function triggerProcesamiento(procesamientoId: string) {
  const { data, error } = await supabase.functions.invoke("admin-trigger-processing", {
    body: { procesamiento_id: procesamientoId },
  });
  if (error) throw error;
  return data as { queued: boolean; mode: string; message: string };
}
