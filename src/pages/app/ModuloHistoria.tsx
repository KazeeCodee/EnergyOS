import { Calendar } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { ChartCard, chartAxisTick, chartGridStroke, chartTooltipStyle } from "../../components/app/ChartCard";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { RangeSelector } from "../../components/app/RangeSelector";
import { StatCard } from "../../components/app/StatCard";
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchHistoriaEnergetica } from "../../services/historiaEnergetica";
import type {
  HistoriaEnergeticaHeatmapPoint,
  HistoriaEnergeticaPoint,
  HistoriaEnergeticaResponse,
  HistoriaEnergeticaResumen,
} from "../../types/historiaEnergetica";

const MAX_MESES = 63;

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtMwh(n: number | null | undefined) { return n == null ? "—" : `${n.toLocaleString("es-AR")} MWh`; }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n * 100)}%`; }
function mesLabel(anio: number, mes: number) {
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" }).replace(".", "");
}

const MES_LABELS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const EMPTY: HistoriaEnergeticaResponse = {
  nemo: "", meses: MAX_MESES, autorizados: [], serieMensual: [], heatmap: [], resumen: null,
};

function recomputeHeatmap(serie: HistoriaEnergeticaPoint[]): HistoriaEnergeticaHeatmapPoint[] {
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

function recomputeResumen(serie: HistoriaEnergeticaPoint[]): HistoriaEnergeticaResumen | null {
  if (serie.length === 0) return null;
  const first = serie[0];
  const last = serie[serie.length - 1];
  const demandas = serie.filter((row) => row.demandaMwh != null);
  const total = demandas.reduce((sum, row) => sum + (row.demandaMwh ?? 0), 0);
  const ultimos12 = serie.slice(-12);
  const previos12 = serie.slice(-24, -12);
  const demandaUltimos12 = ultimos12.reduce((sum, row) => sum + (row.demandaMwh ?? 0), 0);
  const demandaPrevios12 = previos12.reduce((sum, row) => sum + (row.demandaMwh ?? 0), 0);
  const mayor = demandas.reduce<HistoriaEnergeticaPoint | null>(
    (current, row) => current === null || (row.demandaMwh ?? 0) > (current.demandaMwh ?? 0) ? row : current,
    null,
  );
  const menor = demandas.reduce<HistoriaEnergeticaPoint | null>(
    (current, row) => current === null || (row.demandaMwh ?? 0) < (current.demandaMwh ?? 0) ? row : current,
    null,
  );

  return {
    tipoAgente: last.tipoAgente,
    nemo: last.nemo,
    mesesDisponibles: serie.length,
    primerPeriodo: first.periodo,
    ultimoPeriodo: last.periodo,
    demandaTotalMwh: total,
    demandaPromedioMensualMwh: demandas.length > 0 ? total / demandas.length : null,
    demandaUltimos12mMwh: demandaUltimos12,
    demandaPromedioUltimos12mMwh: ultimos12.length > 0 ? demandaUltimos12 / ultimos12.length : null,
    demanda12mPreviosMwh: previos12.length > 0 ? demandaPrevios12 : null,
    variacionUltimos12mPct: demandaPrevios12 > 0 ? (demandaUltimos12 - demandaPrevios12) / demandaPrevios12 : null,
    primerMesDemandaMwh: first.demandaMwh,
    ultimoMesDemandaMwh: last.demandaMwh,
    mismoMesAnioAnteriorMwh: last.demandaYoyBaseMwh,
    variacionYoyUltimoMesPct: last.yoyPct,
    mesMayorConsumo: {
      periodo: mayor?.periodo ?? "",
      anio: mayor?.anio ?? 0,
      mes: mayor?.mes ?? 0,
      demandaMwh: mayor?.demandaMwh ?? null,
    },
    mesMenorConsumo: {
      periodo: menor?.periodo ?? "",
      anio: menor?.anio ?? 0,
      mes: menor?.mes ?? 0,
      demandaMwh: menor?.demandaMwh ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------
function Heatmap({ data }: { data: HistoriaEnergeticaResponse["heatmap"] }) {
  if (data.length === 0) return null;

  const anios = [...new Set(data.map((d) => d.anio))].sort();
  const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const byKey = new Map(data.map((d) => [`${d.anio}-${d.mes}`, d]));

  const valoresValidos = data.filter((d) => d.demandaMwh != null);
  const minVal = valoresValidos.length > 0 ? Math.min(...valoresValidos.map((d) => d.demandaMwh!)) : 0;
  const maxVal = valoresValidos.length > 0 ? Math.max(...valoresValidos.map((d) => d.demandaMwh!)) : 0;

  function cellColor(intensidad: number | null): string {
    if (intensidad == null) return "#f1f5f9";
    const t = Math.max(0, Math.min(1, intensidad));
    const r = Math.round(218 + (14 - 218) * t);
    const g = Math.round(248 + (138 - 248) * t);
    const b = Math.round(248 + (138 - 248) * t);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <ChartCard
      title="Heatmap de consumo por mes y año"
      hint="Intensidad de color según el consumo mensual. Los meses más cálidos (oscuros) son los de mayor demanda. Útil para detectar estacionalidad."
      right={
        <span className="text-xs text-slate-400">
          Min <strong className="text-slate-600">{minVal.toLocaleString("es-AR")}</strong> · Max <strong className="text-slate-600">{maxVal.toLocaleString("es-AR")} MWh</strong>
        </span>
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
            <div />
            {meses.map((m) => (
              <div key={m} className="text-center text-[10px] font-semibold text-slate-400">{MES_LABELS[m]}</div>
            ))}
          </div>
          {anios.map((anio) => (
            <div key={anio} className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
              <div className="flex items-center text-xs font-bold text-slate-600">{anio}</div>
              {meses.map((mes) => {
                const cell = byKey.get(`${anio}-${mes}`);
                return (
                  <div
                    key={mes}
                    className="group relative h-9 rounded transition-transform hover:scale-110 hover:z-10"
                    style={{ backgroundColor: cellColor(cell?.intensidadNormalizada ?? null) }}
                    title={cell ? `${MES_LABELS[mes]} ${anio}: ${cell.demandaMwh?.toLocaleString("es-AR") ?? "—"} MWh` : `${MES_LABELS[mes]} ${anio}: sin datos`}
                  />
                );
              })}
            </div>
          ))}
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
            <span>Menor consumo</span>
            <div className="flex gap-0.5">
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
                const r = Math.round(218 + (14 - 218) * t);
                const g = Math.round(248 + (138 - 248) * t);
                const b = Math.round(248 + (138 - 248) * t);
                return <div key={t} className="h-3 w-6 rounded-sm" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />;
              })}
            </div>
            <span>Mayor consumo</span>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

export default function ModuloHistoria() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(60);
  const [anchorMes, setAnchorMes] = useState("");

  const loader = useCallback(() => fetchHistoriaEnergetica({ nemo: agente?.nemo, meses: MAX_MESES }), [agente?.nemo]);
  const { data, loading, error } = useAsyncData<HistoriaEnergeticaResponse>(loader, EMPTY);

  const serieCompleta = data.serieMensual;
  const ultimoMesEnSerie = serieCompleta.at(-1)?.periodo ?? ultimoMesDisponible;
  const anchorEfectivo = anchorMes || ultimoMesEnSerie;
  const view = useMemo(() => {
    const serie = serieCompleta.filter((p) => p.periodo <= anchorEfectivo).slice(-meses);
    return { serie, heatmap: recomputeHeatmap(serie), resumen: recomputeResumen(serie) };
  }, [serieCompleta, meses, anchorEfectivo]);

  if (loading) return <ModuleSkeleton />;

  const r = view.resumen;
  const sinDatos = view.serie.length === 0;

  const barData = view.serie.map((p) => ({
    mes: mesLabel(p.anio, p.mes),
    mwh: p.demandaMwh ?? 0,
    yoy: p.yoyPct != null ? p.yoyPct * 100 : null,
  }));

  // Promedio para línea de referencia
  const promedio = r?.demandaPromedioMensualMwh ?? 0;

  return (
    <div>
      <ModuleHeader
        title="Historia Energética"
        subtitle="Histórico mensual, YoY, picos y valles"
        tooltip="Muestra el historial de demanda declarada ante CAMMESA. Los datos YoY (year-over-year) comparan cada mes con el mismo mes del año anterior."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        anchorMes={anchorEfectivo}
        onAnchorChange={(mes) => setAnchorMes(mes === ultimoMesEnSerie ? "" : mes)}
        allowStartSelect
        ultimoMesDisponible={ultimoMesEnSerie}
        maxMeses={Math.max(1, serieCompleta.length || MAX_MESES)}
        presets={[12, 24, 36, 60, 63]}
        label="Histórico"
        debounceMs={0}
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon={<Calendar size={28} className="text-slate-400" />} title="Sin historial disponible" description="No encontramos historial de consumo para este agente. Es posible que sea un agente nuevo o que los datos aún no estén procesados." />
      ) : (
        <>
          {r && (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Promedio mensual"
                value={fmtMwh(r.demandaPromedioMensualMwh)}
                sub={`${r.mesesDisponibles} meses disponibles`}
                tone="teal"
              />
              <StatCard
                label="Variación YoY"
                value={fmtPct(r.variacionYoyUltimoMesPct)}
                sub="Último mes vs. mismo mes año anterior"
                tone={
                  r.variacionYoyUltimoMesPct == null ? "default" :
                  r.variacionYoyUltimoMesPct >= 0 ? "emerald" : "amber"
                }
                trend={r.variacionYoyUltimoMesPct != null ? { value: r.variacionYoyUltimoMesPct * 100, label: "YoY" } : undefined}
              />
              <StatCard
                label="Mes mayor consumo"
                value={r.mesMayorConsumo.demandaMwh ? fmtMwh(r.mesMayorConsumo.demandaMwh) : "—"}
                sub={r.mesMayorConsumo.periodo}
                tone="orange"
              />
              <StatCard
                label="Mes menor consumo"
                value={r.mesMenorConsumo.demandaMwh ? fmtMwh(r.mesMenorConsumo.demandaMwh) : "—"}
                sub={r.mesMenorConsumo.periodo}
                tone="indigo"
              />
            </div>
          )}

          <div className="mb-5">
            <Heatmap data={view.heatmap} />
          </div>

          {/* Barras + YoY combinado */}
          {barData.length > 0 && (
            <ChartCard
              title="Demanda mensual histórica"
              hint="Barras: demanda en MWh. Línea: variación YoY (%) para detectar tendencias."
              right={promedio > 0 ? (
                <span className="text-xs text-slate-400">
                  Promedio: <strong className="text-slate-600">{promedio.toLocaleString("es-AR", { maximumFractionDigits: 0 })} MWh</strong>
                </span>
              ) : undefined}
            >
              <ResponsiveContainer height={260} width="100%">
                <ComposedChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.max(0, Math.floor(barData.length / 12) - 1)} />
                  <YAxis yAxisId="left" tick={chartAxisTick} width={60} tickFormatter={(v) => (v as number).toLocaleString("es-AR")} />
                  <YAxis yAxisId="right" orientation="right" tick={chartAxisTick} width={40} unit="%" />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => {
                      const name = n as string;
                      if (name === "Demanda") return [`${(v as number).toLocaleString("es-AR")} MWh`, name];
                      return [`${(v as number).toFixed(1)}%`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  {promedio > 0 && (
                    <ReferenceLine yAxisId="left" y={promedio} stroke="#94a3b8" strokeDasharray="4 3" />
                  )}
                  <Bar yAxisId="left" dataKey="mwh" name="Demanda" radius={[3, 3, 0, 0]}>
                    {barData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          d.mwh > promedio * 1.1 ? "#0e8a8a" :
                          d.mwh < promedio * 0.9 ? "#a7f3f3" :
                          "#15caca"
                        }
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    dataKey="yoy"
                    name="YoY"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    type="monotone"
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
