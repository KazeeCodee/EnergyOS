import { useCallback, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchFactorCargaMensual } from "../../services/factorCarga";
import type { FactorCargaResponse } from "../../types/factorCarga";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
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

export default function ModuloPerfilCarga() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(() => fetchFactorCargaMensual({ nemo: agente?.nemo, meses }), [agente?.nemo, meses]);
  const { data, loading, error } = useAsyncData<FactorCargaResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando perfil de carga..."]} />;

  const r = data.resumen;
  const sinDatos = data.serie.length === 0;

  // Gráfico PVR por mes
  const pvrData = data.serie.slice().reverse().map((p) => ({
    mes: mesLabel(p.periodo),
    pico: p.pctPico ?? 0,
    valle: p.pctValle ?? 0,
    resto: p.pctResto ?? 0,
  }));

  // Percentil del pico vs benchmark (último mes disponible)
  const ultimoMes = data.serie[data.serie.length - 1];
  const benchUltimoMes = data.benchmark[data.benchmark.length - 1];

  return (
    <div>
      <ModuleHeader
        title="Perfil de Carga"
        subtitle="Módulo 3 · Pico / Valle / Resto, factor de carga y benchmark"
        tooltip="El perfil de carga muestra cómo distribuís tu consumo entre horas pico (18–23h), valle (0–6h) y el resto. Un alto consumo en pico puede encarecer tu energía."
        actions={
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Meses</label>
            <select className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#15caca] focus:outline-none" onChange={(e) => setMeses(parseInt(e.target.value, 10))} value={meses}>
              {[6, 12, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}
            </select>
          </div>
        }
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon="📉" title="Sin datos de perfil de carga" description="No encontramos datos de apertura pico/valle/resto para este agente. Es posible que aún no estén disponibles para tu tipo de agente." />
      ) : (
        <>
          {/* Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "% Pico prom.", value: fmtPct(r.pctPicoPromedio), sub: "Horas 18–23h", cls: "border-t-orange-400 bg-orange-50" },
              { label: "% Valle prom.", value: fmtPct(r.pctVallePromedio), sub: "Horas 0–6h", cls: "border-t-[#15caca] bg-[#15caca]/5" },
              { label: "% Resto prom.", value: fmtPct(r.pctRestoPromedio), sub: "Resto del día", cls: "border-t-slate-200 bg-white" },
              { label: "Ratio Pico/Valle", value: r.ratioPicoVallePromedio != null ? fmt(r.ratioPicoVallePromedio) : "—", sub: "Mayor = más concentrado", cls: "border-t-slate-200 bg-white" },
            ].map((c) => (
              <div key={c.label} className={`rounded-2xl border border-t-4 p-5 shadow-sm ${c.cls}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                <p className="mt-2 text-xl font-bold text-[#163759]">{c.value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Percentil pico */}
          {ultimoMes && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Último mes — Percentil en tu universo</p>
              <div className="flex flex-wrap gap-6">
                {ultimoMes.pctPicoPercentil != null && (
                  <div>
                    <p className="text-2xl font-bold text-[#163759]">P{Math.round(ultimoMes.pctPicoPercentil)}</p>
                    <p className="text-xs text-slate-500">Percentil pico vs. agentes similares</p>
                  </div>
                )}
                {benchUltimoMes && (
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>P25: <strong>{fmtPct(benchUltimoMes.pctPicoP25)}</strong></span>
                    <span>P50: <strong>{fmtPct(benchUltimoMes.pctPicoP50)}</strong></span>
                    <span>P75: <strong>{fmtPct(benchUltimoMes.pctPicoP75)}</strong></span>
                    <span>Vos: <strong className="text-[#0e8a8a]">{fmtPct(ultimoMes.pctPico)}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Gráfico PVR mensual */}
          {pvrData.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Distribución Pico / Valle / Resto por mes (%)</p>
              <ResponsiveContainer height={220} width="100%">
                <BarChart data={pvrData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]} />
                  <Bar dataKey="pico" name="Pico" stackId="a" fill="#f97316" />
                  <Bar dataKey="valle" name="Valle" stackId="a" fill="#15caca" />
                  <Bar dataKey="resto" name="Resto" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
