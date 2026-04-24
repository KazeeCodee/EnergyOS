import { supabase } from "../lib/supabase";
import type {
  AdminArchivo,
  AdminEmpresaOption,
  AdminEmpresaRow,
  AdminProcesamiento,
  AdminProcesamientoEmpresa,
  AdminStats,
  PlanId,
} from "../types";

type EmpresaRow = {
  id: string;
  razon_social: string;
  tipo_usuario: string;
  plan_activo: PlanId;
  comercializador: string | null;
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

type CreateEmpresaPayload = {
  email: string;
  password: string;
  razon_social: string;
  cuit?: string;
  tipo_usuario: "GUMA" | "GUME" | "GUDI";
  comercializador?: string;
  distribuidor?: string;
  plan_activo: PlanId;
  acuerdo_mensual_mwh: number;
  nemos: string[];
  contratos: {
    numero_contrato: string;
    tipo: "RPB" | "RPE" | "BAS";
    generador_nemo: string;
    generador_nombre: string;
    precio_usd_mwh: number;
  volumen_mwh_mes: number;
  vigencia_inicio: string;
  vigencia_fin: string;
  }[];
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
  const [empresasResponse, nemosResponse] = await Promise.all([
    supabase.from("empresas").select("id,razon_social").order("razon_social"),
    supabase.from("nemos").select("empresa_id,nemo").eq("activo", true).order("nemo"),
  ]);

  if (empresasResponse.error) throw empresasResponse.error;
  if (nemosResponse.error) throw nemosResponse.error;

  const empresas = (empresasResponse.data ?? []) as Pick<EmpresaRow, "id" | "razon_social">[];
  const nemos = (nemosResponse.data ?? []) as { empresa_id: string; nemo: string }[];

  return empresas.map<AdminEmpresaOption>((empresa) => ({
    id: empresa.id,
    razon_social: empresa.razon_social,
    nemos: nemos.filter((row) => row.empresa_id === empresa.id).map((row) => row.nemo),
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

function indexByEmpresa<T extends { empresa_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const bucket = map.get(row.empresa_id) ?? [];
    bucket.push(row);
    map.set(row.empresa_id, bucket);
  });
  return map;
}

async function fetchProcesamientoEmpresas(
  procesamientoIds: string[],
): Promise<Map<string, AdminProcesamientoEmpresa[]>> {
  const result = new Map<string, AdminProcesamientoEmpresa[]>();
  if (!procesamientoIds.length) return result;

  const { data, error } = await supabase
    .from("procesamiento_empresas")
    .select("*,empresa:empresas(razon_social)")
    .in("procesamiento_id", procesamientoIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  (data as ProcesoEmpresaRow[] | null ?? []).forEach((row) => {
    const empresaRow: AdminProcesamientoEmpresa = {
      id: row.id,
      procesamiento_id: row.procesamiento_id,
      empresa_id: row.empresa_id,
      empresa_nombre: row.empresa?.razon_social?.trim() || "Empresa sin referencia",
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

function pickLatestClean(rows: MensualRow[]): Map<string, MensualRow> {
  const map = new Map<string, MensualRow>();
  rows.forEach((row) => {
    if (row.dato_sospechoso) return;
    if (!map.has(row.empresa_id)) map.set(row.empresa_id, row);
  });
  return map;
}

export async function loadAdminEmpresas() {
  const [empresasResponse, nemosResponse, mensualesResponse] = await Promise.all([
    supabase.from("empresas").select("id,razon_social,tipo_usuario,plan_activo,comercializador").order("razon_social"),
    supabase.from("nemos").select("empresa_id,nemo").eq("activo", true),
    supabase
      .from("datos_mensuales")
      .select("empresa_id,anio,mes,demanda_total_mwh,mater_mwh,porcentaje_renovable,dato_sospechoso")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
  ]);

  if (empresasResponse.error) throw empresasResponse.error;
  if (nemosResponse.error) throw nemosResponse.error;
  if (mensualesResponse.error) throw mensualesResponse.error;

  const empresas = (empresasResponse.data ?? []) as EmpresaRow[];
  const nemos = (nemosResponse.data ?? []) as { empresa_id: string; nemo: string }[];
  const mensuales = (mensualesResponse.data ?? []) as MensualRow[];
  const nemosByEmpresa = indexByEmpresa(nemos);
  const latestByEmpresa = pickLatestClean(mensuales);

  return empresas.map<AdminEmpresaRow>((empresa) => {
    const latest = latestByEmpresa.get(empresa.id);
    return {
      id: empresa.id,
      razon_social: empresa.razon_social,
      tipo_usuario: empresa.tipo_usuario,
      plan_activo: empresa.plan_activo,
      comercializador: empresa.comercializador ?? "",
      nemos: (nemosByEmpresa.get(empresa.id) ?? []).map((row) => row.nemo),
      contratos: 0,
      ultimo_mes: latest ? monthLabel(latest.anio, latest.mes) : "Sin datos",
      demanda_total_mwh: num(latest?.demanda_total_mwh),
      porcentaje_renovable: num(latest?.porcentaje_renovable),
    };
  });
}

export async function loadAdminDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [
    empresasResponse,
    nemosResponse,
    contratosResponse,
    mensualesResponse,
    archivosResponse,
    procesamientosResponse,
  ] = await Promise.all([
    supabase.from("empresas").select("id,razon_social,tipo_usuario,plan_activo,comercializador").order("razon_social"),
    supabase.from("nemos").select("empresa_id,nemo").eq("activo", true),
    supabase.from("contratos").select("empresa_id,id").eq("activo", true).gte("vigencia_fin", today),
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

  for (const response of [
    empresasResponse,
    nemosResponse,
    contratosResponse,
    mensualesResponse,
    archivosResponse,
    procesamientosResponse,
  ]) {
    if (response.error) throw response.error;
  }

  const procesamientos = (procesamientosResponse.data ?? []) as unknown as AdminProcesamiento[];
  const empresasByProcesamiento = await fetchProcesamientoEmpresas(procesamientos.map((p) => p.id));

  const empresas = (empresasResponse.data ?? []) as EmpresaRow[];
  const nemos = (nemosResponse.data ?? []) as { empresa_id: string; nemo: string }[];
  const contratos = (contratosResponse.data ?? []) as { empresa_id: string }[];
  const mensuales = (mensualesResponse.data ?? []) as MensualRow[];
  const nemosByEmpresa = indexByEmpresa(nemos);
  const contratosByEmpresa = indexByEmpresa(contratos);
  const latestByEmpresa = pickLatestClean(mensuales);

  // Acumulado YTD por empresa (suma meses limpios del año actual)
  const currentYear = new Date().getFullYear();
  const ytdByEmpresa = new Map<string, { demanda: number; mater: number }>();
  mensuales.forEach((row) => {
    if (row.dato_sospechoso || row.anio !== currentYear) return;
    const acc = ytdByEmpresa.get(row.empresa_id) ?? { demanda: 0, mater: 0 };
    acc.demanda += num(row.demanda_total_mwh);
    acc.mater += num(row.mater_mwh);
    ytdByEmpresa.set(row.empresa_id, acc);
  });

  const empresaRows: AdminEmpresaRow[] = empresas.map((empresa) => {
    const latest = latestByEmpresa.get(empresa.id);
    return {
      id: empresa.id,
      razon_social: empresa.razon_social,
      tipo_usuario: empresa.tipo_usuario,
      plan_activo: empresa.plan_activo,
      comercializador: empresa.comercializador ?? "",
      nemos: (nemosByEmpresa.get(empresa.id) ?? []).map((row) => row.nemo),
      contratos: (contratosByEmpresa.get(empresa.id) ?? []).length,
      ultimo_mes: latest ? monthLabel(latest.anio, latest.mes) : "Sin datos",
      demanda_total_mwh: num(latest?.demanda_total_mwh),
      porcentaje_renovable: num(latest?.porcentaje_renovable),
    };
  });

  const ytdRows = [...ytdByEmpresa.values()];
  const totalDemandYtd = ytdRows.reduce((sum, row) => sum + row.demanda, 0);
  const totalMaterYtd = ytdRows.reduce((sum, row) => sum + row.mater, 0);
  const promedioRenovable = totalDemandYtd ? (totalMaterYtd / totalDemandYtd) * 100 : 0;
  const clientesRiesgo = empresas.filter((empresa) => {
    const ytd = ytdByEmpresa.get(empresa.id);
    if (!ytd || !ytd.demanda) return false;
    return (ytd.mater / ytd.demanda) * 100 < 20;
  }).length;

  const stats: AdminStats = {
    empresas: empresas.length,
    nemos: nemos.length,
    contratos: contratos.length,
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

export async function createEmpresaCliente(payload: CreateEmpresaPayload) {
  const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
  if (error) throw error;
  return data as { user_id: string; empresa_id: string };
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
  if (!safeName) throw new Error("Nombre de archivo inválido");
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
    // Rollback manual: borrar archivo huérfano en storage
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
