import type {
  AdminRawData,
  ComplianceRow,
  ContratosData,
  CostosData,
  EmpresaData,
  MercadoData,
} from "../types";
import { assertSupabaseConfig, supabase } from "../lib/supabase";

const PEAK_MONTHS = new Set([7, 8]);
function isPeakMonth(monthNumber: number) {
  return PEAK_MONTHS.has(monthNumber);
}

function median(values: number[]) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

type DbEmpresa = {
  id: string;
  razon_social: string;
  tipo_usuario: EmpresaData["tipo_usuario"];
  comercializador: string | null;
  plan_activo: EmpresaData["plan_activo"];
  acuerdo_mensual_mwh: number | string;
  created_at: string;
};

type DbDatoMensual = {
  anio: number;
  mes: number;
  demanda_total_mwh: number | string;
  mater_mwh: number | string;
  spot_mwh: number | string;
  porcentaje_renovable: number | string;
  costo_renovable_usd_mwh: number | string;
  costo_spot_usd_mwh: number | string;
  costo_total_estimado_usd: number | string;
  importe_mater_pesos?: number | string | null;
  precio_efectivo_pesos_mwh?: number | string | null;
  cargo_transporte_pesos_mwh?: number | string | null;
  precio_spot_pesos_mwh?: number | string | null;
  dato_sospechoso?: boolean | null;
  sospechoso_motivo?: string | null;
};

type DbMercado = {
  anio: number;
  mes: number;
  mix_termica_pct: number | string;
  mix_hidraulica_pct: number | string;
  mix_nuclear_pct: number | string;
  mix_renovable_pct: number | string;
  costo_renovable_usd_mwh: number | string;
  precio_spot_usd_mwh: number | string;
  precio_spot_pico_pesos_mwh?: number | string | null;
  precio_spot_valle_pesos_mwh?: number | string | null;
  precio_spot_resto_pesos_mwh?: number | string | null;
  cargo_transporte_pesos_mwh?: number | string | null;
};

