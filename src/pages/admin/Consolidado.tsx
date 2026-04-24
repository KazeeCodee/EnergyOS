import { AlertTriangle, CheckCircle2, FileCheck2, LineChart, Navigation, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFrame } from "../../components/charts/ChartFrame";
import { ComplianceGauge } from "../../components/charts/ComplianceGauge";
import { ContractChart } from "../../components/charts/ContractChart";
import { CostChart } from "../../components/charts/CostChart";
import { tooltipStyle } from "../../components/charts/RechartsBase";
import { Badge } from "../../components/ui/Badge";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";
import { StatCard } from "../../components/ui/StatCard";
import { useAdminContext } from "../../context/AdminContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  getAdminRawData,
  getComplianceData,
  getContratosData,
  getCostosData,
  getEmpresaData,
} from "../../services/energyData";
import type {
  AdminRawData,
  ComplianceRow,
  ContratosData,
  CostosData,
  EmpresaData,
} from "../../types";
import { number, percent, usd } from "../../utils/format";

const MULTA_USD_MWH_FALTANTE = 125;
const MIGRATION_SETUP_USD = 3000;
const POTENCIA_FACTOR = 0.1;
const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const emptyEmpresa: EmpresaData = {
  id: "",
  razon_social: "",
  nemo: "",
  tipo_usuario: "GUME",
  comercializador: "",
  plan_activo: "compliance",
  miembro_desde: "",
  acuerdo_mensual_mwh: null,
};
const emptyContratos: ContratosData = {
  precio_mercado_referencia: 0,
  precio_mercado_por_tipo: { RPB: 0, RPE: 0, BAS: 0 },
  contratos: [],
};
const emptyCostos: CostosData = { serie: [], desglose_mes: [], desglose_periodo: null };
const initialData = {
  empresa: emptyEmpresa,
  compliance: [] as ComplianceRow[],
  contratos: emptyContratos,
  costos: emptyCostos,
  raw: null as AdminRawData | null,
};

const DESGLOSE_COLORS = ["#168056", "#B7791F", "#356CA5", "#7A8797", "#57B887"];

