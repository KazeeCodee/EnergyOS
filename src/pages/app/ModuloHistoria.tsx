import { useCallback } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchHistoriaEnergetica } from "../../services/historiaEnergetica";
import type { HistoriaEnergeticaResponse } from "../../types/historiaEnergetica";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtMwh(n: number | null | undefined) { return n == null ? "—" : `${n.toLocaleString("es-AR")} MWh`; }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
function mesLabel(anio: number, mes: number) {
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" }).replace(".", "");
}

const MES_LABELS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const EMPTY: HistoriaEnergeticaResponse = {
  nemo: "", meses: 60, autorizados: [], serieMensual: [], heatmap: [], resumen: null,
};

// Heatmap usando un grid CSS
function Heatmap({ data }: { data: HistoriaEnergeticaResponse["heatmap"] }) {
  if (data.length === 0) return null;

  const anios = [...new Set(data.map((d) => d.anio))].sort();
  const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const byKey = new Map(data.map((d) => [`${d.anio}-${d.mes}`, d]));

  function cellColor(intensidad: number | null): string {
    if (intensidad == null) return "#f1f5f9";
    const t = Math.max(0, Math.min(1, intensidad));
    // Del teal claro (#5de2e2) al teal oscuro (#0e8a8a)
    const r = Math.round(93 + (14 - 93) * t);
    const g = Math.round(226 + (138 - 226) * t);
    const b = Math.round(226 + (138 - 226) * t);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
      <p className="text-sm font-semibold text-slate-700 mb-4">Heatmap de consumo (5 años)</p>
      <div className="min-w-[420px]">
        {/* Header meses */}
        <div className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
          <div />
          {meses.map((m) => (
            <div key={m} className="text-center text-[10px] font-semibold text-slate-400">{MES_LABELS[m]}</div>
          ))}
        </div>
        {/* Rows por año */}
        {anios.map((anio) => (
          <div key={anio} className="grid grid-cols-[48px_repeat(12,1fr)] gap-1 mb-1">
            <div className="flex items-center text-[10px] font-semibold text-slate-500">{anio}</div>
            {meses.map((mes) => {
              const cell = byKey.get(`${anio}-${mes}`);
              return (
                <div
                  key={mes}
                  className="h-8 rounded"
                  style={{ backgroundColor: cellColor(cell?.intensidadNormalizada ?? null) }}
                  title={cell ? `${MES_LABELS[mes]} ${anio}: ${cell.demandaMwh?.toLocaleString("es-AR") ?? "—"} MWh` : `${MES_LABELS[mes]} ${anio}: sin datos`}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
          <span>Menor consumo</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
              const r = Math.round(93 + (14 - 93) * t);
              const g = Math.round(226 + (138 - 226) * t);
              const b = Math.round(226 + (138 - 226) * t);
              return <div key={t} className="h-3 w-5 rounded-sm" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />;
            })}
          </div>
          <span>Mayor consumo</span>
        </div>
      </div>
    </div>
  );
}

export default function ModuloHistoria() {
  const { agente, ultimoMesDisponible } = useAppContext();

  const loader = useCallback(() => fetchHistoriaEnergetica({ nemo: agente?.nemo, meses: 60 }), [agente?.nemo]);
  const { data, loading, error } = useAsyncData<HistoriaEnergeticaResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando historia energética..."]} />;

  const r = data.resumen;
  const sinDatos = data.serieMensual.length === 0;

  const barData = data.serieMensual.map((p) => ({
    mes: mesLabel(p.anio, p.mes), mwh: p.demandaMwh ?? 0, yoy: p.yoyPct,
  }));

  return (
    <div>
      <ModuleHeader
        title="Historia Energética"
        subtitle="Módulo 4 · 5 años de historial, YoY, mayor y menor consumo"
        tooltip="Muestra el historial completo de demanda declarada ante CAMMESA. Los datos YoY (year-over-year) comparan cada mes con el mismo mes del año anterior."
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon="📅" title="Sin historial disponible" description="No encontramos historial de consumo para este agente. Es posible que sea un agente nuevo o que los datos aún no estén procesados." />
      ) : (
        <>
          {/* Cards resumen */}
          {r && (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Promedio mensual", value: fmtMwh(r.demandaPromedioMensualMwh), sub: `${r.mesesDisponibles} meses disponibles` },
                { label: "Variación YoY", value: fmtPct(r.variacionYoyUltimoMesPct), sub: "Último mes vs. mismo mes año anterior" },
                { label: "Mes mayor consumo", value: r.mesMayorConsumo.demandaMwh ? fmtMwh(r.mesMayorConsumo.demandaMwh) : "—", sub: r.mesMayorConsumo.periodo },
                { label: "Mes menor consumo", value: r.mesMenorConsumo.demandaMwh ? fmtMwh(r.mesMenorConsumo.demandaMwh) : "—", sub: r.mesMenorConsumo.periodo },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-t-4 border-t-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                  <p className="mt-2 text-xl font-bold text-[#163759]">{c.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Heatmap */}
          <div className="mb-5">
            <Heatmap data={data.heatmap} />
          </div>

          {/* Barras mensuales */}
          {barData.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Demanda mensual histórica (MWh)</p>
              <ResponsiveContainer height={220} width="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={5} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={55} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    formatter={(v: unknown, n: unknown) => [n === "mwh" ? `${(v as number).toLocaleString("es-AR")} MWh` : `${(v as number).toFixed(1)}%`, n === "mwh" ? "Demanda" : "YoY"]}
                  />
                  <Bar dataKey="mwh" name="mwh" fill="#15caca" radius={[3, 3, 0, 0]} />
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
