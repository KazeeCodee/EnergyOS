import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type ComplianceRow = {
  tipo_agente: string;
  nemo: string;
  anio: number;
  mes: number;
  demanda_real_mwh: string | null;
  renovable_contratado_mwh: string | null;
  importe_renovable_pesos: string | null;
  precio_implicito_pesos_mwh: string | null;
  generadores_unicos: string | number;
  comercializadores_unicos: string | number;
  obligacion_pct: string | null;
  obligacion_mwh: string | null;
  pct_renovable_real: string | null;
  pct_renovable_ytd: string | null;
  demanda_ytd_mwh: string | null;
  renovable_ytd_mwh: string | null;
  brecha_ytd_mwh: string | null;
  brecha_mwh: string | null;
  multa_estimada_pesos: string | null;
  multa_ref_pesos_mwh: string | null;
  multa_metodo: string;
  cumple_mes: boolean;
  cumple_ytd: boolean;
  obligacion_fuente: string;
  calidad_dato: string;
};

type SeriePoint = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  demandaRealMwh: number | null;
  renovableContratadoMwh: number | null;
  importeRenovablePesos: number | null;
  precioImplicitoPesosMwh: number | null;
  generadoresUnicos: number;
  comercializadoresUnicos: number;
  obligacionPct: number | null;
  obligacionMwh: number | null;
  pctRenovableReal: number | null;
  pctRenovableYtd: number | null;
  demandaYtdMwh: number | null;
  renovableYtdMwh: number | null;
  brechaYtdMwh: number | null;
  brechaMwh: number | null;
  multaEstimadaPesos: number | null;
  multaRefPesosMwh: number | null;
  multaMetodo: string;
  cumpleMes: boolean;
  cumpleYtd: boolean;
  obligacionFuente: string;
  calidadDato: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNemo(value: string | null): string {
  return (value ?? "").trim().toUpperCase().slice(0, 8);
}

function parseMeses(value: string | null): number {
  const parsed = Number(value ?? "24");
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(Math.trunc(parsed), 63));
}

function mapRow(row: ComplianceRow): SeriePoint {
  const month = String(row.mes).padStart(2, "0");
  return {
    periodo: `${row.anio}-${month}`,
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    anio: row.anio,
    mes: row.mes,
    demandaRealMwh: toNumber(row.demanda_real_mwh),
    renovableContratadoMwh: toNumber(row.renovable_contratado_mwh),
    importeRenovablePesos: toNumber(row.importe_renovable_pesos),
    precioImplicitoPesosMwh: toNumber(row.precio_implicito_pesos_mwh),
    generadoresUnicos: toNumber(row.generadores_unicos) ?? 0,
    comercializadoresUnicos: toNumber(row.comercializadores_unicos) ?? 0,
    obligacionPct: toNumber(row.obligacion_pct),
    obligacionMwh: toNumber(row.obligacion_mwh),
    pctRenovableReal: toNumber(row.pct_renovable_real),
    pctRenovableYtd: toNumber(row.pct_renovable_ytd),
    demandaYtdMwh: toNumber(row.demanda_ytd_mwh),
    renovableYtdMwh: toNumber(row.renovable_ytd_mwh),
    brechaYtdMwh: toNumber(row.brecha_ytd_mwh),
    brechaMwh: toNumber(row.brecha_mwh),
    multaEstimadaPesos: toNumber(row.multa_estimada_pesos),
    multaRefPesosMwh: toNumber(row.multa_ref_pesos_mwh),
    multaMetodo: row.multa_metodo,
    cumpleMes: row.cumple_mes,
    cumpleYtd: row.cumple_ytd,
    obligacionFuente: row.obligacion_fuente,
    calidadDato: row.calidad_dato,
  };
}

function buildResumen(serie: SeriePoint[]) {
  const ultimoMes = serie.at(-1) ?? null;
  const latestYear = ultimoMes?.anio ?? null;
  const yearRows = latestYear === null ? [] : serie.filter((row) => row.anio === latestYear);
  const demanda = serie.reduce((sum, row) => sum + (row.demandaRealMwh ?? 0), 0);
  const renovable = serie.reduce((sum, row) => sum + (row.renovableContratadoMwh ?? 0), 0);
  const brecha = serie.reduce((sum, row) => sum + (row.brechaMwh ?? 0), 0);
  const multa = serie.reduce((sum, row) => sum + (row.multaEstimadaPesos ?? 0), 0);
  const brechaAnio = yearRows.reduce((sum, row) => sum + (row.brechaMwh ?? 0), 0);
  const multaAnio = yearRows.reduce((sum, row) => sum + (row.multaEstimadaPesos ?? 0), 0);

  return {
    meses: serie.length,
    ultimoMes,
    pctRenovablePromedio: demanda > 0 ? renovable / demanda : null,
    renovableContratadoMwh: renovable,
    brechaMwh: brecha,
    multaEstimadaPesos: multa,
    anioEnCurso: latestYear,
    brechaAnioEnCursoMwh: brechaAnio,
    multaAnioEnCursoPesos: multaAnio,
    cumpleYtd: ultimoMes?.cumpleYtd ?? false,
    brechaYtdMwh: ultimoMes?.brechaYtdMwh ?? null,
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
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) {
    return json({ error: "Invalid JWT" }, 401);
  }

  const { data: nemosData, error: nemosError } = await supabase.rpc("current_user_nemos");
  if (nemosError) return json({ error: nemosError.message }, 500);

  const autorizados = ((nemosData ?? []) as string[]).map(normalizeNemo).filter(Boolean);
  if (autorizados.length === 0) {
    return json({ error: "El usuario no tiene agentes vinculados" }, 403);
  }

  const url = new URL(req.url);
  const requestedNemo = normalizeNemo(url.searchParams.get("nemo"));
  const nemo = requestedNemo || (autorizados.length === 1 ? autorizados[0] : "");
  if (!nemo) {
    return json({ error: "Parámetro nemo requerido para usuarios multi-agente", nemos: autorizados }, 400);
  }
  if (!autorizados.includes(nemo)) {
    return json({ error: "NEMO no autorizado para este usuario" }, 403);
  }

  const meses = parseMeses(url.searchParams.get("meses"));
  const sql = postgres(railwayDatabaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    // Railway public proxy currently fails strict TLS validation from Deno.
    ssl: false,
  });

  try {
    const rows = await sql<ComplianceRow[]>`
      select
        tipo_agente, nemo, anio, mes,
        demanda_real_mwh,
        renovable_contratado_mwh,
        importe_renovable_pesos,
        precio_implicito_pesos_mwh,
        generadores_unicos,
        comercializadores_unicos,
        obligacion_pct,
        obligacion_mwh,
        pct_renovable_real,
        pct_renovable_ytd,
        demanda_ytd_mwh,
        renovable_ytd_mwh,
        brecha_ytd_mwh,
        brecha_mwh,
        multa_estimada_pesos,
        multa_ref_pesos_mwh,
        multa_metodo,
        cumple_mes,
        cumple_ytd,
        obligacion_fuente,
        calidad_dato
      from public.vw_compliance_27191_mensual
      where nemo = ${nemo}
      order by anio desc, mes desc
      limit ${meses}
    `;
    const serie = rows.map(mapRow).reverse();
    return json({
      nemo,
      meses,
      autorizados,
      resumen: buildResumen(serie),
      serie,
      notas: {
        multa: "Estimación MVP: usa override de tabla si existe; si no, precio renovable promedio del cliente 12m o universo anual.",
        obligacion: "Tabla configurable compliance_27191_obligacion en Railway.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
