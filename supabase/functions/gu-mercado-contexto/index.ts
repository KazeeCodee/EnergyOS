import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DEFAULT_SECTIONS = ["demanda", "generacion", "manufacturero"] as const;
type Section = (typeof DEFAULT_SECTIONS)[number];
type Fuente = "memnet" | "operaciones";

type DemandaRow = {
  fecha: string | Date;
  prevista: string | null;
  semana_ant: string | null;
  ayer: string | null;
  hoy: string | null;
  tem_prevista: string | null;
  tem_semana_ant: string | null;
  tem_ayer: string | null;
  tem_hoy: string | null;
};

type GeneracionRow = {
  fecha: string | Date;
  nuclear: string | null;
  termico: string | null;
  renovable_hidro_50mw: string | null;
  renovable_ley_26190: string | null;
  importacion: string | null;
  total: string | null;
  nuclear_pct: string | null;
  termico_pct: string | null;
  renovable_hidro_50mw_pct: string | null;
  renovable_ley_26190_pct: string | null;
  importacion_pct: string | null;
};

type ManufactureroRow = {
  periodo: string | Date;
  molienda_cereales_y_oleaginosas: string | null;
  resto_de_alimentos: string | null;
  bebidas: string | null;
  tabaco: string | null;
  textil_indumentaria_y_cuero: string | null;
  madera_papel_y_edicion: string | null;
  refinacion_de_petroleo: string | null;
  quimicos: string | null;
  caucho_y_plastico: string | null;
  minerales_no_metalicos: string | null;
  metales_basicos: string | null;
  metalmecanica: string | null;
  automotriz: string | null;
  resto_de_industria: string | null;
  total_industria: string | null;
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

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPeriod(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDias(value: string | null): number {
  const parsed = Number(value ?? "90");
  if (!Number.isFinite(parsed)) return 90;
  return Math.max(1, Math.min(Math.trunc(parsed), 365));
}

function parseMeses(value: string | null): number {
  const parsed = Number(value ?? "60");
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(Math.trunc(parsed), 157));
}

function parseFuente(value: string | null): Fuente {
  return value === "operaciones" ? "operaciones" : "memnet";
}

function parseSections(value: string | null): Section[] {
  if (!value) return [...DEFAULT_SECTIONS];
  const valid = new Set<string>(DEFAULT_SECTIONS);
  const sections = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is Section => valid.has(item));
  return sections.length > 0 ? sections : [...DEFAULT_SECTIONS];
}

function mapDemanda(row: DemandaRow) {
  return {
    fecha: toIso(row.fecha),
    prevista: toNumber(row.prevista),
    semanaAnt: toNumber(row.semana_ant),
    ayer: toNumber(row.ayer),
    hoy: toNumber(row.hoy),
    temPrevista: toNumber(row.tem_prevista),
    temSemanaAnt: toNumber(row.tem_semana_ant),
    temAyer: toNumber(row.tem_ayer),
    temHoy: toNumber(row.tem_hoy),
  };
}

function mapGeneracion(row: GeneracionRow) {
  return {
    fecha: toIso(row.fecha),
    nuclear: toNumber(row.nuclear),
    termico: toNumber(row.termico),
    renovableHidro50mw: toNumber(row.renovable_hidro_50mw),
    renovableLey26190: toNumber(row.renovable_ley_26190),
    importacion: toNumber(row.importacion),
    total: toNumber(row.total),
    porcentajes: {
      nuclear: toNumber(row.nuclear_pct),
      termico: toNumber(row.termico_pct),
      renovableHidro50mw: toNumber(row.renovable_hidro_50mw_pct),
      renovableLey26190: toNumber(row.renovable_ley_26190_pct),
      importacion: toNumber(row.importacion_pct),
    },
  };
}

function mapManufacturero(row: ManufactureroRow) {
  return {
    periodo: toPeriod(row.periodo),
    moliendaCerealesYOleaginosas: toNumber(row.molienda_cereales_y_oleaginosas),
    restoDeAlimentos: toNumber(row.resto_de_alimentos),
    bebidas: toNumber(row.bebidas),
    tabaco: toNumber(row.tabaco),
    textilIndumentariaYCuero: toNumber(row.textil_indumentaria_y_cuero),
    maderaPapelYEdicion: toNumber(row.madera_papel_y_edicion),
    refinacionDePetroleo: toNumber(row.refinacion_de_petroleo),
    quimicos: toNumber(row.quimicos),
    cauchoYPlastico: toNumber(row.caucho_y_plastico),
    mineralesNoMetalicos: toNumber(row.minerales_no_metalicos),
    metalesBasicos: toNumber(row.metales_basicos),
    metalmecanica: toNumber(row.metalmecanica),
    automotriz: toNumber(row.automotriz),
    restoDeIndustria: toNumber(row.resto_de_industria),
    totalIndustria: toNumber(row.total_industria),
  };
}

