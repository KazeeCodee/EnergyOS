import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchFactorCargaMensual } from "../../services/factorCarga";
import type { FactorCargaResponse } from "../../types/factorCarga";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n * 100)}%`; }
function mesLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

const EMPTY: FactorCargaResponse = {
  nemo: "", meses: 12, autorizados: [],
  resumen: { meses: 0, mesesConPvr: 0, ultimoMes: null, factorCargaPct: null, factorCargaMetodo: "no_disponible_sin_potencia_maxima", pctPicoPromedio: null, pctVallePromedio: null, pctRestoPromedio: null, ratioPicoVallePromedio: null, pctPicoPercentilPromedio: null, estacionalidadYoyUltimoMes: null, calidadDatoUltimoMes: null },
  serie: [], benchmark: [],
  notas: { factorCarga: "" },
};

// ---------------------------------------------------------------------------
// Mini gauge para el percentil
// ---------------------------------------------------------------------------
function PercentilBar({ percentil }: { percentil: number }) {
  const pct = Math.max(0, Math.min(100, percentil));
  const color = pct < 33 ? "#10b981" : pct < 66 ? "#f59e0b" : "#ef4444";
  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full rounded-full bg-slate-200">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {/* Marcador en P50 */}
        <div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-slate-400" style={{ left: "50%" }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>P0</span>
        <span>P50 (mediana)</span>
        <span>P100</span>
      </div>
    </div>
  );
}

export default function ModuloPerfilCarga() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(() => fetchFactorCargaMensual({ nemo: agente?.nemo, meses }), [agente?.nemo, meses]);
  const { data, loading, error } = useAsyncData<FactorCargaResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando perfil de carga..."]} />;

  const r = data.resumen;
  const sinDatos = data.serie.length === 0;
  const serieAsc = data.serie.slice().reverse();

  const pvrData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    pico: (p.pctPico ?? 0) * 100,
    valle: (p.pctValle ?? 0) * 100,
    resto: (p.pctResto ?? 0) * 100,
  }));

  const ratioData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    ratio: p.ratioPicoValle ?? 0,
  })).filter((d) => d.ratio > 0);

  const ultimoMes = data.serie[data.serie.length - 1];
  const benchUltimoMes = data.benchmark[data.benchmark.length - 1];

  return (
    <div>
      <ModuleHeader
        title="Perfil de Carga"
        subtitle="Pico / Valle / Resto, ratio y benchmark de tu universo"
        tooltip="El perfil de carga muestra cómo distribuís tu consumo entre horas pico (18–23h), valle (0–6h) y el resto. Un alto consumo en pico encarece la energía."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        ultimoMesDisponible={ultimoMesDisponible}
        maxMeses={60}
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon="📉" title="Sin datos de perfil de carga" description="No encontramos datos de apertura pico/valle/resto para este agente. Es posible que aún no estén disponibles para tu tipo de agente." />
      ) : (
        <>
          {/* Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="% Pico promedio"
              value={fmtPct(r.pctPicoPromedio)}
              sub="Horas 18–23h"
              tone="orange"
            />
            <StatCard
              label="% Valle promedio"
              value={fmtPct(r.pctVallePromedio)}
              sub="Horas 0–6h"
              tone="teal"
            />
            <StatCard
              label="% Resto promedio"
              value={fmtPct(r.pctRestoPromedio)}
              sub="Resto del día"
            />
            <StatCard
              label="Ratio Pico/Valle"
              value={r.ratioPicoVallePromedio != null ? fmt(r.ratioPicoVallePromedio) : "—"}
              sub="Mayor = más concentrado en pico"
              tone={
                r.ratioPicoVallePromedio == null ? "default" :
                r.ratioPicoVallePromedio > 1.5 ? "amber" : "emerald"
              }
            />
          </div>

          {/* Percentil — bloque destacado */}
          {ultimoMes && ultimoMes.pctPicoPercentil != null && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Tu posición en el universo · Último mes
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-[#163759]">
                    Estás en el percentil <span className="text-3xl">P{Math.round(ultimoMes.pctPicoPercentil * 100)}</span> de consumo en pico
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {ultimoMes.pctPicoPercentil < 0.33
                      ? "Bien — tu consumo en pico es menor que el de la mayoría de agentes similares."
                      : ultimoMes.pctPicoPercentil < 0.66
                      ? "Estás en línea con la mediana de tu universo."
                      : "Tu consumo en pico es mayor que el de la mayoría — hay margen para corrimiento."}
                  </p>
                </div>
              </div>

              <PercentilBar percentil={ultimoMes.pctPicoPercentil * 100} />

              {benchUltimoMes && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "P25", val: benchUltimoMes.pctPicoP25 },
                    { label: "P50", val: benchUltimoMes.pctPicoP50 },
                    { label: "P75", val: benchUltimoMes.pctPicoP75 },
                    { label: "Vos", val: ultimoMes.pctPico, highlight: true },
                  ].map((b) => (
                    <div
                      key={b.label}
                      className={`rounded-lg border px-3 py-2 ${
                        b.highlight ? "border-[#15caca] bg-[#15caca]/10" : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{b.label}</p>
                      <p className={`text-base font-bold tabular-nums ${b.highlight ? "text-[#0e8a8a]" : "text-slate-700"}`}>
                        {fmtPct(b.val)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Gráfico PVR mensual */}
          {pvrData.length > 0 && (
            <ChartCard
              title="Distribución Pico / Valle / Resto por mes"
              hint="Cómo se reparte el consumo cada mes entre las tres bandas horarias del MEM."
              className="mb-5"
            >
              <ResponsiveContainer height={240} width="100%">
                <BarChart data={pvrData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} unit="%" domain={[0, 100]} width={40} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="pico" name="Pico (18–23h)" stackId="a" fill="#f97316" />
                  <Bar dataKey="valle" name="Valle (0–6h)" stackId="a" fill="#15caca" />
                  <Bar dataKey="resto" name="Resto" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Ratio Pico/Valle evolución */}
          {ratioData.length > 1 && (
            <ChartCard
              title="Evolución del ratio Pico / Valle"
              hint="Cuántas veces más alto es el consumo de pico respecto al de valle. Valores altos indican concentración en horas caras."
            >
              <ResponsiveContainer height={200} width="100%">
                <LineChart data={ratioData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} width={45} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [(v as number).toFixed(2), "Ratio P/V"]} />
                  <Line dataKey="ratio" stroke="#163759" strokeWidth={2.5} dot={{ r: 3, fill: "#163759" }} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
