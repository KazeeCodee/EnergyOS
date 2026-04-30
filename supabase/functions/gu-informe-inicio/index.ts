import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type UniversoRow = {
  tipo_agente: string;
  demanda_total_mwh: string | null;
  mater_estimado_mwh: string | null;
  spot_mwh: string | null;
  plus_mwh: string | null;
  plus_disponible: boolean;
  mater_estimado_pct: string | null;
  spot_pct: string | null;
  plus_pct: string | null;
  agentes_count: string | number;
};

type MercadoRow = {
  anio: number;
  mes: number;
  fuente: string;
  periodo_completo: boolean;
  fuente_desde: string | Date | null;
  fuente_hasta: string | Date | null;
  generacion_total_gwh: string | null;
  generacion_total_mom_pct: string | null;
  generacion_total_yoy_pct: string | null;
  generacion_mater_gwh: string | null;
  generacion_mater_mom_pct: string | null;
  generacion_mater_yoy_pct: string | null;
  nuclear_gwh: string | null;
  termico_gwh: string | null;
  renovable_hidro_50mw_gwh: string | null;
  renovable_ley_26190_gwh: string | null;
  importacion_gwh: string | null;
  nuclear_pct: string | null;
  termico_pct: string | null;
  renovable_hidro_50mw_pct: string | null;
  renovable_ley_26190_pct: string | null;
  importacion_pct: string | null;
};

type ClienteMesRow = {
  tipo_agente: string;
  nemo: string;
  demanda_real_mwh: string | null;
  demanda_contratada_mwh: string | null;
  compra_spot_mwh: string | null;
  demanda_real_pico_mwh: string | null;
  demanda_real_valle_mwh: string | null;
  demanda_real_resto_mwh: string | null;
};

type ClienteSerieRow = {
  anio: number;
  mes: number;
  demanda_real_mwh: string | null;
  demanda_contratada_mwh: string | null;
  compra_spot_mwh: string | null;
};

type ComplianceRow = {
  pct_renovable_ytd: string | null;
  cumple_ytd: boolean | null;
};

