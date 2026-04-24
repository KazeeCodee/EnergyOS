import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  anio?: number;
  mes?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function padMonth(value: number) {
  return String(value).padStart(2, "0");
}

function buildRange(anio: number, mes: number) {
  const from = `${anio}-${padMonth(mes)}-01T00:00:00.000-03:00`;
  const nextYear = mes === 12 ? anio + 1 : anio;
  const nextMonth = mes === 12 ? 1 : mes + 1;
  const to = `${nextYear}-${padMonth(nextMonth)}-01T00:00:00.000-03:00`;
  return { from, to };
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `CAMMESA respondió ${response.status}`);
  }
  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase server configuration" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  const { data: adminProfile, error: adminError } = await admin
    .from("admin_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError) return json({ error: adminError.message }, 500);
  if (!adminProfile?.is_admin) return json({ error: "Admin access required" }, 403);

  const payload = (await req.json()) as Payload;
  const anio = Number(payload.anio);
  const mes = Number(payload.mes);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return json({ error: "anio y mes son obligatorios" }, 400);
  }

  const attachmentName = `DTE${String(anio).slice(-2)}${padMonth(mes)}.zip`;
  const { from, to } = buildRange(anio, mes);

  const listUrl = new URL("https://api.cammesa.com/pub-svc/public/findDocumentosByNemoRango");
  listUrl.search = new URLSearchParams({
    nemo: "DTE_EMISION",
    fechadesde: from,
    fechahasta: to,
  }).toString();

  let documentos: Array<Record<string, unknown>>;
  try {
    documentos = await fetchJson(listUrl);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo consultar CAMMESA" }, 502);
  }

  if (!Array.isArray(documentos) || documentos.length === 0) {
    return json({ error: `No hay documentos DTE_EMISION para ${anio}-${padMonth(mes)}` }, 404);
  }

  const documento = documentos.at(-1) ?? null;
  if (!documento || typeof documento.id !== "string") {
    return json({ error: "Documento CAMMESA inválido" }, 502);
  }

  const attachments = Array.isArray(documento.adjuntos) ? documento.adjuntos : [];
  const attachment = attachments.find((item) => {
    if (!item || typeof item !== "object") return false;
    const maybeId = "id" in item ? String(item.id ?? "") : "";
    const maybeName = "nombre" in item ? String(item.nombre ?? "") : "";
    return maybeId === attachmentName || maybeName === attachmentName;
  });
  if (!attachment) {
    return json({ error: `No encontré el adjunto ${attachmentName}` }, 404);
  }

  const downloadUrl = new URL("https://api.cammesa.com/pub-svc/public/findAttachmentByNemoId");
  downloadUrl.search = new URLSearchParams({
    nemo: "DTE_EMISION",
    docId: documento.id,
    attachmentId: attachmentName,
  }).toString();

  const attachmentResponse = await fetch(downloadUrl, { method: "GET" });
  if (!attachmentResponse.ok) {
    const detail = await attachmentResponse.text();
    return json({ error: detail || `No se pudo descargar ${attachmentName}` }, 502);
  }

  const zipBuffer = await attachmentResponse.arrayBuffer();
  const storagePath = `${anio}/${padMonth(mes)}/dte-${Date.now()}-${attachmentName}`;
  const uploadPayload = new Uint8Array(zipBuffer);
  const { error: uploadError } = await admin.storage
    .from("cammesa-uploads")
    .upload(storagePath, uploadPayload, { upsert: true, contentType: "application/zip" });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const { data: archivo, error: archivoError } = await admin
    .from("cammesa_archivos")
    .insert({
      tipo: "DTE",
      anio,
      mes,
      file_path: storagePath,
      file_name: attachmentName,
      size_bytes: uploadPayload.byteLength,
      content_type: "application/zip",
      uploaded_by: userData.user.id,
    })
    .select("*")
    .single();
  if (archivoError) return json({ error: archivoError.message }, 500);

  const { data: procesamiento, error: procesamientoError } = await admin
    .from("procesamientos")
    .insert({
      anio,
      mes,
      dte_archivo_id: archivo.id,
      variables_archivo_id: archivo.id,
      estado: "pendiente",
      resumen: {
        origen: "download-cammesa-dte",
        documento_id: documento.id,
        archivo_descargado: attachmentName,
      },
      creado_por: userData.user.id,
    })
    .select("*")
    .single();
  if (procesamientoError) return json({ error: procesamientoError.message }, 500);

  await admin.from("audit_logs").insert({
    actor_user_id: userData.user.id,
    action: "download_cammesa_dte",
    entity: "procesamientos",
    entity_id: procesamiento.id,
    metadata: { anio, mes, document_id: documento.id, attachment_name: attachmentName },
  });

  return json({
    ok: true,
    procesamiento_id: procesamiento.id,
    archivo_id: archivo.id,
    message: `ZIP ${attachmentName} descargado y corrida creada.`,
  });
});
