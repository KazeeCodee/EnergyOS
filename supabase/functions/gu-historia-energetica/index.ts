import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type SerieRow = {
  tipo_agente: string;
  nemo: string;
  anio: number;
  mes: number;
  demanda_real_mwh: string | null;
  demanda_real_pico_mwh: string | null;
  demanda_real_valle_mwh: string | null;
  demanda_real_resto_mwh: string | null;
  demanda_yoy_base_mwh: string | null;
  yoy_pct: string | null;
};

type ResumenRow = {
  tipo_agente: string;
  nemo: string;
  meses_disponibles: string | number;
  primer_anio: number;
  primer_mes: number;
  ultimo_anio: number;
  ultimo_mes: number;
  demanda_total_mwh: string | null;
  demanda_promedio_mensual_mwh: string | null;
  demanda_ultimos_12m_mwh: string | null;
  demanda_promedio_ultimos_12m_mwh: string | null;
  demanda_12m_previos_mwh: string | null;
  variacion_ultimos_12m_pct: string | null;
  primer_mes_demanda_mwh: string | null;
  ultimo_mes_demanda_mwh: string | null;
  mismo_mes_anio_anterior_mwh: string | null;
  variacion_yoy_ultimo_mes_pct: string | null;
  mes_mayor_consumo_anio: number;
  mes_mayor_consumo_mes: number;
  mes_mayor_consumo_mwh: string | null;
  mes_menor_consumo_anio: number;
  mes_menor_consumo_mes: number;
  mes_menor_consumo_mwh: string | null;
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
  const parsed = Number(value ?? "60");
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(Math.trunc(parsed), 63));
}

function periodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function mapSerie(row: SerieRow) {
  return {
    periodo: periodo(row.anio, row.mes),
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    anio: row.anio,
    mes: row.mes,
    demandaMwh: toNumber(row.demanda_real_mwh),
    energiaBandaPicoMwh: toNumber(row.demanda_real_pico_mwh),
    energiaBandaValleMwh: toNumber(row.demanda_real_valle_mwh),
    energiaBandaRestoMwh: toNumber(row.demanda_real_resto_mwh),
    demandaYoyBaseMwh: toNumber(row.demanda_yoy_base_mwh),
    yoyPct: toNumber(row.yoy_pct),
  };
}

function mapResumen(row: ResumenRow | undefined) {
  if (!row) return null;
  return {
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    mesesDisponibles: toNumber(row.meses_disponibles) ?? 0,
    primerPeriodo: periodo(row.primer_anio, row.primer_mes),
    ultimoPeriodo: periodo(row.ultimo_anio, row.ultimo_mes),
    demandaTotalMwh: toNumber(row.demanda_total_mwh),
    demandaPromedioMensualMwh: toNumber(row.demanda_promedio_mensual_mwh),
    demandaUltimos12mMwh: toNumber(row.demanda_ultimos_12m_mwh),
    demandaPromedioUltimos12mMwh: toNumber(row.demanda_promedio_ultimos_12m_mwh),
    demanda12mPreviosMwh: toNumber(row.demanda_12m_previos_mwh),
    variacionUltimos12mPct: toNumber(row.variacion_ultimos_12m_pct),
    primerMesDemandaMwh: toNumber(row.primer_mes_demanda_mwh),
    ultimoMesDemandaMwh: toNumber(row.ultimo_mes_demanda_mwh),
    mismoMesAnioAnteriorMwh: toNumber(row.mismo_mes_anio_anterior_mwh),
    variacionYoyUltimoMesPct: toNumber(row.variacion_yoy_ultimo_mes_pct),
    mesMayorConsumo: {
      periodo: periodo(row.mes_mayor_consumo_anio, row.mes_mayor_consumo_mes),
      anio: row.mes_mayor_consumo_anio,
      mes: row.mes_mayor_consumo_mes,
      demandaMwh: toNumber(row.mes_mayor_consumo_mwh),
    },
    mesMenorConsumo: {
      periodo: periodo(row.mes_menor_consumo_anio, row.mes_menor_consumo_mes),
      anio: row.mes_menor_consumo_anio,
      mes: row.mes_menor_consumo_mes,
      demandaMwh: toNumber(row.mes_menor_consumo_mwh),
    },
  };
}

function buildHeatmap(serie: ReturnType<typeof mapSerie>[]) {
  const values = serie.map((row) => row.demandaMwh ?? 0);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min;
  return serie.map((row) => {
    const demanda = row.demandaMwh ?? 0;
    return {
      anio: row.anio,
      mes: row.mes,
      periodo: row.periodo,
      demandaMwh: row.demandaMwh,
      intensidadNormalizada: range > 0 ? (demanda - min) / range : null,
    };
  });
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
    const rows = await sql<SerieRow[]>`
      with serie as (
        select
          c.tipo_agente,
          c.nemo,
          c.anio,
          c.mes,
          c.demanda_real_mwh,
          c.demanda_real_pico_mwh,
          c.demanda_real_valle_mwh,
          c.demanda_real_resto_mwh,
          prev.demanda_real_mwh as demanda_yoy_base_mwh,
          case
            when prev.demanda_real_mwh > 0
              then round((c.demanda_real_mwh - prev.demanda_real_mwh) / prev.demanda_real_mwh, 6)
          end as yoy_pct
        from public.vw_consumo_gu_mensual c
        left join public.vw_consumo_gu_mensual prev
          on prev.tipo_agente = c.tipo_agente
         and prev.nemo = c.nemo
         and prev.anio = c.anio - 1
         and prev.mes = c.mes
        where c.nemo = ${nemo}
        order by c.anio desc, c.mes desc
        limit ${meses}
      )
      select *
      from serie
      order by anio asc, mes asc
    `;

    const resumenRows = await sql<ResumenRow[]>`
      select *
      from public.vw_historia_resumen_agente
      where nemo = ${nemo}
      limit 1
    `;

    const serieMensual = rows.map(mapSerie);
    return json({
      nemo,
      meses,
      autorizados,
      serieMensual,
      heatmap: buildHeatmap(serieMensual),
      resumen: mapResumen(resumenRows[0]),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