function sectorLider(row: ReturnType<typeof mapManufacturero> | undefined) {
  if (!row) return null;
  const sectores = [
    ["moliendaCerealesYOleaginosas", row.moliendaCerealesYOleaginosas],
    ["restoDeAlimentos", row.restoDeAlimentos],
    ["bebidas", row.bebidas],
    ["tabaco", row.tabaco],
    ["textilIndumentariaYCuero", row.textilIndumentariaYCuero],
    ["maderaPapelYEdicion", row.maderaPapelYEdicion],
    ["refinacionDePetroleo", row.refinacionDePetroleo],
    ["quimicos", row.quimicos],
    ["cauchoYPlastico", row.cauchoYPlastico],
    ["mineralesNoMetalicos", row.mineralesNoMetalicos],
    ["metalesBasicos", row.metalesBasicos],
    ["metalmecanica", row.metalmecanica],
    ["automotriz", row.automotriz],
    ["restoDeIndustria", row.restoDeIndustria],
  ] as const;
  return sectores.reduce<{ sector: string; valor: number } | null>((best, [sector, valor]) => {
    if (valor === null) return best;
    if (!best || valor > best.valor) return { sector, valor };
    return best;
  }, null);
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

  const url = new URL(req.url);
  const fuente = parseFuente(url.searchParams.get("fuente"));
  const sections = parseSections(url.searchParams.get("secciones"));
  const dias = parseDias(url.searchParams.get("dias"));
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
    const demandaTable =
      fuente === "memnet"
        ? "public.cammesa_memnet_demanda_temperatura"
        : "public.cammesa_operaciones_demanda_temperatura";
    const generacionTable =
      fuente === "memnet" ? "public.cammesa_memnet_generacion" : "public.cammesa_operaciones_generacion";
    const porcentajesTable =
      fuente === "memnet"
        ? "public.cammesa_memnet_porcentaje_generacion"
        : "public.cammesa_operaciones_porcentaje_generacion";

    let demanda: ReturnType<typeof mapDemanda>[] = [];
    let generacion: ReturnType<typeof mapGeneracion>[] = [];
    let manufacturero: ReturnType<typeof mapManufacturero>[] = [];
    const warnings: string[] = [];

    if (sections.includes("demanda")) {
      const rows = await sql<DemandaRow[]>`
        select fecha, prevista, semana_ant, ayer, hoy, tem_prevista, tem_semana_ant, tem_ayer, tem_hoy
        from ${sql.unsafe(demandaTable)}
        where fecha >= (select max(fecha) - (${dias}::int * interval '1 day') from ${sql.unsafe(demandaTable)})
        order by fecha asc
      `;
      demanda = rows.map(mapDemanda);
      if (demanda.length === 0) warnings.push(`Sin datos de demanda para fuente ${fuente}`);
    }

    if (sections.includes("generacion")) {
      const rows = await sql<GeneracionRow[]>`
        select
          g.fecha,
          g.nuclear, g.termico, g.renovable_hidro_50mw, g.renovable_ley_26190, g.importacion, g.total,
          p.nuclear as nuclear_pct,
          p.termico as termico_pct,
          p.renovable_hidro_50mw as renovable_hidro_50mw_pct,
          p.renovable_ley_26190 as renovable_ley_26190_pct,
          p.importacion as importacion_pct
        from ${sql.unsafe(generacionTable)} g
        left join ${sql.unsafe(porcentajesTable)} p
          on p.fecha = g.fecha
        where g.fecha >= (select max(fecha) - (${dias}::int * interval '1 day') from ${sql.unsafe(generacionTable)})
        order by g.fecha asc
      `;
      generacion = rows.map(mapGeneracion);
      if (generacion.length === 0) warnings.push(`Sin datos de generación para fuente ${fuente}`);
    }

    if (sections.includes("manufacturero")) {
      const rows = await sql<ManufactureroRow[]>`
        select
          periodo,
          molienda_cereales_y_oleaginosas, resto_de_alimentos, bebidas, tabaco,
          textil_indumentaria_y_cuero, madera_papel_y_edicion, refinacion_de_petroleo,
          quimicos, caucho_y_plastico, minerales_no_metalicos, metales_basicos,
          metalmecanica, automotriz, resto_de_industria, total_industria
        from public.cammesa_consumo_manufacturero_desestacionalizado
        order by periodo desc
        limit ${meses}
      `;
      manufacturero = rows.map(mapManufacturero).reverse();
      if (manufacturero.length === 0) warnings.push("Sin datos manufactureros desestacionalizados");
    }

    const latestGeneracion = generacion.at(-1);
    const latestDemanda = demanda.at(-1);
    const latestManufacturero = manufacturero.at(-1);
    const prevManufacturero =
      latestManufacturero && manufacturero.length > 12 ? manufacturero[manufacturero.length - 13] : undefined;
    const tendenciaManufacturera =
      latestManufacturero?.totalIndustria !== null &&
      latestManufacturero?.totalIndustria !== undefined &&
      prevManufacturero?.totalIndustria
        ? (latestManufacturero.totalIndustria - prevManufacturero.totalIndustria) / prevManufacturero.totalIndustria
        : null;

    return json({
      fuente,
      secciones: sections,
      dias,
      meses,
      demanda,
      generacion,
      manufacturero,
      resumen: {
        ultimoDatoDemanda: latestDemanda?.fecha ?? null,
        ultimoDatoGeneracion: latestGeneracion?.fecha ?? null,
        renovableSistemaPctUltimoDato: latestGeneracion?.porcentajes.renovableLey26190 ?? null,
        ultimoPeriodoManufacturero: latestManufacturero?.periodo ?? null,
        sectorIndustrialLider: sectorLider(latestManufacturero),
        tendenciaManufactureraYoyPct: tendenciaManufacturera,
      },
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    return json({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