type AgenteRow = {
  nemo: string;
  descripcion: string | null;
  tipo_agente: string | null;
  agrupacion: string | null;
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

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeNemo(value: string | null): string {
  return (value ?? "").trim().toUpperCase().slice(0, 8);
}

function parsePeriodo(value: string | null): { anio: number; mes: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

function periodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function gwh(mwh: string | number | null): number | null {
  const value = toNumber(mwh);
  return value === null ? null : value / 1000;
}

function mixFrom(row: ClienteMesRow | null) {
  const demanda = toNumber(row?.demanda_real_mwh ?? null);
  const mater = toNumber(row?.demanda_contratada_mwh ?? null);
  const spot = toNumber(row?.compra_spot_mwh ?? null);
  return {
    materEstimadoPct: demanda && demanda > 0 && mater !== null ? mater / demanda : null,
    spotPct: demanda && demanda > 0 && spot !== null ? spot / demanda : null,
    plusPct: null,
  };
}

function universoBucket(row: UniversoRow | undefined, disponible = true) {
  return {
    disponible,
    demandaTotalGwh: row ? gwh(row.demanda_total_mwh) : null,
    agentesCount: row ? toNumber(row.agentes_count) : null,
    mix: {
      materEstimadoPct: row ? toNumber(row.mater_estimado_pct) : null,
      spotPct: row ? toNumber(row.spot_pct) : null,
      plusPct: null,
    },
    plusDisponible: row?.plus_disponible ?? false,
  };
}

function mercadoFrom(row: MercadoRow | undefined) {
  if (!row) return null;
  return {
    fuente: row.fuente,
    periodoCompleto: row.periodo_completo,
    fuenteDesde: toIso(row.fuente_desde),
    fuenteHasta: toIso(row.fuente_hasta),
    generacionPorTipo: [
      { tipo: "termico", pct: toNumber(row.termico_pct), gwh: toNumber(row.termico_gwh) },
      { tipo: "renovable_hidro_50mw", pct: toNumber(row.renovable_hidro_50mw_pct), gwh: toNumber(row.renovable_hidro_50mw_gwh) },
      { tipo: "renovable_ley_26190", pct: toNumber(row.renovable_ley_26190_pct), gwh: toNumber(row.renovable_ley_26190_gwh) },
      { tipo: "nuclear", pct: toNumber(row.nuclear_pct), gwh: toNumber(row.nuclear_gwh) },
      { tipo: "importacion", pct: toNumber(row.importacion_pct), gwh: toNumber(row.importacion_gwh) },
    ],
    generacionTotalGwh: toNumber(row.generacion_total_gwh),
    generacionTotalMomPct: toNumber(row.generacion_total_mom_pct),
    generacionTotalYoyPct: toNumber(row.generacion_total_yoy_pct),
    generacionMaterGwh: toNumber(row.generacion_mater_gwh),
    generacionMaterMomPct: toNumber(row.generacion_mater_mom_pct),
    generacionMaterYoyPct: toNumber(row.generacion_mater_yoy_pct),
    pctRenovableSistema: toNumber(row.renovable_ley_26190_pct),
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
  const nemo = requestedNemo || autorizados[0];
  if (!autorizados.includes(nemo)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

  const sql = postgres(railwayDatabaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    // Railway public proxy currently fails strict TLS validation from Deno.
    ssl: false,
  });

  try {
    const requestedPeriodo = parsePeriodo(url.searchParams.get("mes"));
    const latestRows = requestedPeriodo
      ? [requestedPeriodo]
      : await sql<{ anio: number; mes: number }[]>`
          select anio, mes
          from public.vw_consumo_gu_mensual
          order by anio desc, mes desc
          limit 1
        `;
    const selected = latestRows[0];
    if (!selected) return json({ error: "No hay período disponible" }, 404);

    const [universoRows, mercadoRows, clienteRows, serieRows, complianceRows, agenteRows] = await Promise.all([
      sql<UniversoRow[]>`
        select *
        from public.vw_universo_demanda_mensual
        where anio = ${selected.anio} and mes = ${selected.mes}
      `,
      sql<MercadoRow[]>`
        select *
        from public.vw_mercado_resumen_mensual
        order by anio desc, mes desc
        limit 1
      `,
      sql<ClienteMesRow[]>`
        select tipo_agente, nemo, demanda_real_mwh, demanda_contratada_mwh, compra_spot_mwh,
               demanda_real_pico_mwh, demanda_real_valle_mwh, demanda_real_resto_mwh
        from public.vw_consumo_gu_mensual
        where nemo = ${nemo}
          and anio = ${selected.anio}
          and mes = ${selected.mes}
        limit 1
      `,
      sql<ClienteSerieRow[]>`
        select anio, mes, demanda_real_mwh, demanda_contratada_mwh, compra_spot_mwh
        from public.vw_consumo_gu_mensual
        where nemo = ${nemo}
          and (anio * 100 + mes) <= ${selected.anio * 100 + selected.mes}
        order by anio desc, mes desc
        limit 12
      `,
      sql<ComplianceRow[]>`
        select pct_renovable_ytd, cumple_ytd
        from public.vw_compliance_27191_mensual
        where nemo = ${nemo}
          and anio = ${selected.anio}
          and mes = ${selected.mes}
        limit 1
      `,
      sql<AgenteRow[]>`
        select nemo, descripcion, tipo_agente, agrupacion
        from public.cammesa_agentes_mem
        where nemo = ${nemo}
        limit 1
      `,
    ]);

    const byType = new Map(universoRows.map((row) => [row.tipo_agente, row]));
    const cliente = clienteRows[0] ?? null;
    const compliance = complianceRows[0] ?? null;
    const agente = agenteRows[0] ?? null;
    const serieAsc = serieRows.reverse();
    const total12mMwh = serieAsc.reduce((sum, row) => sum + (toNumber(row.demanda_real_mwh) ?? 0), 0);
    const mater12mMwh = serieAsc.reduce((sum, row) => sum + (toNumber(row.demanda_contratada_mwh) ?? 0), 0);
    const spot12mMwh = serieAsc.reduce((sum, row) => sum + (toNumber(row.compra_spot_mwh) ?? 0), 0);

    return json({
      contexto: {
        anio: selected.anio,
        mes: selected.mes,
        periodo: periodo(selected.anio, selected.mes),
        ultimoMesDisponible: periodo(selected.anio, selected.mes),
        warnings: [
          "Mercado MEM mensual usa MEMnet intradiario extrapolado porque aún no hay generación mensual histórica parseada.",
          "PLUS no disponible hasta parsear contratos PLUS.",
          "Mix MAT usa demanda_contratada_mwh como estimación de cobertura contractual.",
        ],
      },
      mercado: mercadoFrom(mercadoRows[0]),
      universo: {
        guma: universoBucket(byType.get("GUMA")),
        gume: universoBucket(byType.get("GUME")),
        gudi: universoBucket(byType.get("GUDI")),
      },
      cliente: {
        disponible: Boolean(cliente),
        razonNoDisponible: cliente ? null : `Sin datos para ${nemo} en ${periodo(selected.anio, selected.mes)}`,
        nemo,
        descripcion: agente?.descripcion ?? null,
        tipoAgente: agente?.tipo_agente ?? cliente?.tipo_agente ?? null,
        agrupacion: agente?.agrupacion ?? null,
        demandaAnioMovil: serieAsc.map((row) => ({
          anioMes: periodo(row.anio, row.mes),
          mwh: toNumber(row.demanda_real_mwh),
        })),
        demandaMes: cliente
          ? {
              totalGwh: gwh(cliente.demanda_real_mwh),
              energiaBandaPicoMwh: toNumber(cliente.demanda_real_pico_mwh),
              energiaBandaValleMwh: toNumber(cliente.demanda_real_valle_mwh),
              energiaBandaRestoMwh: toNumber(cliente.demanda_real_resto_mwh),
              mix: mixFrom(cliente),
              plusDisponible: false,
            }
          : null,
        demandaAnioMovilTotal: {
          totalGwh: total12mMwh / 1000,
          mix: {
            materEstimadoPct: total12mMwh > 0 ? mater12mMwh / total12mMwh : null,
            spotPct: total12mMwh > 0 ? spot12mMwh / total12mMwh : null,
            plusPct: null,
          },
          plusDisponible: false,
        },
        pctRenovableAnio: toNumber(compliance?.pct_renovable_ytd ?? null),
        cumple27191: compliance?.cumple_ytd ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
