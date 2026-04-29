import { useCallback, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchCompliance27191 } from "../../services/compliance27191";
import type { Compliance27191Response } from "../../types/compliance27191";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
function fmtPesos(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function mesLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

const EMPTY: Compliance27191Response = {
  nemo: "", meses: 12, autorizados: [],
  resumen: { meses: 0, ultimoMes: null, pctRenovablePromedio: null, renovableContratadoMwh: 0, brechaMwh: 0, multaEstimadaPesos: 0, anioEnCurso: null, brechaAnioEnCursoMwh: 0, multaAnioEnCursoPesos: 0, cumpleYtd: false, brechaYtdMwh: null },
  serie: [],
  notas: { multa: "", obligacion: "" },
};

export default function ModuloCumplimiento() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(() => fetchCompliance27191({ nemo: agente?.nemo, meses }), [agente?.nemo, meses]);
  const { data, loading, error } = useAsyncData<Compliance27191Response>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando cumplimiento 27.191..."]} />;

  const r = data.resumen;
  const sinDatos = data.serie.length === 0;

  const chartData = data.serie.slice().reverse().map((p) => ({
    mes: mesLabel(p.periodo), real: p.pctRenovableReal ?? 0, obligacion: p.obligacionPct ?? 0, cumple: p.cumpleMes,
  }));

  const brechaData = data.serie.slice().reverse().map((p) => ({
    mes: mesLabel(p.periodo), brecha: p.brechaMwh ?? 0, multa: (p.multaEstimadaPesos ?? 0) / 1_000_000,
  }));

  const cardColor = (cond: boolean | null, reverse = false) =>
    cond == null ? "border-t-slate-200 bg-white" : (cond !== reverse ? "border-t-[#15caca] bg-[#15caca]/5" : "border-t-red-400 bg-red-50");

  return (
    <div>
      <ModuleHeader
        title="Cumplimiento Renovable 27.191"
        subtitle="Módulo 2 · Brecha, cumplimiento y multa estimada"
        tooltip="La Ley 27.191 obliga a los Grandes Usuarios del MEM a cubrir un porcentaje creciente de su consumo anual con energía renovable (MATER). El incumplimiento genera multa estimada."
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
      {!sinDatos && !r.cumpleYtd && (
        <div className="mb-5">
          <AlertaBanner type="warning" message={`No cumplís el cupo renovable acumulado. Brecha: ${r.brechaYtdMwh?.toLocaleString("es-AR") ?? "—"} MWh.`} />
        </div>
      )}

      {sinDatos ? (
        <EmptyState icon="🌿" title="Sin datos de cumplimiento" description="No encontramos datos de renovables para este agente. Es posible que no tenga contratos MATER o que los datos aún no estén disponibles." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Renovable prom.", value: fmtPct(r.pctRenovablePromedio), sub: `${meses} meses`, cls: cardColor((r.pctRenovablePromedio ?? 0) >= 10) },
              { label: "Brecha acum.", value: r.brechaMwh ? `${r.brechaMwh.toLocaleString("es-AR")} MWh` : "—", sub: "MWh faltantes", cls: cardColor(r.brechaMwh <= 0) },
              { label: "Multa estimada", value: fmtPesos(r.multaEstimadaPesos), sub: "Acumulada período", cls: r.multaEstimadaPesos > 0 ? "border-t-amber-400 bg-amber-50" : "border-t-slate-200 bg-white" },
              { label: "Cumple YTD", value: r.cumpleYtd ? "Sí ✅" : "No ⚠️", sub: r.anioEnCurso ? `Año ${r.anioEnCurso}` : "Período", cls: cardColor(r.cumpleYtd) },
            ].map((c) => (
              <div key={c.label} className={`rounded-2xl border border-t-4 p-5 shadow-sm ${c.cls}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                <p className="mt-2 text-xl font-bold text-[#163759]">{c.value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">% Renovable real vs. obligación mensual</p>
              <ResponsiveContainer height={220} width="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]} />
                  <Bar dataKey="real" name="Real" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.cumple ? "#15caca" : "#ef4444"} />)}
                  </Bar>
                  <Bar dataKey="obligacion" name="Obligación" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {brechaData.some((d) => d.brecha > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Brecha mensual (MWh) y multa estimada (M$)</p>
              <ResponsiveContainer height={180} width="100%">
                <LineChart data={brechaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <ReferenceLine yAxisId="left" y={0} stroke="#e2e8f0" />
                  <Line yAxisId="left" dataKey="brecha" name="Brecha (MWh)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} type="monotone" />
                  <Line yAxisId="right" dataKey="multa" name="Multa (M$)" stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" dot={false} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {data.notas.multa && <p className="mt-3 text-xs text-slate-400 italic">{data.notas.multa}</p>}
        </>
      )}
      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
