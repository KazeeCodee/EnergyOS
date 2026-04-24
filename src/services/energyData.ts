import type {
  AdminRawData,
  ComplianceRow,
  ContratosData,
  CostosData,
  EmpresaData,
  MercadoData,
} from "../types";
import { assertSupabaseConfig, supabase } from "../lib/supabase";

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
  return `${monthLabels[mes - 1] ?? mes} ${anio}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getDate()} ${monthLabels[date.getMonth()]} ${date.getFullYear()}`;
}

function scoreContrato(precioContrato: number, precioMercado: number) {
  const diferenciaPct = precioMercado ? ((precioContrato - precioMercado) / precioMercado) * 100 : 0;
  if (diferenciaPct <= -5) return "optimo";
  if (diferenciaPct <= 5) return "en_rango";
  if (diferenciaPct <= 15) return "caro";
  return "muy_caro";
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
  return {
    id: empresa.id,
    razon_social: empresa.razon_social,
    nemo: nemos.join(", "),
    tipo_usuario: empresa.tipo_usuario,
    comercializador: empresa.comercializador ?? "",
    plan_activo: empresa.plan_activo,
    miembro_desde: monthLabel(new Date(empresa.created_at).getFullYear(), new Date(empresa.created_at).getMonth() + 1),
    acuerdo_mensual_mwh: num(empresa.acuerdo_mensual_mwh),
  };
}

export async function getComplianceData(empresaId?: string | null): Promise<ComplianceRow[]> {
  const empresa = await getEmpresaRow(empresaId);
  const rows = await getDatosMensuales(empresa.id);
  const acuerdoMes = num(empresa.acuerdo_mensual_mwh);
  return rows.map((row) => {
    const porcentajeRenovable = num(row.porcentaje_renovable);
    return {
      mes: monthLabel(row.anio, row.mes),
      demanda_mwh: Math.round(num(row.demanda_total_mwh)),
      mater_mwh: Math.round(num(row.mater_mwh)),
      spot_mwh: Math.round(num(row.spot_mwh)),
      porcentaje_renovable: Number(porcentajeRenovable.toFixed(2)),
      acuerdo_mes_mwh: acuerdoMes,
      cumple: porcentajeRenovable >= 20,
      alerta: porcentajeRenovable < 20,
    };
  });
}

export async function getMercadoData(empresaId?: string | null): Promise<MercadoData> {
  const empresa = await getEmpresaRow(empresaId);
  const [mercado, mensual] = await Promise.all([getLatestMercado(), getDatosMensuales(empresa.id)]);
  const latest = mensual[mensual.length - 1];
  const demandaTotal = num(latest?.demanda_total_mwh);
  const materPct = demandaTotal ? (num(latest?.mater_mwh) / demandaTotal) * 100 : 0;
  const spotPct = demandaTotal ? (num(latest?.spot_mwh) / demandaTotal) * 100 : 0;

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

export async function getContratosData(empresaId?: string | null): Promise<ContratosData> {
  const empresa = await getEmpresaRow(empresaId);
  const [mercado, contratosResponse] = await Promise.all([
    getLatestMercado(),
    supabase
      .from("contratos")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("activo", true)
      .order("vigencia_fin", { ascending: true }),
  ]);
  if (contratosResponse.error) throw contratosResponse.error;

  const precioMercado = num(mercado?.costo_renovable_usd_mwh);
  const contratos = (contratosResponse.data ?? []) as DbContrato[];
  return {
    precio_mercado_referencia: precioMercado,
    contratos: contratos.map((contract) => {
      const precio = num(contract.precio_usd_mwh);
      return {
        id: contract.numero_contrato,
        tipo: contract.tipo,
        generador: contract.generador_nombre,
        precio_usd_mwh: precio,
        score: scoreContrato(precio, precioMercado),
        vigencia: formatDate(contract.vigencia_fin),
        energia_anual_mwh: Math.round(num(contract.volumen_mwh_mes) * 12),
      };
    }),
  };
}

function projectCosts(rows: CostosData["serie"]) {
  const historical = rows.filter((row) => row.tipo === "historico");
  const last = historical[historical.length - 1];
  if (!last) return [];

  const byMonth = new Map<number, CostosData["serie"][number][]>();
  historical.forEach((row) => {
    const monthIndex = monthLabels.findIndex((label) => row.mes.startsWith(label));
    const current = byMonth.get(monthIndex) ?? [];
    byMonth.set(monthIndex, [...current, row]);
  });
  const avgCost = historical.reduce((sum, row) => sum + row.costo_usd_mwh, 0) / historical.length;
  const [lastLabel, lastYear] = last.mes.split(" ");
  let monthIndex = monthLabels.indexOf(lastLabel);
  let year = Number(lastYear);

  return Array.from({ length: 12 }, () => {
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
    const similarMonths = byMonth.get(monthIndex) ?? [];
    const seasonalCost = similarMonths.length
      ? similarMonths.reduce((sum, row) => sum + row.costo_usd_mwh, 0) / similarMonths.length
      : avgCost;
    const seasonalDemand = similarMonths.length
      ? similarMonths.reduce((sum, row) => sum + row.demanda_mwh, 0) / similarMonths.length
      : last.demanda_mwh;
    const factor = avgCost ? seasonalCost / avgCost : 1;
    const costoUsdMwh = last.costo_usd_mwh * factor;
    return {
      mes: `${monthLabels[monthIndex]} ${year}`,
      tipo: "proyeccion" as const,
      costo_usd_mwh: Number(costoUsdMwh.toFixed(2)),
      demanda_mwh: Math.round(seasonalDemand),
      total_usd: Math.round(costoUsdMwh * seasonalDemand),
      es_pico: monthIndex === 6 || monthIndex === 7,
    };
  });
}

export async function getCostosData(empresaId?: string | null): Promise<CostosData> {
  const empresa = await getEmpresaRow(empresaId);
  const rows = await getDatosMensuales(empresa.id);
  const serie = rows.map((row) => {
    const demanda = num(row.demanda_total_mwh);
    const total = num(row.costo_total_estimado_usd);
    return {
      mes: monthLabel(row.anio, row.mes),
      tipo: "historico" as const,
      costo_usd_mwh: demanda ? Number((total / demanda).toFixed(2)) : 0,
      demanda_mwh: Math.round(demanda),
      total_usd: Math.round(total),
      es_pico: row.mes === 7 || row.mes === 8,
    };
  });
  const latest = rows[rows.length - 1];
  const energiaMater = num(latest?.mater_mwh) * num(latest?.costo_renovable_usd_mwh);
  const spot = num(latest?.spot_mwh) * num(latest?.costo_spot_usd_mwh);
  const total = num(latest?.costo_total_estimado_usd);
  const potencia = total * 0.07;
  const transporte = total * 0.035;
  const cargos = Math.max(0, total - energiaMater - spot - potencia - transporte);

  return {
    serie: [...serie, ...projectCosts(serie)],
    desglose_oct_2025: [
      { concepto: "Energia MATER", valor_usd: Math.round(energiaMater) },
      { concepto: "SPOT", valor_usd: Math.round(spot) },
      { concepto: "Potencia", valor_usd: Math.round(potencia) },
      { concepto: "Transporte", valor_usd: Math.round(transporte) },
      { concepto: "Cargos", valor_usd: Math.round(cargos) },
    ],
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