type DbContrato = {
  numero_contrato: string;
  tipo: "RPB" | "RPE" | "BAS";
  generador_nombre: string;
  precio_usd_mwh: number | string;
  volumen_mwh_mes: number | string;
  vigencia_fin: string;
};

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function num(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(anio: number, mes: number) {
  const valid = Number.isInteger(mes) && mes >= 1 && mes <= 12;
  const label = valid ? monthLabels[mes - 1] : `M${mes}`;
  return `${label} ${anio}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = get("day");
  const monthIdx = Number(get("month")) - 1;
  const year = get("year");
  return `${day} ${monthLabels[monthIdx] ?? get("month")} ${year}`;
}

function scoreContrato(precioContrato: number, precioReferencia: number) {
  if (!precioReferencia || !Number.isFinite(precioReferencia)) return "sin_referencia";
  const diferenciaPct = ((precioContrato - precioReferencia) / precioReferencia) * 100;
  if (diferenciaPct <= -5) return "optimo";
  if (diferenciaPct <= 5) return "en_rango";
  if (diferenciaPct <= 15) return "caro";
  return "muy_caro";
}

async function getMarketBenchmarkByTipo(
  excludeEmpresaId?: string,
): Promise<{ RPB: number; RPE: number; BAS: number }> {
  let query = supabase.from("contratos").select("tipo, precio_usd_mwh, empresa_id").eq("activo", true);
  if (excludeEmpresaId) query = query.neq("empresa_id", excludeEmpresaId);
  const { data, error } = await query;
  if (error) throw error;
  const buckets: Record<"RPB" | "RPE" | "BAS", number[]> = { RPB: [], RPE: [], BAS: [] };
  (data ?? []).forEach((row) => {
    const tipo = row.tipo as "RPB" | "RPE" | "BAS";
    if (!buckets[tipo]) return;
    const precio = num(row.precio_usd_mwh);
    if (precio > 0) buckets[tipo].push(precio);
  });
  return {
    RPB: buckets.RPB.length >= 3 ? median(buckets.RPB) : 0,
    RPE: buckets.RPE.length >= 3 ? median(buckets.RPE) : 0,
    BAS: buckets.BAS.length >= 3 ? median(buckets.BAS) : 0,
  };
}

async function getEmpresaRow(empresaId?: string | null) {
  assertSupabaseConfig();
  let query = supabase.from("empresas").select("*");
  query = empresaId ? query.eq("id", empresaId) : query.order("created_at", { ascending: true }).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  const empresa = data?.[0] as DbEmpresa | undefined;
  if (!empresa) {
    throw new Error(
      empresaId
        ? "No encontramos la empresa seleccionada."
        : "No hay una empresa asociada al usuario autenticado.",
    );
  }
  return empresa;
}

async function getNemos(empresaId: string) {
  const { data, error } = await supabase
    .from("nemos")
    .select("nemo")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .order("nemo");
  if (error) throw error;
  return (data ?? []).map((row) => String(row.nemo));
}

async function getDatosMensuales(empresaId: string) {
  const { data, error } = await supabase
    .from("datos_mensuales")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("anio", { ascending: true })
    .order("mes", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DbDatoMensual[];
}

async function getDatoMensual(empresaId: string, anio: number, mes: number) {
  const { data, error } = await supabase
    .from("datos_mensuales")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();
  if (error) throw error;
  return (data as DbDatoMensual | null) ?? null;
}

async function getLatestMercado() {
  const { data, error } = await supabase
    .from("datos_mercado")
    .select("*")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] as DbMercado | undefined;
}

async function getMercadoByPeriod(anio: number, mes: number) {
  const { data, error } = await supabase
    .from("datos_mercado")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .maybeSingle();
  if (error) throw error;
  return (data as DbMercado | null) ?? null;
}

export async function getEmpresaData(empresaId?: string | null): Promise<EmpresaData> {
  const empresa = await getEmpresaRow(empresaId);
  const nemos = await getNemos(empresa.id);
  const acuerdoRaw = empresa.acuerdo_mensual_mwh;
  const acuerdo = acuerdoRaw === null || acuerdoRaw === undefined ? null : num(acuerdoRaw);
  return {
    id: empresa.id,
    razon_social: empresa.razon_social,
    nemo: nemos.join(", "),
    tipo_usuario: empresa.tipo_usuario,
    comercializador: empresa.comercializador ?? "",
    plan_activo: empresa.plan_activo,
    miembro_desde: monthLabel(new Date(empresa.created_at).getFullYear(), new Date(empresa.created_at).getMonth() + 1),
    acuerdo_mensual_mwh: acuerdo,
  };
}

export async function getComplianceData(empresaId?: string | null): Promise<ComplianceRow[]> {
  const empresa = await getEmpresaRow(empresaId);
  const rows = await getDatosMensuales(empresa.id);
  const acuerdoMes = empresa.acuerdo_mensual_mwh === null || empresa.acuerdo_mensual_mwh === undefined
    ? 0
    : num(empresa.acuerdo_mensual_mwh);
  return rows.map((row) => {
    const porcentajeRenovable = num(row.porcentaje_renovable);
    return {
      mes: monthLabel(row.anio, row.mes),
      anio: row.anio,
      mes_numero: row.mes,
      demanda_mwh: num(row.demanda_total_mwh),
      mater_mwh: num(row.mater_mwh),
      spot_mwh: num(row.spot_mwh),
      porcentaje_renovable: Number(porcentajeRenovable.toFixed(2)),
      acuerdo_mes_mwh: acuerdoMes,
      cumple: porcentajeRenovable >= 20,
      alerta: porcentajeRenovable < 20,
      dato_sospechoso: Boolean(row.dato_sospechoso),
      sospechoso_motivo: row.sospechoso_motivo ?? null,
    };
  });
}

export async function getMercadoData(
  empresaId?: string | null,
  anio?: number,
  mes?: number,
): Promise<MercadoData> {
  const empresa = await getEmpresaRow(empresaId);
  const mercadoPromise =
    anio !== undefined && mes !== undefined
      ? getMercadoByPeriod(anio, mes).then((row) => row ?? null)
      : getLatestMercado().then((row) => row ?? null);
  const [mercado, mensual] = await Promise.all([mercadoPromise, getDatosMensuales(empresa.id)]);
  const cleanMensual = mensual.filter((row) => !row.dato_sospechoso);
  const target =
    anio !== undefined && mes !== undefined
      ? cleanMensual.find((row) => row.anio === anio && row.mes === mes) ?? null
      : cleanMensual[cleanMensual.length - 1] ?? null;
  const demandaTotal = num(target?.demanda_total_mwh);
  const materPct = demandaTotal ? (num(target?.mater_mwh) / demandaTotal) * 100 : 0;
  const spotPct = demandaTotal ? (num(target?.spot_mwh) / demandaTotal) * 100 : 0;

  return {
    mem_mix: [
      { name: "Termica", value: Math.round(num(mercado?.mix_termica_pct)) },
      { name: "Hidraulica", value: Math.round(num(mercado?.mix_hidraulica_pct)) },
      { name: "Renovable", value: Math.round(num(mercado?.mix_renovable_pct)) },
      { name: "Nuclear", value: Math.round(num(mercado?.mix_nuclear_pct)) },
    ],
    mater_spot: [
      { name: "MATER", value: Math.round(materPct) },
      { name: "SPOT", value: Math.round(spotPct) },
    ],
  };
}

export async function getContratosData(
  empresaId?: string | null,
  anio?: number,
  mes?: number,
): Promise<ContratosData> {
  const empresa = await getEmpresaRow(empresaId);
  const mercadoPromise =
    anio !== undefined && mes !== undefined
      ? getMercadoByPeriod(anio, mes).then((row) => row ?? null)
      : getLatestMercado().then((row) => row ?? null);
  const today = new Date().toISOString().slice(0, 10);
  const [mercado, contratosResponse, benchmarkTipo] = await Promise.all([
    mercadoPromise,
    supabase
      .from("contratos")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("activo", true)
      .gte("vigencia_fin", today)
      .order("vigencia_fin", { ascending: true }),
    getMarketBenchmarkByTipo(empresa.id),
  ]);
  if (contratosResponse.error) throw contratosResponse.error;

  const precioMercado = num(mercado?.costo_renovable_usd_mwh);
  const contratos = (contratosResponse.data ?? []) as DbContrato[];
  return {
    precio_mercado_referencia: precioMercado,
    precio_mercado_por_tipo: benchmarkTipo,
    contratos: contratos.map((contract) => {
      const precio = num(contract.precio_usd_mwh);
      const refTipo = benchmarkTipo[contract.tipo] || precioMercado;
      return {
        id: contract.numero_contrato,
        tipo: contract.tipo,
        generador: contract.generador_nombre,
        precio_usd_mwh: precio,
        score: scoreContrato(precio, refTipo),
        vigencia: formatDate(contract.vigencia_fin),
        energia_anual_mwh: Math.round(num(contract.volumen_mwh_mes) * 12),
      };
    }),
  };
}

function projectCosts(rows: CostosData["serie"]) {
  const historical = rows.filter((row) => row.tipo === "historico");
  const last = historical[historical.length - 1];
  if (!last || historical.length < 6) return [];

  const byMonth = new Map<number, CostosData["serie"][number][]>();
  historical.forEach((row) => {
    const current = byMonth.get(row.mes_numero) ?? [];
    byMonth.set(row.mes_numero, [...current, row]);
  });
  const medianCost = median(historical.map((row) => row.costo_usd_mwh));
  const medianDemand = median(historical.map((row) => row.demanda_mwh));
  let monthNumber = last.mes_numero;
  let year = last.anio;

  return Array.from({ length: 12 }, () => {
    monthNumber += 1;
    if (monthNumber > 12) {
      monthNumber = 1;
      year += 1;
    }
    const similarMonths = byMonth.get(monthNumber) ?? [];
    const seasonalCost = similarMonths.length
      ? median(similarMonths.map((row) => row.costo_usd_mwh))
      : medianCost;
    const seasonalDemand = similarMonths.length
      ? median(similarMonths.map((row) => row.demanda_mwh))
      : medianDemand;
    return {
      mes: `${monthLabels[monthNumber - 1]} ${year}`,
      anio: year,
      mes_numero: monthNumber,
      tipo: "proyeccion" as const,
      costo_usd_mwh: Number(seasonalCost.toFixed(2)),
      demanda_mwh: Math.round(seasonalDemand),
      total_usd: Math.round(seasonalCost * seasonalDemand),
      es_pico: isPeakMonth(monthNumber),
    };
  });
}

export async function getCostosData(
  empresaId?: string | null,
  anio?: number,
  mes?: number,
): Promise<CostosData> {
  const empresa = await getEmpresaRow(empresaId);
  const rows = await getDatosMensuales(empresa.id);
  const cleanRows = rows.filter((row) => !row.dato_sospechoso);
  const serie = cleanRows
    .filter((row) => num(row.costo_total_estimado_usd) > 0 && num(row.demanda_total_mwh) > 0)
    .map((row) => {
      const demanda = num(row.demanda_total_mwh);
      const total = num(row.costo_total_estimado_usd);
      return {
        mes: monthLabel(row.anio, row.mes),
        anio: row.anio,
        mes_numero: row.mes,
        tipo: "historico" as const,
        costo_usd_mwh: Number((total / demanda).toFixed(2)),
        demanda_mwh: demanda,
        total_usd: total,
        es_pico: isPeakMonth(row.mes),
      };
    });

  const targetRow =
    anio !== undefined && mes !== undefined
      ? rows.find((row) => row.anio === anio && row.mes === mes) ?? null
      : rows[rows.length - 1] ?? null;

  const targetSospechoso = Boolean(targetRow?.dato_sospechoso);
  const desglosePeriodo = targetRow ? { anio: targetRow.anio, mes: targetRow.mes } : null;

  const mercado = desglosePeriodo
    ? await getMercadoByPeriod(desglosePeriodo.anio, desglosePeriodo.mes)
    : null;

  const energiaMater = num(targetRow?.mater_mwh) * num(targetRow?.costo_renovable_usd_mwh);
  const spotCostoUnit =
    num(targetRow?.costo_spot_usd_mwh) || num(mercado?.precio_spot_usd_mwh);
  const spot = num(targetRow?.spot_mwh) * spotCostoUnit;
  const total = num(targetRow?.costo_total_estimado_usd);
  const demanda = num(targetRow?.demanda_total_mwh);
  const cargoTransporteUnit = num(targetRow?.cargo_transporte_pesos_mwh);
  const transporteReal = cargoTransporteUnit ? cargoTransporteUnit * demanda : 0;
  const transporte = transporteReal || total * 0.035;
  const potencia = total * 0.07;
  const residual = total - energiaMater - spot - transporte - potencia;
  const cargos = Math.max(0, residual);

  const desglose_mes = targetRow
    ? [
        { concepto: "Energia MATER", valor_usd: Math.round(energiaMater), estimado: targetSospechoso },
        {
          concepto: "SPOT",
          valor_usd: Math.round(spot),
          estimado: targetSospechoso || !num(targetRow?.costo_spot_usd_mwh),
        },
        { concepto: "Potencia", valor_usd: Math.round(potencia), estimado: true },
        {
          concepto: "Transporte",
          valor_usd: Math.round(transporte),
          estimado: targetSospechoso || !transporteReal,
        },
        { concepto: "Cargos", valor_usd: Math.round(cargos), estimado: true },
      ]
    : [];

  return {
    serie: [...serie, ...projectCosts(serie)],
    desglose_mes,
    desglose_periodo: desglosePeriodo,
  };
}

export async function getAdminRawData(
  empresaId: string,
  anio: number,
  mes: number,
): Promise<AdminRawData | null> {
  const [mensual, mercado] = await Promise.all([
    getDatoMensual(empresaId, anio, mes),
    getMercadoByPeriod(anio, mes),
  ]);

  if (!mensual && !mercado) return null;

  return {
    anio,
    mes,
    mater_mwh: num(mensual?.mater_mwh),
    demanda_total_mwh: num(mensual?.demanda_total_mwh),
    importe_mater_pesos: num(mensual?.importe_mater_pesos),
    precio_efectivo_pesos_mwh: num(mensual?.precio_efectivo_pesos_mwh),
    precio_spot_pico_pesos_mwh: num(mercado?.precio_spot_pico_pesos_mwh),
    precio_spot_valle_pesos_mwh: num(mercado?.precio_spot_valle_pesos_mwh),
    precio_spot_resto_pesos_mwh: num(mercado?.precio_spot_resto_pesos_mwh),
    cargo_transporte_pesos_mwh: num(
      mensual?.cargo_transporte_pesos_mwh ?? mercado?.cargo_transporte_pesos_mwh,
    ),
  };
}
