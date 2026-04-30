import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type ExpoRow = {
  tipo_agente: string;
  nemo: string;
  anio: number;
  mes: number;
  distribuidor_nemo: string | null;
  demanda_real_mwh: string | null;
  demanda_real_pico_mwh: string | null;
  demanda_real_valle_mwh: string | null;
  demanda_real_resto_mwh: string | null;
  demanda_contratada_mwh: string | null;
  compra_spot_mwh: string | null;
  compra_spot_pico_mwh: string | null;
  compra_spot_valle_mwh: string | null;
  compra_spot_resto_mwh: string | null;
  spot_pesos: string | null;
  pct_spot: string | null;
  pct_mat: string | null;
  sobre_contrato_mwh: string | null;
  sub_contrato_mwh: string | null;
  costo_spot_promedio_pesos_mwh: string | null;
  calidad_dato: string;
};

type SeriePoint = {
  periodo: string;
  tipoAgente: string;
  nemo: string;
  anio: number;
  mes: number;
  distribuidorNemo: string | null;
  demandaRealMwh: number | null;
  demandaRealPicoMwh: number | null;
  demandaRealValleMwh: number | null;
  demandaRealRestoMwh: number | null;
  demandaContratadaMwh: number | null;
  compraSpotMwh: number | null;
  compraSpotPicoMwh: number | null;
  compraSpotValleMwh: number | null;
  compraSpotRestoMwh: number | null;
  spotPesos: number | null;
  pctSpot: number | null;
  pctMat: number | null;
  sobreContratoMwh: number | null;
  subContratoMwh: number | null;
  costoSpotPromedioPesosMwh: number | null;
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

function mapRow(row: ExpoRow): SeriePoint {
  const month = String(row.mes).padStart(2, "0");
  return {
    periodo: `${row.anio}-${month}`,
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    anio: row.anio,
    mes: row.mes,
    distribuidorNemo: row.distribuidor_nemo,
    demandaRealMwh: toNumber(row.demanda_real_mwh),
    demandaRealPicoMwh: toNumber(row.demanda_real_pico_mwh),
    demandaRealValleMwh: toNumber(row.demanda_real_valle_mwh),
    demandaRealRestoMwh: toNumber(row.demanda_real_resto_mwh),
    demandaContratadaMwh: toNumber(row.demanda_contratada_mwh),
    compraSpotMwh: toNumber(row.compra_spot_mwh),
    compraSpotPicoMwh: toNumber(row.compra_spot_pico_mwh),
    compraSpotValleMwh: toNumber(row.compra_spot_valle_mwh),
    compraSpotRestoMwh: toNumber(row.compra_spot_resto_mwh),
    spotPesos: toNumber(row.spot_pesos),
    pctSpot: toNumber(row.pct_spot),
    pctMat: toNumber(row.pct_mat),
    sobreContratoMwh: toNumber(row.sobre_contrato_mwh),
    subContratoMwh: toNumber(row.sub_contrato_mwh),
    costoSpotPromedioPesosMwh: toNumber(row.costo_spot_promedio_pesos_mwh),
    calidadDato: row.calidad_dato,
  };
}

function buildResumen(serie: SeriePoint[]) {
  const demanda = serie.reduce((sum, row) => sum + (row.demandaRealMwh ?? 0), 0);
  const spot = serie.reduce((sum, row) => sum + (row.compraSpotMwh ?? 0), 0);
  const mat = serie.reduce((sum, row) => sum + (row.demandaContratadaMwh ?? 0), 0);
  const spotPesos = serie.reduce((sum, row) => sum + (row.spotPesos ?? 0), 0);
  const subContrato = serie.reduce((sum, row) => sum + (row.subContratoMwh ?? 0), 0);
  const sobreContrato = serie.reduce((sum, row) => sum + (row.sobreContratoMwh ?? 0), 0);

  return {
    meses: serie.length,
    demandaRealMwh: demanda,
    compraSpotMwh: spot,
    demandaContratadaMwh: mat,
    pctSpot: demanda > 0 ? spot / demanda : null,
    pctMat: demanda > 0 ? mat / demanda : null,
    spotPesos,
    costoSpotPromedioPesosMwh: spot > 0 ? spotPesos / spot : null,
    subContratoMwh: subContrato,
    sobreContratoMwh: sobreContrato,
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
    // Railway public proxy currently fails strict TLS validation from Deno
    // with CaUsedAsEndEntity. The credential stays server-side as an Edge secret.
    ssl: false,
  });

  try {
    const rows = await sql<ExpoRow[]>`
      select
        tipo_agente, nemo, anio, mes, distribuidor_nemo,
        demanda_real_mwh, demanda_real_pico_mwh, demanda_real_valle_mwh, demanda_real_resto_mwh,
        demanda_contratada_mwh,
        compra_spot_mwh, compra_spot_pico_mwh, compra_spot_valle_mwh, compra_spot_resto_mwh,
        spot_pesos,
        pct_spot, pct_mat,
        sobre_contrato_mwh, sub_contrato_mwh,
        costo_spot_promedio_pesos_mwh,
        calidad_dato
      from public.vw_exposicion_spot_mensual
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
