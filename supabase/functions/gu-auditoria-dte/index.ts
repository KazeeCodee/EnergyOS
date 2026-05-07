import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type AuditoriaRow = {
  anio: number;
  mes: number;
  tipo_agente: string | null;
  nemo: string;
  factura_total_pesos: string | null;
  subtotal_conceptos_pesos: string | null;
  desvio_reconciliacion_pesos: string | null;
  desvio_reconciliacion_pct: string | null;
  variacion_mom_pct: string | null;
  variacion_yoy_pct: string | null;
  demanda_real_mwh: string | null;
  costo_dte_pesos_mwh: string | null;
  energia_pesos: string | null;
  potencia_pesos: string | null;
  transporte_pesos: string | null;
  obras_servicios_pesos: string | null;
  ajustes_operativos_pesos: string | null;
  cargos_aplicados_pesos: string | null;
  conceptos_count: string | number | null;
  importe_revisable_pesos: string | null;
  estado_auditoria: string;
  source_row_desde: number | null;
  source_row_hasta: number | null;
};

type ConceptoRow = {
  bloque_codigo: string;
  bloque_nombre: string;
  concepto_codigo: string;
  concepto_nombre: string;
  importe_pesos: string | null;
  source_file: string | null;
  source_row_desde: number | null;
  source_row_hasta: number | null;
  source_rows_count: number;
};

type SeriePoint = {
  periodo: string;
  anio: number;
  mes: number;
  tipoAgente: string | null;
  nemo: string;
  facturaTotalPesos: number | null;
  subtotalConceptosPesos: number | null;
  desvioReconciliacionPesos: number | null;
  desvioReconciliacionPct: number | null;
  variacionMomPct: number | null;
  variacionYoyPct: number | null;
  demandaRealMwh: number | null;
  costoDtePesosMwh: number | null;
  energiaPesos: number | null;
  potenciaPesos: number | null;
  transportePesos: number | null;
  obrasServiciosPesos: number | null;
  ajustesOperativosPesos: number | null;
  cargosAplicadosPesos: number | null;
  conceptosCount: number;
  importeRevisablePesos: number | null;
  estadoAuditoria: string;
  sourceRowDesde: number | null;
  sourceRowHasta: number | null;
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

function mapRow(row: AuditoriaRow): SeriePoint {
  const month = String(row.mes).padStart(2, "0");
  return {
    periodo: `${row.anio}-${month}`,
    anio: row.anio,
    mes: row.mes,
    tipoAgente: row.tipo_agente,
    nemo: row.nemo,
    facturaTotalPesos: toNumber(row.factura_total_pesos),
    subtotalConceptosPesos: toNumber(row.subtotal_conceptos_pesos),
    desvioReconciliacionPesos: toNumber(row.desvio_reconciliacion_pesos),
    desvioReconciliacionPct: toNumber(row.desvio_reconciliacion_pct),
    variacionMomPct: toNumber(row.variacion_mom_pct),
    variacionYoyPct: toNumber(row.variacion_yoy_pct),
    demandaRealMwh: toNumber(row.demanda_real_mwh),
    costoDtePesosMwh: toNumber(row.costo_dte_pesos_mwh),
    energiaPesos: toNumber(row.energia_pesos),
    potenciaPesos: toNumber(row.potencia_pesos),
    transportePesos: toNumber(row.transporte_pesos),
    obrasServiciosPesos: toNumber(row.obras_servicios_pesos),
    ajustesOperativosPesos: toNumber(row.ajustes_operativos_pesos),
    cargosAplicadosPesos: toNumber(row.cargos_aplicados_pesos),
    conceptosCount: toNumber(row.conceptos_count) ?? 0,
    importeRevisablePesos: toNumber(row.importe_revisable_pesos),
    estadoAuditoria: row.estado_auditoria,
    sourceRowDesde: row.source_row_desde,
    sourceRowHasta: row.source_row_hasta,
  };
}

function buildResumen(serie: SeriePoint[]) {
  const ultimoMes = serie.at(-1) ?? null;
  const facturaTotal = serie.reduce((sum, row) => sum + (row.facturaTotalPesos ?? 0), 0);
  const importeRevisable = serie.reduce((sum, row) => sum + (row.importeRevisablePesos ?? 0), 0);
  const mesesConRevision = serie.filter((row) => row.estadoAuditoria !== "ok").length;
  const demanda = serie.reduce((sum, row) => sum + (row.demandaRealMwh ?? 0), 0);

  return {
    meses: serie.length,
    ultimoMes,
    facturaTotalPesos: facturaTotal,
    importeRevisablePesos: importeRevisable,
    mesesConRevision,
    costoPromedioPesosMwh: demanda > 0 ? facturaTotal / demanda : null,
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
    const rows = await sql<AuditoriaRow[]>`
      select
        anio, mes, tipo_agente, nemo,
        factura_total_pesos, subtotal_conceptos_pesos,
        desvio_reconciliacion_pesos, desvio_reconciliacion_pct,
        variacion_mom_pct, variacion_yoy_pct,
        demanda_real_mwh, costo_dte_pesos_mwh,
        energia_pesos, potencia_pesos, transporte_pesos,
        obras_servicios_pesos, ajustes_operativos_pesos, cargos_aplicados_pesos,
        conceptos_count, importe_revisable_pesos, estado_auditoria,
        source_row_desde, source_row_hasta
      from public.vw_factura_dte_resumen_mensual
      where nemo = ${nemo}
      order by anio desc, mes desc
      limit ${meses}
    `;
    const serie = rows.map(mapRow).reverse();
    const ultimo = serie.at(-1);
    const conceptos = ultimo
      ? await sql<ConceptoRow[]>`
          select
            bloque_codigo, bloque_nombre, concepto_codigo, concepto_nombre,
            importe_pesos, source_file, source_row_desde, source_row_hasta, source_rows_count
          from public.factura_dte_conceptos_mensual
          where nemo = ${nemo}
            and anio = ${ultimo.anio}
            and mes = ${ultimo.mes}
          order by case when bloque_codigo = 'FACTURA_TOTAL' then 99 else 1 end, abs(importe_pesos) desc
        `
      : [];

    return json({
      nemo,
      meses,
      autorizados,
      resumen: buildResumen(serie),
      serie,
      conceptosUltimoMes: conceptos.map((row) => ({
        bloqueCodigo: row.bloque_codigo,
        bloqueNombre: row.bloque_nombre,
        conceptoCodigo: row.concepto_codigo,
        conceptoNombre: row.concepto_nombre,
        importePesos: toNumber(row.importe_pesos),
        sourceFile: row.source_file,
        sourceRowDesde: row.source_row_desde,
        sourceRowHasta: row.source_row_hasta,
        sourceRowsCount: row.source_rows_count,
      })),
      notas: {
        alcance: "Auditoria sobre liquidacion CAMMESA/DTE publicada. No incluye factura final privada de distribuidor, comercializador ni contratos privados no cargados.",
        estado: "Los estados senalan reconciliacion y variaciones para revisar; no implican por si solos un reclamo automatico.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
