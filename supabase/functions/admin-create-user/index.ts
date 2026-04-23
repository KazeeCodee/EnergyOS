import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ContractInput = {
  numero_contrato: string;
  tipo: "RPB" | "RPE" | "BAS";
  generador_nemo: string;
  generador_nombre: string;
  precio_usd_mwh: number;
  volumen_mwh_mes: number;
  vigencia_inicio: string;
  vigencia_fin: string;
};

type Payload = {
  email: string;
  password: string;
  razon_social: string;
  cuit?: string;
  tipo_usuario: "GUMA" | "GUME" | "GUDI";
  comercializador?: string;
  distribuidor?: string;
  plan_activo: "compliance" | "gestion" | "full" | "white-label";
  acuerdo_mensual_mwh: number;
  nemos: string[];
  contratos: ContractInput[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNemo(nemo: string) {
  return nemo.trim().toUpperCase();
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
  const nemos = (payload.nemos ?? []).map(normalizeNemo).filter(Boolean);
  if (!payload.email || !payload.password || !payload.razon_social || nemos.length === 0) {
    return json({ error: "Email, password, razon_social and at least one Nemo are required" }, 400);
  }
  if (nemos.some((nemo) => nemo.length !== 8)) {
    return json({ error: "Every Nemo must have exactly 8 characters" }, 400);
  }

  let targetUserId: string | null = null;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { empresa: payload.razon_social },
  });

  if (createError) {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: listError.message }, 500);
    const existing = listData.users.find((user) => user.email?.toLowerCase() === payload.email.toLowerCase());
    if (!existing) return json({ error: createError.message }, 400);
    targetUserId = existing.id;
  } else {
    targetUserId = created.user?.id ?? null;
  }

  if (!targetUserId) return json({ error: "Could not resolve created user id" }, 500);

  const { data: empresa, error: empresaError } = await admin
    .from("empresas")
    .upsert(
      {
        razon_social: payload.razon_social,
        cuit: payload.cuit || null,
        tipo_usuario: payload.tipo_usuario,
        comercializador: payload.comercializador || null,
        distribuidor: payload.distribuidor || null,
        plan_activo: payload.plan_activo,
        acuerdo_mensual_mwh: payload.acuerdo_mensual_mwh,
        user_id: targetUserId,
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (empresaError) return json({ error: empresaError.message }, 400);

  const { error: nemosError } = await admin.from("nemos").upsert(
    nemos.map((nemo) => ({
      empresa_id: empresa.id,
      nemo,
      descripcion: null,
      activo: true,
    })),
    { onConflict: "empresa_id,nemo" },
  );
  if (nemosError) return json({ error: nemosError.message }, 400);

  if (payload.contratos?.length) {
    const { error: contratosError } = await admin.from("contratos").upsert(
      payload.contratos.map((contract) => ({
        empresa_id: empresa.id,
        numero_contrato: contract.numero_contrato,
        tipo: contract.tipo,
        generador_nemo: normalizeNemo(contract.generador_nemo),
        generador_nombre: contract.generador_nombre,
        precio_usd_mwh: contract.precio_usd_mwh,
        volumen_mwh_mes: contract.volumen_mwh_mes,
        vigencia_inicio: contract.vigencia_inicio,
        vigencia_fin: contract.vigencia_fin,
        activo: true,
      })),
      { onConflict: "empresa_id,numero_contrato" },
    );
    if (contratosError) return json({ error: contratosError.message }, 400);
  }

  await admin.from("audit_logs").insert({
    actor_user_id: userData.user.id,
    action: "admin_create_user",
    entity: "empresas",
    entity_id: empresa.id,
    metadata: { email: payload.email, nemos },
  });

  return json({ user_id: targetUserId, empresa_id: empresa.id });
});