function pesos(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function selectedMonthLabel(mes: number) {
  return monthLabels[mes - 1] ?? String(mes);
}

export default function Consolidado() {
  const { filters } = useAdminContext();
  const [tarifaArsKwh, setTarifaArsKwh] = useState<number>(85);
  const [tipoCambio, setTipoCambio] = useState<number>(1000);

  const load = useCallback(async () => {
    if (!filters.empresaId) return initialData;
    const [empresa, compliance, contratos, costos, raw] = await Promise.all([
      getEmpresaData(filters.empresaId),
      getComplianceData(filters.empresaId),
      getContratosData(filters.empresaId, filters.anio, filters.mes),
      getCostosData(filters.empresaId, filters.anio, filters.mes),
      getAdminRawData(filters.empresaId, filters.anio, filters.mes),
    ]);
    return { empresa, compliance, contratos, costos, raw };
  }, [filters.anio, filters.empresaId, filters.mes]);

  const { data, error, loading } = useAsyncData(load, initialData);

  const yearRows = useMemo(
    () => data.compliance.filter((row) => row.anio === filters.anio),
    [data.compliance, filters.anio],
  );
  const cleanYearRows = useMemo(() => yearRows.filter((row) => !row.dato_sospechoso), [yearRows]);
  const selectedRow = useMemo(
    () =>
      yearRows.find((row) => row.anio === filters.anio && row.mes_numero === filters.mes) ?? null,
    [yearRows, filters.anio, filters.mes],
  );

  const annualRenewable = useMemo(() => {
    const totalDemand = cleanYearRows.reduce((sum, row) => sum + row.demanda_mwh, 0);
    const totalMater = cleanYearRows.reduce((sum, row) => sum + row.mater_mwh, 0);
    if (!totalDemand) return 0;
    return Number(((totalMater / totalDemand) * 100).toFixed(2));
  }, [cleanYearRows]);

  const projectedClose = useMemo(() => {
    if (!cleanYearRows.length) return 0;
    if (cleanYearRows.length === 12) return annualRenewable;
    const covered = new Set(cleanYearRows.map((row) => row.mes_numero));
    const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !covered.has(m));
    const historyByMonth = new Map<number, { mater: number; demanda: number }[]>();
    data.compliance.forEach((row) => {
      if (row.anio >= filters.anio || row.dato_sospechoso) return;
      const bucket = historyByMonth.get(row.mes_numero) ?? [];
      bucket.push({ mater: row.mater_mwh, demanda: row.demanda_mwh });
      historyByMonth.set(row.mes_numero, bucket);
    });
    const avgDemand = cleanYearRows.reduce((s, r) => s + r.demanda_mwh, 0) / cleanYearRows.length;
    const avgMater = cleanYearRows.reduce((s, r) => s + r.mater_mwh, 0) / cleanYearRows.length;
    let projMater = cleanYearRows.reduce((s, r) => s + r.mater_mwh, 0);
    let projDemand = cleanYearRows.reduce((s, r) => s + r.demanda_mwh, 0);
    missing.forEach((m) => {
      const bucket = historyByMonth.get(m) ?? [];
      if (bucket.length) {
        projMater += bucket.reduce((s, r) => s + r.mater, 0) / bucket.length;
        projDemand += bucket.reduce((s, r) => s + r.demanda, 0) / bucket.length;
      } else {
        projMater += avgMater;
        projDemand += avgDemand;
      }
    });
    if (!projDemand) return 0;
    return Number(((projMater / projDemand) * 100).toFixed(2));
  }, [annualRenewable, cleanYearRows, data.compliance, filters.anio]);

  const complianceStatus = projectedClose >= 20 ? "cumple" : projectedClose >= 18 ? "riesgo" : "incumple";
  const totalDemandYear = cleanYearRows.reduce((s, r) => s + r.demanda_mwh, 0);
  const totalMaterYear = cleanYearRows.reduce((s, r) => s + r.mater_mwh, 0);
  const materRequerido = totalDemandYear * 0.2;
  const faltanteMwh = Math.max(0, materRequerido - totalMaterYear);
  const multaPotencialUsd = faltanteMwh * MULTA_USD_MWH_FALTANTE;

  const contractSummary = useMemo(() => {
    const contratos = data.contratos.contratos;
    if (!contratos.length) return null;
    const precioEfectivoContrato =
      contratos.reduce((s, c) => s + c.precio_usd_mwh, 0) / contratos.length;
    const precioMercado = data.contratos.precio_mercado_referencia || 0;
    const diffPct = precioMercado ? ((precioEfectivoContrato - precioMercado) / precioMercado) * 100 : 0;
    const mainContract = contratos[0];
    const vencimientoFecha = mainContract.vigencia;
    return {
      precioEfectivo: precioEfectivoContrato,
      precioMercado,
      diffPct,
      score: mainContract.score,
      vencimiento: vencimientoFecha,
    };
  }, [data.contratos]);

  const materMwhMes = data.raw?.mater_mwh ?? selectedRow?.mater_mwh ?? 0;
  const tcSeguro = tipoCambio > 0 ? tipoCambio : 1;
  const ahorroMesUsd = contractSummary
    ? (contractSummary.precioMercado - contractSummary.precioEfectivo) * materMwhMes
    : 0;

  const costosSerie = data.costos.serie;
  const ultimoHistorico = [...costosSerie].filter((r) => r.tipo === "historico").pop();
  const proyeccion12 = costosSerie.filter((r) => r.tipo === "proyeccion");
  const pico = proyeccion12.filter((r) => r.es_pico);
  const peakMax = pico.length
    ? pico.reduce((max, r) => (r.costo_usd_mwh > max.costo_usd_mwh ? r : max))
    : undefined;
  const proyeccion12Total = proyeccion12.reduce((s, r) => s + r.total_usd, 0);

  const migracion = useMemo(() => {
    const demandaMesMwh = data.raw?.demanda_total_mwh ?? selectedRow?.demanda_mwh ?? 0;
    const cargoTransporteArsMwh = data.raw?.cargo_transporte_pesos_mwh ?? 0;
    const spotPesosAvg = data.raw
      ? (data.raw.precio_spot_pico_pesos_mwh +
          data.raw.precio_spot_valle_pesos_mwh +
          data.raw.precio_spot_resto_pesos_mwh) /
        3
      : 0;

    const tarifaDistribuidoraUsdMwh = (tarifaArsKwh * 1000) / tcSeguro;
    const spotUsdMwh = spotPesosAvg / tcSeguro;
    const transporteUsdMwh = cargoTransporteArsMwh / tcSeguro;
    const memCostoUsdMwh = spotUsdMwh + transporteUsdMwh + spotUsdMwh * POTENCIA_FACTOR;

    const ahorroPorMwh = tarifaDistribuidoraUsdMwh - memCostoUsdMwh;
    const ahorroMensualUsd = ahorroPorMwh * demandaMesMwh;
    const paybackMeses = ahorroMensualUsd > 0 ? MIGRATION_SETUP_USD / ahorroMensualUsd : Infinity;
    const esGudi = data.empresa.tipo_usuario === "GUDI";
    const recomendacion =
      ahorroPorMwh <= 0 ? "NO_CONVIENE" : paybackMeses <= 12 ? "CONVIENE" : paybackMeses <= 24 ? "EVALUAR" : "NO_CONVIENE";

    return {
      tarifaUsdMwh: tarifaDistribuidoraUsdMwh,
      memCostoUsdMwh,
      spotUsdMwh,
      transporteUsdMwh,
      ahorroPorMwh,
      ahorroMensualUsd,
      paybackMeses,
      esGudi,
      recomendacion,
      demandaMesMwh,
    };
  }, [data.empresa.tipo_usuario, data.raw, selectedRow, tarifaArsKwh, tcSeguro]);

  if (!filters.empresaId) {
    return (
      <Panel className="p-8">
        <h2 className="font-fraunces text-2xl font-bold text-ivory">
          Selecciona un gran consumidor
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
          Usa el filtro superior (Empresa · Año · Mes) para cargar los 4 módulos consolidados.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen messages={["Cargando consolidado...", "Cruzando datos CAMMESA..."]} />
      ) : null}

      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <header>
        <p className="text-sm uppercase text-mist">Vista consolidada</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          {data.empresa.razon_social || filters.empresaNombre || "Empresa"} ·{" "}
          {selectedMonthLabel(filters.mes)} {filters.anio}
        </h2>
        <p className="mt-2 text-sm text-mist">
          {data.empresa.tipo_usuario} · {data.empresa.nemo || "Sin NEMO"} ·{" "}
          {data.empresa.comercializador || "Sin comercializador"}
        </p>
      </header>

      {/* ===== MÓDULO 1 — COMPLIANCE ===== */}
      <section className="space-y-4">
        <SectionHeader
          icon={<FileCheck2 size={18} />}
          subtitle="Ley 27.191 · 20% de energía renovable acumulado en el año calendario"
          title="Módulo 1 · Compliance Ley 27.191"
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="green"
            label="% renovable YTD"
            subtext={`${cleanYearRows.length}/12 meses · objetivo 20%`}
            value={percent(annualRenewable, 2)}
          />
          <StatCard
            borderColor="blue"
            label="Cierre proyectado"
            subtext="Estacionalidad histórica"
            value={percent(projectedClose, 2)}
          />
          <StatCard
            borderColor={complianceStatus === "cumple" ? "green" : "yellow"}
            label="Estado"
            subtext={
              complianceStatus === "cumple"
                ? "Proyección ≥ 20%"
                : complianceStatus === "riesgo"
                  ? "18% ≤ proyección < 20%"
                  : "Proyección < 18%"
            }
            value={complianceStatus.toUpperCase()}
          />
          <StatCard
            borderColor="yellow"
            label="Multa potencial"
            subtext={`${number(faltanteMwh, 0)} MWh faltantes · USD ${MULTA_USD_MWH_FALTANTE}/MWh`}
            value={usd(multaPotencialUsd)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-syne text-base font-bold text-ivory">Compliance anual</h3>
              <Badge
                tone={
                  complianceStatus === "cumple"
                    ? "success"
                    : complianceStatus === "riesgo"
                      ? "warning"
                      : "warning"
                }
              >
                {complianceStatus.toUpperCase()}
              </Badge>
            </div>
            <ComplianceGauge value={projectedClose} />
            <p className="mt-2 text-xs text-mist">
              YTD {percent(annualRenewable, 2)} · cierre {percent(projectedClose, 2)} · objetivo 20%
            </p>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-navy-border p-5">
              <h3 className="font-syne text-base font-bold text-ivory">Detalle mensual {filters.anio}</h3>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-navy/55 text-xs uppercase text-mist">
                  <tr>
                    <th className="px-5 py-3">Mes</th>
                    <th className="px-5 py-3">Demanda</th>
                    <th className="px-5 py-3">MATER</th>
                    <th className="px-5 py-3">SPOT</th>
                    <th className="px-5 py-3">% Ren.</th>
                    <th className="px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-border">
                  {yearRows.map((row) => (
                    <tr className="text-mist" key={row.mes}>
                      <td className="px-5 py-3 font-medium text-ivory">{row.mes}</td>
                      <td className="number px-5 py-3">{number(row.demanda_mwh, 2)}</td>
                      <td className="number px-5 py-3">{number(row.mater_mwh, 2)}</td>
                      <td className="number px-5 py-3">{number(row.spot_mwh, 2)}</td>
                      <td className="number px-5 py-3">{percent(row.porcentaje_renovable, 2)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-2 ${row.cumple ? "text-forest-light" : "text-alert"}`}
                        >
                          {row.cumple ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                          {row.cumple ? "OK" : "Riesgo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {yearRows.length === 0 ? (
                    <tr>
                      <td className="px-5 py-4 text-mist" colSpan={6}>
                        Sin datos para el año seleccionado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== MÓDULO 2 — CONTRATOS ===== */}
      <section className="space-y-4">
        <SectionHeader
          icon={<ShieldCheck size={18} />}
          subtitle="USD/MWh efectivo vs referencia de mercado por tipo"
          title="Módulo 2 · Benchmark de contratos MATER"
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="green"
            label="Precio efectivo contrato"
            subtext="Promedio contratos activos"
            value={`${usd(contractSummary?.precioEfectivo ?? 0, 2)}/MWh`}
          />
          <StatCard
            borderColor="blue"
            label="Referencia mercado"
            subtext="MEM · variables relevantes"
            value={
              data.contratos.precio_mercado_referencia > 0
                ? `${usd(data.contratos.precio_mercado_referencia, 2)}/MWh`
                : "—"
            }
          />
          <StatCard
            borderColor={contractSummary && contractSummary.diffPct <= 5 ? "green" : "yellow"}
            label="Diferencia"
            subtext={contractSummary && contractSummary.diffPct > 0 ? "Paga más caro" : "Paga más barato"}
            value={contractSummary ? `${contractSummary.diffPct.toFixed(1)}%` : "—"}
          />
          <StatCard
            borderColor={ahorroMesUsd >= 0 ? "green" : "yellow"}
            label={ahorroMesUsd >= 0 ? "Ahorro estimado mensual" : "Sobrecosto mensual"}
            subtext={`Volumen MATER ${number(materMwhMes, 0)} MWh`}
            value={usd(Math.abs(ahorroMesUsd))}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ChartFrame subtitle="Comparativo USD/MWh contrato vs referencia" title="Contratos activos">
            <ContractChart contratos={data.contratos} />
          </ChartFrame>

          <Panel className="overflow-hidden">
            <div className="border-b border-navy-border p-5">
              <h3 className="font-syne text-base font-bold text-ivory">Detalle contractual</h3>
            </div>
            <div className="divide-y divide-navy-border">
              {data.contratos.contratos.map((contract) => (
                <div className="p-5" key={contract.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="font-syne text-lg text-ivory">{contract.tipo}</strong>
                    <Badge
                      tone={
                        contract.score === "optimo" || contract.score === "en_rango"
                          ? "success"
                          : contract.score === "sin_referencia"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {contract.score.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-mist">{contract.generador}</p>
                  <p className="number mt-3 font-syne text-2xl font-bold text-ivory">
                    {usd(contract.precio_usd_mwh, 2)}/MWh
                  </p>
                  <p className="mt-2 text-xs text-mist">Vigencia: {contract.vigencia}</p>
                </div>
              ))}
              {data.contratos.contratos.length === 0 ? (
                <p className="p-5 text-sm text-mist">No hay contratos activos.</p>
              ) : null}
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== MÓDULO 3 — COSTOS ===== */}
      <section className="space-y-4">
        <SectionHeader
          icon={<LineChart size={18} />}
          subtitle="Costo monómico USD/MWh · histórico 24 meses + proyección 12 meses"
          title="Módulo 3 · Proyección de costos"
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="green"
            label="Costo monómico mes"
            subtext={ultimoHistorico?.mes ?? "Sin datos"}
            value={`${usd(ultimoHistorico?.costo_usd_mwh ?? 0, 2)}/MWh`}
          />
          <StatCard
            borderColor="blue"
            label="Total mes USD"
            subtext={`Demanda ${number(ultimoHistorico?.demanda_mwh ?? 0)} MWh`}
            value={usd(ultimoHistorico?.total_usd ?? 0)}
          />
          <StatCard
            borderColor="yellow"
            label="Pico invierno proyectado"
            subtext={peakMax?.mes ?? "Sin proyección"}
            value={`${usd(peakMax?.costo_usd_mwh ?? 0, 2)}/MWh`}
          />
          <StatCard
            borderColor="green"
            label="Proyección 12 meses"
            subtext="Gasto acumulado estimado"
            value={usd(proyeccion12Total)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <ChartFrame subtitle="Histórico + proyección" title="Costo promedio mensual">
            <CostChart data={costosSerie} />
          </ChartFrame>

          <Panel className="p-5">
            <h3 className="font-syne text-base font-bold text-ivory">
              Desglose {ultimoHistorico?.mes ?? ""}
            </h3>
            <div className="mt-4 h-56">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={data.costos.desglose_mes}
                    dataKey="valor_usd"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {data.costos.desglose_mes.map((item, index) => (
                      <Cell fill={DESGLOSE_COLORS[index % DESGLOSE_COLORS.length]} key={item.concepto} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-3">
              {data.costos.desglose_mes.map((item, index) => (
                <div className="flex justify-between gap-3 text-sm" key={item.concepto}>
                  <span className="flex items-center gap-2 text-mist">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: DESGLOSE_COLORS[index % DESGLOSE_COLORS.length] }}
                    />
                    {item.concepto}
                    {item.estimado ? (
                      <span className="rounded border border-mist/30 px-1.5 py-0.5 text-[10px] uppercase text-mist">
                        estimado
                      </span>
                    ) : null}
                  </span>
                  <strong className="number text-ivory">{usd(item.valor_usd)}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      {/* ===== MÓDULO 4 — MIGRACIÓN AL MEM ===== */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Navigation size={18} />}
          subtitle="Comparativo tarifa distribuidora vs compra directa en el MEM"
          title="Módulo 4 · Calculadora de migración al MEM"
        />

        <Panel className="p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label>
              <span className="text-[11px] font-semibold uppercase text-mist">
                Tarifa distribuidora ARS/kWh
              </span>
              <input
                className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
                min={0}
                onChange={(event) => setTarifaArsKwh(Number(event.target.value))}
                step={0.01}
                type="number"
                value={tarifaArsKwh}
              />
            </label>
            <label>
              <span className="text-[11px] font-semibold uppercase text-mist">
                Tipo de cambio ARS/USD
              </span>
              <input
                className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
                min={1}
                onChange={(event) => setTipoCambio(Number(event.target.value))}
                step={1}
                type="number"
                value={tipoCambio}
              />
            </label>
            <div className="flex flex-col justify-end text-xs text-mist">
              <p>Setup migración: {usd(MIGRATION_SETUP_USD)}</p>
              <p>Demanda mes: {number(migracion.demandaMesMwh, 2)} MWh</p>
              <p>
                Estado GUDI:{" "}
                <span className={migracion.esGudi ? "text-forest-light" : "text-alert"}>
                  {migracion.esGudi ? "Sí (migrable)" : "No es GUDI"}
                </span>
              </p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="yellow"
            label="Costo actual distribuidora"
            subtext={`${pesos(tarifaArsKwh, 2)}/kWh`}
            value={`${usd(migracion.tarifaUsdMwh, 2)}/MWh`}
          />
          <StatCard
            borderColor="green"
            label="Costo estimado MEM"
            subtext={`SPOT ${usd(migracion.spotUsdMwh, 2)} + transporte ${usd(migracion.transporteUsdMwh, 2)}`}
            value={`${usd(migracion.memCostoUsdMwh, 2)}/MWh`}
          />
          <StatCard
            borderColor={migracion.ahorroMensualUsd > 0 ? "green" : "yellow"}
            label="Ahorro mensual estimado"
            subtext={`${usd(migracion.ahorroPorMwh, 2)}/MWh × ${number(migracion.demandaMesMwh, 0)} MWh`}
            value={usd(Math.max(0, migracion.ahorroMensualUsd))}
          />
          <StatCard
            borderColor={
              migracion.recomendacion === "CONVIENE"
                ? "green"
                : migracion.recomendacion === "EVALUAR"
                  ? "yellow"
                  : "yellow"
            }
            label="Payback"
            subtext={
              migracion.recomendacion === "CONVIENE"
                ? "< 12 meses"
                : migracion.recomendacion === "EVALUAR"
                  ? "12-24 meses"
                  : "Sin payback viable"
            }
            value={
              Number.isFinite(migracion.paybackMeses)
                ? `${migracion.paybackMeses.toFixed(1)} meses`
                : "—"
            }
          />
        </div>

        <Panel className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              tone={
                migracion.recomendacion === "CONVIENE"
                  ? "success"
                  : migracion.recomendacion === "EVALUAR"
                    ? "warning"
                    : "warning"
              }
            >
              Recomendación: {migracion.recomendacion.replace("_", " ")}
            </Badge>
            {!migracion.esGudi ? (
              <Badge tone="neutral">Empresa no-GUDI · revisar elegibilidad</Badge>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-mist">
            {migracion.recomendacion === "CONVIENE"
              ? `Con ${usd(migracion.ahorroMensualUsd)} de ahorro mensual estimado, la inversión de ${usd(MIGRATION_SETUP_USD)} se recupera en ${migracion.paybackMeses.toFixed(1)} meses. Migrar al MEM es económicamente favorable.`
              : migracion.recomendacion === "EVALUAR"
                ? `El ahorro existe pero el payback de ${migracion.paybackMeses.toFixed(1)} meses es largo. Evaluar volatilidad de precio spot y escalones tarifarios antes de decidir.`
                : `No se detecta ahorro positivo con la tarifa ingresada (${pesos(tarifaArsKwh, 2)}/kWh). Revisar tarifa real o esperar próximos ajustes tarifarios.`}
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-mist">
            <li>Verificar condición de GUDI/GUME/GUMA en CAMMESA y potencia contratada.</li>
            <li>Firmar contrato con comercializador o generador MATER.</li>
            <li>Tramitar alta como agente del MEM (formularios + garantías).</li>
            <li>Desvinculación de la distribuidora (plazo legal 180 días).</li>
            <li>Go-live y monitoreo primer trimestre.</li>
          </ol>
        </Panel>
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  subtitle,
  title,
}: {
  icon: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-navy-border pb-3">
      <span className="mt-1 rounded border border-navy-border bg-navy p-2 text-forest">{icon}</span>
      <div>
        <h3 className="font-fraunces text-xl font-bold text-ivory">{title}</h3>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>
    </div>
  );
}
