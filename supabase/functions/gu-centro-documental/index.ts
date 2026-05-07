import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const BUCKET = "energy-documents";

type DocumentoRow = {
  id: string;
  nemo: string;
  user_id: string;
  tipo_documento: string;
  titulo: string;
  proveedor_nombre: string | null;
  periodo_anio: number | null;
  periodo_mes: number | null;
  fecha_documento: string | null;
  fecha_vencimiento: string | null;
  confidencial: boolean;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  notas: string | null;
  estado: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ContratoRow = {
  id: string;
  nemo: string;
  user_id: string;
  documento_id: string | null;
  tipo_contrato: string;
  proveedor_nombre: string;
  contraparte_nemo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  precio_energia: string | number | null;
  moneda: string | null;
  volumen_mwh_mes: string | number | null;
  porcentaje_cobertura: string | number | null;
  potencia_mw: string | number | null;
  take_or_pay: boolean | null;
  take_or_pay_pct: string | number | null;
  ajuste_descripcion: string | null;
  prioridad_despacho: string | null;
  punto_suministro: string | null;
  facturacion_frecuencia: string | null;
  estado: string;
  notas: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNemo(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().slice(0, 8);
}

function cleanText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, max);
  return cleaned || null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function mapDocumento(row: DocumentoRow) {
  return {
    id: row.id,
    nemo: row.nemo,
    userId: row.user_id,
    tipoDocumento: row.tipo_documento,
    titulo: row.titulo,
    proveedorNombre: row.proveedor_nombre,
    periodoAnio: row.periodo_anio,
    periodoMes: row.periodo_mes,
    fechaDocumento: row.fecha_documento,
    fechaVencimiento: row.fecha_vencimiento,
    confidencial: row.confidencial,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    notas: row.notas,
    estado: row.estado,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapContrato(row: ContratoRow) {
  return {
    id: row.id,
    nemo: row.nemo,
    userId: row.user_id,
    documentoId: row.documento_id,
    tipoContrato: row.tipo_contrato,
    proveedorNombre: row.proveedor_nombre,
    contraparteNemo: row.contraparte_nemo,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin,
    precioEnergia: toNumber(row.precio_energia),
    moneda: row.moneda,
    volumenMwhMes: toNumber(row.volumen_mwh_mes),
    porcentajeCobertura: toNumber(row.porcentaje_cobertura),
    potenciaMw: toNumber(row.potencia_mw),
    takeOrPay: row.take_or_pay,
    takeOrPayPct: toNumber(row.take_or_pay_pct),
    ajusteDescripcion: row.ajuste_descripcion,
    prioridadDespacho: row.prioridad_despacho,
    puntoSuministro: row.punto_suministro,
    facturacionFrecuencia: row.facturacion_frecuencia,
    estado: row.estado,
    notas: row.notas,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildResumen(documentos: DocumentoRow[], contratos: ContratoRow[]) {
  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(now.getDate() + 90);
  const vencen90 = contratos.filter((contrato) => {
    if (!contrato.fecha_fin) return false;
    const fecha = new Date(`${contrato.fecha_fin}T00:00:00`);
    return fecha >= now && fecha <= in90;
  }).length;

  const contratosIncompletos = contratos.filter((contrato) => (
    contrato.precio_energia === null ||
    !contrato.moneda ||
    (!contrato.volumen_mwh_mes && !contrato.porcentaje_cobertura) ||
    !contrato.fecha_fin
  )).length;

  return {
    documentos: documentos.length,
    contratos: contratos.length,
    contratosVigentes: contratos.filter((c) => c.estado === "vigente").length,
    contratosVencen90Dias: vencen90,
    contratosIncompletos,
    valorDesbloqueado: {
      auditoriaFacturaMater: contratos.some((c) => c.precio_energia !== null && c.moneda),
      forecastContractual: contratos.some((c) => c.fecha_fin && c.precio_energia !== null),
      compliancePreciso: contratos.some((c) => c.volumen_mwh_mes !== null || c.porcentaje_cobertura !== null),
    },
  };
}

async function getContext(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { response: json({ error: "Missing server configuration" }, 500) };
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { response: json({ error: "Missing bearer token" }, 401) };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const token = authHeader.replace("Bearer ", "");
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) return { response: json({ error: "Invalid JWT" }, 401) };

  const { data: nemosData, error: nemosError } = await userClient.rpc("current_user_nemos");
  if (nemosError) return { response: json({ error: nemosError.message }, 500) };

  const autorizados = ((nemosData ?? []) as string[]).map(normalizeNemo).filter(Boolean);
  if (autorizados.length === 0) return { response: json({ error: "El usuario no tiene agentes vinculados" }, 403) };

  return { userId: userResult.user.id, autorizados, admin };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST", "PATCH"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  const context = await getContext(req);
  if ("response" in context) return context.response;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    if (req.method === "GET") {
      const requestedNemo = normalizeNemo(url.searchParams.get("nemo"));
      const nemo = requestedNemo || (context.autorizados.length === 1 ? context.autorizados[0] : "");
      if (!nemo) return json({ error: "Parametro nemo requerido para usuarios multi-agente", nemos: context.autorizados }, 400);
      if (!context.autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

      const [{ data: documentos, error: documentosError }, { data: contratos, error: contratosError }] = await Promise.all([
        context.admin
          .from("documentos_energeticos")
          .select("*")
          .eq("nemo", nemo)
          .neq("estado", "archivado")
          .order("created_at", { ascending: false })
          .limit(200),
        context.admin
          .from("contratos_energeticos")
          .select("*")
          .eq("nemo", nemo)
          .order("fecha_fin", { ascending: true, nullsFirst: false })
          .limit(100),
      ]);
      if (documentosError) return json({ error: documentosError.message }, 500);
      if (contratosError) return json({ error: contratosError.message }, 500);

      const docs = (documentos ?? []) as DocumentoRow[];
      const contracts = (contratos ?? []) as ContratoRow[];
      return json({
        nemo,
        autorizados: context.autorizados,
        resumen: buildResumen(docs, contracts),
        documentos: docs.map(mapDocumento),
        contratos: contracts.map(mapContrato),
        notas: {
          alcance: "Documentos privados cargados por el usuario. La ficha contractual habilita analisis futuros de factura MATER, forecast y compliance mas preciso.",
        },
      });
    }

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const nemo = normalizeNemo(payload.nemo as string | null);
    if (!nemo) return json({ error: "NEMO requerido" }, 400);
    if (!context.autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

    if (req.method === "POST" && action === "signed-url") {
      const documentoId = cleanText(payload.documentoId, 80);
      if (!documentoId) return json({ error: "documentoId requerido" }, 400);

      const { data: documento, error: docError } = await context.admin
        .from("documentos_energeticos")
        .select("*")
        .eq("id", documentoId)
        .eq("nemo", nemo)
        .single();
      if (docError || !documento) return json({ error: docError?.message ?? "Documento no encontrado" }, 404);

      const row = documento as DocumentoRow;
      const { data: signed, error: signedError } = await context.admin
        .storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, 60 * 5);
      if (signedError) return json({ error: signedError.message }, 500);

      await context.admin.from("documentos_energeticos_eventos").insert({
        documento_id: row.id,
        nemo,
        user_id: context.userId,
        evento: "documento_descargado",
        detalle: { file_name: row.file_name },
      });

      return json({ signedUrl: signed.signedUrl });
    }

    if (req.method === "POST" && action === "documento") {
      const storagePath = cleanText(payload.storagePath, 1000);
      const titulo = cleanText(payload.titulo, 240);
      const tipoDocumento = cleanText(payload.tipoDocumento, 80) ?? "otro";
      if (!storagePath || !titulo) return json({ error: "storagePath y titulo son requeridos" }, 400);
      if (!storagePath.startsWith(`${nemo}/${context.userId}/`)) return json({ error: "storagePath no autorizado" }, 403);

      const insert = {
        nemo,
        user_id: context.userId,
        tipo_documento: tipoDocumento,
        titulo,
        proveedor_nombre: cleanText(payload.proveedorNombre, 240),
        periodo_anio: cleanNumber(payload.periodoAnio),
        periodo_mes: cleanNumber(payload.periodoMes),
        fecha_documento: cleanDate(payload.fechaDocumento),
        fecha_vencimiento: cleanDate(payload.fechaVencimiento),
        confidencial: payload.confidencial !== false,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_name: cleanText(payload.fileName, 300) ?? "documento",
        mime_type: cleanText(payload.mimeType, 160),
        file_size_bytes: cleanNumber(payload.fileSizeBytes),
        notas: cleanText(payload.notas, 1200),
        metadata: typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {},
      };

      const { data, error } = await context.admin
        .from("documentos_energeticos")
        .insert(insert)
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);

      await context.admin.from("documentos_energeticos_eventos").insert({
        documento_id: data.id,
        nemo,
        user_id: context.userId,
        evento: "documento_creado",
        detalle: { tipo_documento: tipoDocumento },
      });

      return json({ documento: mapDocumento(data as DocumentoRow) }, 201);
    }

    if (req.method === "POST" && action === "contrato") {
      const proveedorNombre = cleanText(payload.proveedorNombre, 240);
      if (!proveedorNombre) return json({ error: "proveedorNombre requerido" }, 400);

      const documentoId = cleanText(payload.documentoId, 80);
      if (documentoId) {
        const { data: documento, error: docError } = await context.admin
          .from("documentos_energeticos")
          .select("id")
          .eq("id", documentoId)
          .eq("nemo", nemo)
          .maybeSingle();
        if (docError || !documento) return json({ error: "Documento asociado no autorizado o inexistente" }, 403);
      }

      const insert = {
        nemo,
        user_id: context.userId,
        documento_id: documentoId,
        tipo_contrato: cleanText(payload.tipoContrato, 80) ?? "mater",
        proveedor_nombre: proveedorNombre,
        contraparte_nemo: normalizeNemo(payload.contraparteNemo as string | null) || null,
        fecha_inicio: cleanDate(payload.fechaInicio),
        fecha_fin: cleanDate(payload.fechaFin),
        precio_energia: cleanNumber(payload.precioEnergia),
        moneda: cleanText(payload.moneda, 3),
        volumen_mwh_mes: cleanNumber(payload.volumenMwhMes),
        porcentaje_cobertura: cleanNumber(payload.porcentajeCobertura),
        potencia_mw: cleanNumber(payload.potenciaMw),
        take_or_pay: typeof payload.takeOrPay === "boolean" ? payload.takeOrPay : null,
        take_or_pay_pct: cleanNumber(payload.takeOrPayPct),
        ajuste_descripcion: cleanText(payload.ajusteDescripcion, 1000),
        prioridad_despacho: cleanText(payload.prioridadDespacho, 240),
        punto_suministro: cleanText(payload.puntoSuministro, 240),
        facturacion_frecuencia: cleanText(payload.facturacionFrecuencia, 120),
        estado: cleanText(payload.estado, 80) ?? "vigente",
        notas: cleanText(payload.notas, 1200),
        metadata: typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {},
      };

      const { data, error } = await context.admin
        .from("contratos_energeticos")
        .insert(insert)
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);

      await context.admin.from("documentos_energeticos_eventos").insert({
        contrato_id: data.id,
        documento_id: documentoId,
        nemo,
        user_id: context.userId,
        evento: "contrato_creado",
        detalle: { proveedor_nombre: proveedorNombre },
      });

      return json({ contrato: mapContrato(data as ContratoRow) }, 201);
    }

    if (req.method === "PATCH") {
      const id = cleanText(payload.id, 80);
      const entity = cleanText(payload.entity, 40);
      if (!id || !entity) return json({ error: "id y entity requeridos" }, 400);

      if (entity === "documento") {
        const update = {
          titulo: cleanText(payload.titulo, 240),
          proveedor_nombre: cleanText(payload.proveedorNombre, 240),
          fecha_vencimiento: cleanDate(payload.fechaVencimiento),
          notas: cleanText(payload.notas, 1200),
          estado: cleanText(payload.estado, 80),
        };
        const { data, error } = await context.admin
          .from("documentos_energeticos")
          .update(update)
          .eq("id", id)
          .eq("nemo", nemo)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ documento: mapDocumento(data as DocumentoRow) });
      }

      if (entity === "contrato") {
        const update = {
          proveedor_nombre: cleanText(payload.proveedorNombre, 240),
          fecha_inicio: cleanDate(payload.fechaInicio),
          fecha_fin: cleanDate(payload.fechaFin),
          precio_energia: cleanNumber(payload.precioEnergia),
          moneda: cleanText(payload.moneda, 3),
          volumen_mwh_mes: cleanNumber(payload.volumenMwhMes),
          porcentaje_cobertura: cleanNumber(payload.porcentajeCobertura),
          estado: cleanText(payload.estado, 80),
          notas: cleanText(payload.notas, 1200),
        };
        const { data, error } = await context.admin
          .from("contratos_energeticos")
          .update(update)
          .eq("id", id)
          .eq("nemo", nemo)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ contrato: mapContrato(data as ContratoRow) });
      }
    }

    return json({ error: "Accion no soportada" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Centro documental failed";
    return json({ error: message }, 500);
  }
});
