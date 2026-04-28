import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  email?: string;
  password?: string;
};

type VerifyRow = {
  trial_id: string;
  trial_user_id: string | null;
  trial_status: string;
  trial_expires_at: string;
  trial_is_valid: boolean;
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

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  if (!email || !password) return json({ error: "Email y contraseña requeridos" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: verifyRows, error: verifyError } = await admin.rpc("verify_trial_credentials", {
    p_email: email,
    p_password: password,
  });
  if (verifyError) return json({ error: verifyError.message }, 500);

  const trial = (verifyRows as VerifyRow[] | null)?.[0];
  if (!trial || !trial.trial_is_valid) {
    return json({ error: "Credenciales inválidas" }, 401);
  }
  if (trial.trial_status !== "active") {
    return json({ error: "La cuenta de prueba ya no está activa", code: "trial_inactive" }, 403);
  }
  if (new Date(trial.trial_expires_at).getTime() <= Date.now()) {
    return json({ error: "La cuenta de prueba expiró", code: "trial_expired" }, 403);
  }

  let userId = trial.trial_user_id;

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { trial: true, trial_id: trial.trial_id },
    });

    if (createError) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listError) return json({ error: listError.message }, 500);
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) return json({ error: createError.message }, 500);
      userId = existing.id;
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updateError) return json({ error: updateError.message }, 500);
    } else {
      userId = created.user?.id ?? null;
    }

    if (!userId) return json({ error: "No se pudo provisionar el usuario" }, 500);

    const { error: linkError } = await admin.rpc("set_trial_user_id", {
      p_trial_id: trial.trial_id,
      p_user_id: userId,
    });
    if (linkError) return json({ error: linkError.message }, 500);
  } else {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
    });
    if (updateError) return json({ error: updateError.message }, 500);
  }

  return json({
    ok: true,
    user_id: userId,
    expires_at: trial.trial_expires_at,
  });
});
