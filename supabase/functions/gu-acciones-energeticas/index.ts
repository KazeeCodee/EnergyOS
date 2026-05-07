import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

type AccionEstado = "pendiente" | "en_revision" | "resuelta" | "descartada";

type AccionRow = {
  id: number;
  nemo: string;
  tipo_agente: string | null;
  anio: number;
  mes: number;
  periodo_label: string;
  regla_codigo: string;
  titulo: string;
  descripcion: string;
  severidad: string;
  estado: AccionEstado;
  impacto_estimado_pesos: string | null;
  origen_modulo: string;
  origen_tabla: string;
  detalle: Record<string, unknown>;
  generada_en: string;
  actualizada_en: string;
  resuelta_en: string | null;
  comentario_ultimo: string | null;
};

type EventoRow = {
  id: number;
  accion_id: number;
  actor_user_id: string | null;
  estado_anterior: AccionEstado | null;
  estado_nuevo: AccionEstado | null;
  comentario: string | null;
  creado_en: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNemo(value: string | null): string {
  return (value ?? "").trim().toUpperCase().slice(0, 8);
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMeses(value: string | null): number {
  const parsed = Number(value ?? "12");
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(1, Math.min(Math.trunc(parsed), 24));
}

function mapAccion(row: AccionRow) {
  return {
    id: row.id,
    nemo: row.nemo,
    tipoAgente: row.tipo_agente,
    anio: row.anio,
    mes: row.mes,
    periodoLabel: row.periodo_label,
    reglaCodigo: row.regla_codigo,
    titulo: row.titulo,
    descripcion: row.descripcion,
    severidad: row.severidad,
    estado: row.estado,
    impactoEstimadoPesos: toNumber(row.impacto_estimado_pesos),
    origenModulo: row.origen_modulo,
    origenTabla: row.origen_tabla,
    detalle: row.detalle ?? {},
    generadaEn: row.generada_en,
    actualizadaEn: row.actualizada_en,
    resueltaEn: row.resuelta_en,
    comentarioUltimo: row.comentario_ultimo,
  };
}

function mapEvento(row: EventoRow) {
  return {
    id: row.id,
    accionId: row.accion_id,
    actorUserId: row.actor_user_id,
    estadoAnterior: row.estado_anterior,
    estadoNuevo: row.estado_nuevo,
    comentario: row.comentario,
    creadoEn: row.creado_en,
  };
}

function buildResumen(rows: AccionRow[]) {
  const abiertas = rows.filter((row) => row.estado === "pendiente" || row.estado === "en_revision");
  return {
    total: rows.length,
    abiertas: abiertas.length,
    pendientes: rows.filter((row) => row.estado === "pendiente").length,
    enRevision: rows.filter((row) => row.estado === "en_revision").length,
    resueltas: rows.filter((row) => row.estado === "resuelta").length,
    descartadas: rows.filter((row) => row.estado === "descartada").length,
    criticas: abiertas.filter((row) => row.severidad === "critica").length,
    altas: abiertas.filter((row) => row.severidad === "alta").length,
    impactoAbiertoPesos: abiertas.reduce((sum, row) => sum + (toNumber(row.impacto_estimado_pesos) ?? 0), 0),
  };
}

async function getAuthorizedContext(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_PUBLISHABLE_KEY");
  const railwayDatabaseUrl = Deno.env.get("RAILWAY_DATABASE_URL");
  if (!supabaseUrl || !supabaseAnonKey || !railwayDatabaseUrl) {
    return { response: json({ error: "Missing server configuration" }, 500) };
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { response: json({ error: "Missing bearer token" }, 401) };

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) return { response: json({ error: "Invalid JWT" }, 401) };

  const { data: nemosData, error: nemosError } = await supabase.rpc("current_user_nemos");
  if (nemosError) return { response: json({ error: nemosError.message }, 500) };

  const autorizados = ((nemosData ?? []) as string[]).map(normalizeNemo).filter(Boolean);
  if (autorizados.length === 0) return { response: json({ error: "El usuario no tiene agentes vinculados" }, 403) };

  return {
    userId: userResult.user.id,
    autorizados,
    railwayDatabaseUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "PATCH") return json({ error: "Method not allowed" }, 405);

  const context = await getAuthorizedContext(req);
  if ("response" in context) return context.response;

  const sql = postgres(context.railwayDatabaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    ssl: false,
  });

  try {
    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({})) as {
        id?: number;
        estado?: AccionEstado;
        comentario?: string;
      };
      const id = Number(body.id);
      const estado = body.estado;
      const comentario = typeof body.comentario === "string" ? body.comentario.trim().slice(0, 1000) : "";
      const estadosValidos: AccionEstado[] = ["pendiente", "en_revision", "resuelta", "descartada"];

      if (!Number.isInteger(id) || id <= 0) return json({ error: "Accion invalida" }, 400);
      if (!estado || !estadosValidos.includes(estado)) return json({ error: "Estado invalido" }, 400);

      const current = await sql<AccionRow[]>`
        select *
        from public.acciones_energeticas
        where id = ${id}
        limit 1
      `;
      const accion = current[0];
      if (!accion) return json({ error: "Accion no encontrada" }, 404);
      if (!context.autorizados.includes(normalizeNemo(accion.nemo))) {
        return json({ error: "Accion no autorizada para este usuario" }, 403);
      }

      const updatedRows = await sql.begin(async (tx) => {
        const updated = await tx<AccionRow[]>`
          update public.acciones_energeticas
          set estado = ${estado},
              comentario_ultimo = ${comentario || null},
              resuelta_en = case when ${estado} in ('resuelta', 'descartada') then now() else null end,
              actualizada_en = now()
          where id = ${id}
          returning *
        `;
        await tx`
          insert into public.acciones_energeticas_eventos (
            accion_id, actor_user_id, estado_anterior, estado_nuevo, comentario
          )
          values (${id}, ${context.userId}, ${accion.estado}, ${estado}, ${comentario || null})
        `;
        return updated;
      });

      return json({ accion: mapAccion(updatedRows[0]) });
    }

    const url = new URL(req.url);
    const requestedNemo = normalizeNemo(url.searchParams.get("nemo"));
    const nemo = requestedNemo || (context.autorizados.length === 1 ? context.autorizados[0] : "");
    if (!nemo) return json({ error: "Parametro nemo requerido para usuarios multi-agente", nemos: context.autorizados }, 400);
    if (!context.autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

    const meses = parseMeses(url.searchParams.get("meses"));
    const estado = url.searchParams.get("estado") as AccionEstado | "todas" | null;
    const estadosValidos = ["pendiente", "en_revision", "resuelta", "descartada", "todas"];
    const estadoFiltro = estado && estadosValidos.includes(estado) ? estado : "abiertas";

    await sql`select public.refresh_acciones_energeticas(${null}, ${null}, ${nemo})`;

    const rows = await sql<AccionRow[]>`
      select *
      from public.acciones_energeticas
      where nemo = ${nemo}
        and make_date(anio, mes, 1) >= (
          select max(make_date(anio, mes, 1)) - (${meses - 1} * interval '1 month')
          from public.acciones_energeticas
          where nemo = ${nemo}
        )
        and (
          ${estadoFiltro} = 'todas'
          or (${estadoFiltro} = 'abiertas' and estado in ('pendiente', 'en_revision'))
          or estado = ${estadoFiltro}
        )
      order by
        case severidad when 'critica' then 1 when 'alta' then 2 when 'media' then 3 else 4 end,
        anio desc,
        mes desc,
        impacto_estimado_pesos desc nulls last,
        id desc
      limit 200
    `;

    const actionIds = rows.map((row) => row.id);
    const eventos = actionIds.length > 0
      ? await sql<EventoRow[]>`
          select *
          from public.acciones_energeticas_eventos
          where accion_id in ${sql(actionIds)}
          order by creado_en desc
          limit 200
        `
      : [];

    return json({
      nemo,
      meses,
      estado: estadoFiltro,
      autorizados: context.autorizados,
      resumen: buildResumen(rows),
      acciones: rows.map(mapAccion),
      eventos: eventos.map(mapEvento),
      notas: {
        alcance: "Acciones generadas automaticamente desde DTE, spot, compliance 27.191 y consumo historico. Cada accion es una senal operativa para revisar, no un reclamo automatico.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
