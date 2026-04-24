import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  procesamiento_id?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (!payload.procesamiento_id) {
    return json({ error: "procesamiento_id is required" }, 400);
  }

  const { data: procesamiento, error: procesamientoError } = await admin
    .from("procesamientos")
    .select("id,anio,mes,estado,resumen")
    .eq("id", payload.procesamiento_id)
    .maybeSingle();
  if (procesamientoError) return json({ error: procesamientoError.message }, 500);
  if (!procesamiento) return json({ error: "Processing run not found" }, 404);
  if (procesamiento.estado === "procesando") {
    return json({ error: "La corrida ya esta en procesamiento." }, 409);
  }

  const resumen = typeof procesamiento.resumen === "object" && procesamiento.resumen !== null
    ? { ...procesamiento.resumen }
    : {};
  resumen["triggered_manually_at"] = new Date().toISOString();
  resumen["triggered_manually_by"] = userData.user.email ?? userData.user.id;

  const { error: updateError } = await admin
    .from("procesamientos")
    .update({
      estado: "pendiente",
      started_at: null,
      completed_at: null,
      error_message: null,
      resumen,
    })
    .eq("id", procesamiento.id);
  if (updateError) return json({ error: updateError.message }, 500);

  await admin.from("audit_logs").insert({
    actor_user_id: userData.user.id,
    action: "admin_trigger_processing",
    entity: "procesamientos",
    entity_id: procesamiento.id,
    metadata: { anio: procesamiento.anio, mes: procesamiento.mes, previous_status: procesamiento.estado },
  });

  const webhookUrl = Deno.env.get("PROCESSOR_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("PROCESSOR_WEBHOOK_SECRET");

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { "x-energyos-secret": webhookSecret } : {}),
      },
      body: JSON.stringify({
        procesamiento_id: procesamiento.id,
        anio: procesamiento.anio,
        mes: procesamiento.mes,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return json(
        {
          error: "No se pudo disparar el runner remoto.",
          detail: text || `Webhook responded with ${response.status}`,
        },
        502,
      );
    }

    return json({
      queued: true,
      mode: "webhook",
      message: `Procesamiento ${procesamiento.anio}-${String(procesamiento.mes).padStart(2, "0")} enviado al runner remoto.`,
    });
  }

  return json({
    queued: true,
    mode: "requeue",
    message:
      `Corrida ${procesamiento.anio}-${String(procesamiento.mes).padStart(2, "0")} reencolada.` +
      " Falta configurar PROCESSOR_WEBHOOK_URL para disparo remoto automatico.",
  });
});
