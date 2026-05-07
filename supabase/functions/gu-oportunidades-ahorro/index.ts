import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type OportunidadRow = {
  ranking_nemo: number;
  nemo: string;
  tipo_agente: string | null;
  anio: number;
  mes: number;
  periodo_label: string;
  oportunidad_codigo: string;
  oportunidad_nombre: string;
  dolor_cliente: string;
  accion_recomendada: string;
  impacto_estimado_pesos: string | null;
  prioridad: string;
  confianza: string;
  ranking_score: string | null;
  origen_modulo: string;
  origen_tabla: string;
  detalle: Record<string, unknown>;
};

type Oportunidad = ReturnType<typeof mapOportunidad>;

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

function prioridadWeight(value: string): number {
  if (value === "alta") return 3;
  if (value === "media") return 2;
  return 1;
}

function confianzaWeight(value: string): number {
  if (value === "alta") return 3;
  if (value === "media") return 2;
  return 1;
}

function mapOportunidad(row: OportunidadRow) {
  return {
    rankingNemo: row.ranking_nemo,
    nemo: row.nemo,
    tipoAgente: row.tipo_agente,
    anio: row.anio,
    mes: row.mes,
    periodoLabel: row.periodo_label,
    oportunidadCodigo: row.oportunidad_codigo,
    oportunidadNombre: row.oportunidad_nombre,
    dolorCliente: row.dolor_cliente,
    accionRecomendada: row.accion_recomendada,
    impactoEstimadoPesos: toNumber(row.impacto_estimado_pesos) ?? 0,
    prioridad: row.prioridad,
    confianza: row.confianza,
    rankingScore: toNumber(row.ranking_score) ?? 0,
    origenModulo: row.origen_modulo,
    origenTabla: row.origen_tabla,
    detalle: row.detalle ?? {},
  };
}

function buildCategorias(oportunidades: Oportunidad[]) {
  const byCode = new Map<string, Oportunidad[]>();
  for (const item of oportunidades) {
    const current = byCode.get(item.oportunidadCodigo) ?? [];
    current.push(item);
    byCode.set(item.oportunidadCodigo, current);
  }

  return Array.from(byCode.entries())
    .map(([codigo, rows]) => {
      const top = rows.slice().sort((a, b) => b.rankingScore - a.rankingScore)[0];
      const prioridad = rows.reduce((best, row) => prioridadWeight(row.prioridad) > prioridadWeight(best) ? row.prioridad : best, rows[0].prioridad);
      const confianza = rows.reduce((best, row) => confianzaWeight(row.confianza) > confianzaWeight(best) ? row.confianza : best, rows[0].confianza);
      const impactoTotal = rows.reduce((sum, row) => sum + row.impactoEstimadoPesos, 0);
      const rankingScore = rows.reduce((sum, row) => sum + row.rankingScore, 0);

      return {
        oportunidadCodigo: codigo,
        oportunidadNombre: top.oportunidadNombre,
        dolorCliente: top.dolorCliente,
        accionRecomendada: top.accionRecomendada,
        impactoTotalPesos: impactoTotal,
        rankingScore,
        prioridad,
        confianza,
        periodosCount: rows.length,
        periodoTop: top.periodoLabel,
        origenModulo: top.origenModulo,
      };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .map((row, index) => ({ ...row, ranking: index + 1 }));
}

function buildResumen(oportunidades: Oportunidad[], categorias: ReturnType<typeof buildCategorias>) {
  return {
    oportunidades: oportunidades.length,
    categorias: categorias.length,
    impactoTotalPesos: categorias.reduce((sum, row) => sum + row.impactoTotalPesos, 0),
    topCategoria: categorias[0] ?? null,
    altas: categorias.filter((row) => row.prioridad === "alta").length,
    confianzaAlta: categorias.filter((row) => row.confianza === "alta").length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_PUBLISHABLE_KEY");
  const railwayDatabaseUrl = Deno.env.get("RAILWAY_DATABASE_URL");
  if (!supabaseUrl || !supabaseAnonKey || !railwayDatabaseUrl) {
    return json({ error: "Missing server configuration" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) return json({ error: "Invalid JWT" }, 401);

  const { data: nemosData, error: nemosError } = await supabase.rpc("current_user_nemos");
  if (nemosError) return json({ error: nemosError.message }, 500);

  const autorizados = ((nemosData ?? []) as string[]).map(normalizeNemo).filter(Boolean);
  if (autorizados.length === 0) return json({ error: "El usuario no tiene agentes vinculados" }, 403);

  const url = new URL(req.url);
  const requestedNemo = normalizeNemo(url.searchParams.get("nemo"));
  const nemo = requestedNemo || (autorizados.length === 1 ? autorizados[0] : "");
  if (!nemo) return json({ error: "Parametro nemo requerido para usuarios multi-agente", nemos: autorizados }, 400);
  if (!autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

  const meses = parseMeses(url.searchParams.get("meses"));
  const sql = postgres(railwayDatabaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    ssl: false,
  });

  try {
    const rows = await sql<OportunidadRow[]>`
      select *
      from public.vw_oportunidades_ahorro_mensual
      where nemo = ${nemo}
        and make_date(anio, mes, 1) >= (
          select max(make_date(anio, mes, 1)) - (${meses - 1} * interval '1 month')
          from public.vw_oportunidades_ahorro_mensual
          where nemo = ${nemo}
        )
      order by ranking_score desc, impacto_estimado_pesos desc
      limit 200
    `;

    const oportunidades = rows.map(mapOportunidad);
    const categorias = buildCategorias(oportunidades);

    return json({
      nemo,
      meses,
      autorizados,
      resumen: buildResumen(oportunidades, categorias),
      categorias,
      oportunidades: oportunidades.slice(0, 80),
      notas: {
        alcance: "Ranking estimado con datos disponibles de DTE, spot, compliance 27.191, consumo y acciones abiertas. No usa contratos privados y no implica ahorro garantizado.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
