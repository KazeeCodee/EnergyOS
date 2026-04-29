import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type FactorRow = {
  tipo_agente: string;
  nemo: string;
  anio: number;
  mes: number;
  horas_mes: number;
  demanda_real_mwh: string | null;
  demanda_real_pico_mwh: string | null;
  demanda_real_valle_mwh: string | null;
  demanda_real_resto_mwh: string | null;
  factor_carga_pct: string | null;
  factor_carga_metodo: string;
  pct_pico: string | null;
  pct_valle: string | null;
  pct_resto: string | null;
  ratio_pico_valle: string | null;
  concentracion_pico_score: string | null;
  demanda_real_yoy_base_mwh: string | null;
  estacionalidad_yoy: string | null;
  pct_pico_percentil: string | null;
  ratio_pico_valle_percentil: string | null;
  calidad_dato: string;
};

type BenchmarkRow = {
  tipo_agente: string;
  anio: number;
  mes: number;
  agentes_total: string | number;
  agentes_con_pvr: string | number;
  pct_pico_p25: string | null;
  pct_pico_p50: string | null;
  pct_pico_p75: string | null;
  pct_valle_p25: string | null;
  pct_valle_p50: string | null;
  pct_valle_p75: string | null;
  pct_resto_p25: string | null;
  pct_resto_p50: string | null;
  pct_resto_p75: string | null;
  ratio_pico_valle_p25: string | null;
  ratio_pico_valle_p50: string | null;
  ratio_pico_valle_p75: string | null;
  concentracion_pico_p25: string | null;
  concentracion_pico_p50: string | null;
  concentracion_pico_p75: string | null;
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

function periodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function mapFactor(row: FactorRow) {
  return {
    periodo: periodo(row.anio, row.mes),
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    anio: row.anio,
    mes: row.mes,
    horasMes: row.horas_mes,
    demandaRealMwh: toNumber(row.demanda_real_mwh),
    demandaRealPicoMwh: toNumber(row.demanda_real_pico_mwh),
    demandaRealValleMwh: toNumber(row.demanda_real_valle_mwh),
    demandaRealRestoMwh: toNumber(row.demanda_real_resto_mwh),
    factorCargaPct: toNumber(row.factor_carga_pct),
    factorCargaMetodo: row.factor_carga_metodo,
    pctPico: toNumber(row.pct_pico),
    pctValle: toNumber(row.pct_valle),
    pctResto: toNumber(row.pct_resto),
    ratioPicoValle: toNumber(row.ratio_pico_valle),
    concentracionPicoScore: toNumber(row.concentracion_pico_score),
    demandaRealYoyBaseMwh: toNumber(row.demanda_real_yoy_base_mwh),
    estacionalidadYoy: toNumber(row.estacionalidad_yoy),
    pctPicoPercentil: toNumber(row.pct_pico_percentil),
    ratioPicoVallePercentil: toNumber(row.ratio_pico_valle_percentil),
    calidadDato: row.calidad_dato,
  };
}

function mapBenchmark(row: BenchmarkRow) {
  return {
    periodo: periodo(row.anio, row.mes),
    tipoAgente: row.tipo_agente,
    anio: row.anio,
    mes: row.mes,
    agentesTotal: toNumber(row.agentes_total) ?? 0,
    agentesConPvr: toNumber(row.agentes_con_pvr) ?? 0,
    pctPicoP25: toNumber(row.pct_pico_p25),
    pctPicoP50: toNumber(row.pct_pico_p50),
    pctPicoP75: toNumber(row.pct_pico_p75),
    pctValleP25: toNumber(row.pct_valle_p25),
    pctValleP50: toNumber(row.pct_valle_p50),
    pctValleP75: toNumber(row.pct_valle_p75),
    pctRestoP25: toNumber(row.pct_resto_p25),
    pctRestoP50: toNumber(row.pct_resto_p50),
    pctRestoP75: toNumber(row.pct_resto_p75),
    ratioPicoValleP25: toNumber(row.ratio_pico_valle_p25),
    ratioPicoValleP50: toNumber(row.ratio_pico_valle_p50),
    ratioPicoValleP75: toNumber(row.ratio_pico_valle_p75),
    concentracionPicoP25: toNumber(row.concentracion_pico_p25),
    concentracionPicoP50: toNumber(row.concentracion_pico_p50),
    concentracionPicoP75: toNumber(row.concentracion_pico_p75),
  };
}

function avg(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function buildResumen(serie: ReturnType<typeof mapFactor>[]) {
  const valid = serie.filter((row) => row.calidadDato === "ok");
  const ultimoMes = serie.at(-1) ?? null;
  return {
    meses: serie.length,
    mesesConPvr: valid.length,
    ultimoMes,
    factorCargaPct: null,
    factorCargaMetodo: "no_disponible_sin_potencia_maxima",
    pctPicoPromedio: avg(valid.map((row) => row.pctPico)),
    pctVallePromedio: avg(valid.map((row) => row.pctValle)),
    pctRestoPromedio: avg(valid.map((row) => row.pctResto)),
    ratioPicoVallePromedio: avg(valid.map((row) => row.ratioPicoValle)),
    pctPicoPercentilPromedio: avg(valid.map((row) => row.pctPicoPercentil)),
    estacionalidadYoyUltimoMes: ultimoMes?.estacionalidadYoy ?? null,
    calidadDatoUltimoMes: ultimoMes?.calidadDato ?? null,
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
  if (!nemo) return json({ error: "Parámetro nemo requerido para usuarios multi-agente", nemos: autorizados }, 400);
  if (!autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

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
    const rows = await sql<FactorRow[]>`
      select
        tipo_agente, nemo, anio, mes, horas_mes,
        demanda_real_mwh, demanda_real_pico_mwh, demanda_real_valle_mwh, demanda_real_resto_mwh,
        factor_carga_pct, factor_carga_metodo,
        pct_pico, pct_valle, pct_resto,
        ratio_pico_valle, concentracion_pico_score,
        demanda_real_yoy_base_mwh, estacionalidad_yoy,
        pct_pico_percentil, ratio_pico_valle_percentil,
        calidad_dato
      from public.vw_factor_carga_mensual
      where nemo = ${nemo}
      order by anio desc, mes desc
      limit ${meses}
    `;
    const serie = rows.map(mapFactor).reverse();
    const tipoAgente = serie.at(-1)?.tipoAgente ?? null;

    const benchmarkRows = tipoAgente
      ? await sql<BenchmarkRow[]>`
          select *
          from public.vw_factor_carga_benchmark
          where tipo_agente = ${tipoAgente}
          order by anio desc, mes desc
          limit ${meses}
        `
      : [];
    const benchmark = benchmarkRows.map(mapBenchmark).reverse();

    return json({
      nemo,
      meses,
      autorizados,
      resumen: buildResumen(serie),
      serie,
      benchmark,
      notas: {
        factorCarga:
          "No se calcula factor de carga clásico porque falta potencia máxima mensual. Se exponen perfil P/V/R, ratio pico/valle y percentiles.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
