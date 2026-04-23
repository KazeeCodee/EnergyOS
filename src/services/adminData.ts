import { supabase } from "../lib/supabase";
import type {
  AdminArchivo,
  AdminEmpresaRow,
  AdminProcesamiento,
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

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function num(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(anio: number, mes: number) {
  return `${monthLabels[mes - 1] ?? mes} ${anio}`;
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

export async function loadAdminDashboard() {
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
    supabase.from("contratos").select("empresa_id,id").eq("activo", true),
    supabase.from("datos_mensuales").select("empresa_id,anio,mes,demanda_total_mwh,mater_mwh,porcentaje_renovable").order("anio", { ascending: false }).order("mes", { ascending: false }),
    supabase.from("cammesa_archivos").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("procesamientos").select("*").order("created_at", { ascending: false }).limit(20),
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

  const empresas = (empresasResponse.data ?? []) as EmpresaRow[];
  const nemos = (nemosResponse.data ?? []) as { empresa_id: string; nemo: string }[];
  const contratos = (contratosResponse.data ?? []) as { empresa_id: string }[];
  const mensuales = (mensualesResponse.data ?? []) as MensualRow[];
  const latestByEmpresa = new Map<string, MensualRow>();

  mensuales.forEach((row) => {
    if (!latestByEmpresa.has(row.empresa_id)) latestByEmpresa.set(row.empresa_id, row);
  });

  const empresaRows: AdminEmpresaRow[] = empresas.map((empresa) => {
    const latest = latestByEmpresa.get(empresa.id);
    return {
      id: empresa.id,
      razon_social: empresa.razon_social,
      tipo_usuario: empresa.tipo_usuario,
      plan_activo: empresa.plan_activo,
      comercializador: empresa.comercializador ?? "",
      nemos: nemos.filter((row) => row.empresa_id === empresa.id).map((row) => row.nemo),
      contratos: contratos.filter((row) => row.empresa_id === empresa.id).length,
      ultimo_mes: latest ? monthLabel(latest.anio, latest.mes) : "Sin datos",
      demanda_total_mwh: num(latest?.demanda_total_mwh),
      porcentaje_renovable: num(latest?.porcentaje_renovable),
    };
  });

  const latestRows = [...latestByEmpresa.values()];
  const stats: AdminStats = {
    empresas: empresas.length,
    nemos: nemos.length,
    contratos: contratos.length,
    demanda_total_mwh: latestRows.reduce((sum, row) => sum + num(row.demanda_total_mwh), 0),
    mater_mwh: latestRows.reduce((sum, row) => sum + num(row.mater_mwh), 0),
    promedio_renovable: latestRows.length
      ? latestRows.reduce((sum, row) => sum + num(row.porcentaje_renovable), 0) / latestRows.length
      : 0,
    clientes_riesgo: latestRows.filter((row) => num(row.porcentaje_renovable) < 20).length,
    archivos: (archivosResponse.data ?? []).length,
    procesamientos: (procesamientosResponse.data ?? []).length,
  };

  return {
    stats,
    empresas: empresaRows,
    archivos: (archivosResponse.data ?? []) as AdminArchivo[],
    procesamientos: (procesamientosResponse.data ?? []) as AdminProcesamiento[],
  };
}

export async function createEmpresaCliente(payload: CreateEmpresaPayload) {
  const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
  if (error) throw error;
  return data as { user_id: string; empresa_id: string };
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

  const safeName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${params.anio}/${String(params.mes).padStart(2, "0")}/${params.tipo.toLowerCase()}-${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("cammesa-uploads")
    .upload(path, params.file, { upsert: true, contentType: params.file.type || undefined });
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
  if (error) throw error;
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
