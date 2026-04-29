import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchExposicionSpotMensual } from "../../services/exposicionSpot";
import type { ExposicionSpotResponse } from "../../types/exposicionSpot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
function fmtMwh(n: number | null | undefined) { return n == null ? "—" : `${n.toLocaleString("es-AR")} MWh`; }
function fmtPesos(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function mesLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

const EMPTY: ExposicionSpotResponse = {
  nemo: "", meses: 12, autorizados: [],
  resumen: { meses: 0, demandaRealMwh: 0, compraSpotMwh: 0, demandaContratadaMwh: 0, pctSpot: null, pctMat: null, spotPesos: 0, costoSpotPromedioPesosMwh: null, subContratoMwh: 0, sobreContratoMwh: 0 },
  serie: [],
};

// ---------------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------------
export default function ModuloExposicionSpot() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(
    () => fetchExposicionSpotMensual({ nemo: agente?.nemo, meses }),
    [agente?.nemo, meses],
  );
  const { data, loading, error } = useAsyncData<ExposicionSpotResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando exposición spot..."]} />;

  const r = data.resumen;
  const chartData = data.serie
    .slice()
    .reverse()
    .map((p) => ({
      mes: mesLabel(p.periodo),
      spot: p.pctSpot ?? 0,
      mat: p.pctMat ?? 0,
      resto: Math.max(0, 100 - (p.pctSpot ?? 0) - (p.pctMat ?? 0)),
    }));

  const costoData = data.serie
    .slice()
    .reverse()
    .map((p) => ({ mes: mesLabel(p.periodo), costo: p.costoSpotPromedioPesosMwh ?? 0 }));

  const sinDatos = data.serie.length === 0;

  return (
    <div>
      <ModuleHeader
        title="Exposición Spot y Cobertura"
        subtitle="Módulo 1 · Riesgo spot, cobertura contractual, mix mensual"
        tooltip="El mercado spot es donde se compra energía al precio horario del MEM cuando no está cubierta por contratos MATER o bilaterales. Mayor exposición spot = mayor riesgo de precio."
        actions={
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Meses</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#15caca] focus:outline-none"
              onChange={(e) => setMeses(parseInt(e.target.value, 10))}
              value={meses}
            >
              {[6, 12, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}
            </select>
          </div>
        }
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon="📈" title="Sin datos de exposición" description="No hay registros de compra para este agente en el período seleccionado. Es posible que los datos aún no estén disponibles." />
      ) : (
        <>
          {/* Cards resumen */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "% Spot promedio", value: fmtPct(r.pctSpot), sub: `${meses} meses`, color: (r.pctSpot ?? 0) > 70 ? "red" : (r.pctSpot ?? 0) > 40 ? "amber" : "teal" },
              { label: "% MATER promedio", value: fmtPct(r.pctMat), sub: "Cobertura renovable", color: "teal" },
              { label: "Costo spot prom.", value: r.costoSpotPromedioPesosMwh != null ? `${fmt(r.costoSpotPromedioPesosMwh, 0)} $/MWh` : "—", sub: "Precio implícito", color: "default" },
              { label: "Gasto spot total", value: fmtPesos(r.spotPesos), sub: `${meses} meses acum.`, color: "default" },
            ].map((c) => (
              <div key={c.label} className={`rounded-2xl border border-t-4 p-5 shadow-sm ${c.color === "teal" ? "border-t-[#15caca] bg-[#15caca]/5" : c.color === "red" ? "border-t-red-400 bg-red-50" : c.color === "amber" ? "border-t-amber-400 bg-amber-50" : "border-t-slate-200 bg-white"}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                <p className="mt-2 text-2xl font-bold text-[#163759]">{c.value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Sub/sobre contrato */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sub-contrato acum.</p>
              <p className="mt-1 text-xl font-bold text-red-600">{fmtMwh(r.subContratoMwh)}</p>
              <p className="text-xs text-slate-500">Energía comprada en spot por encima del contrato</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sobre-contrato acum.</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{fmtMwh(r.sobreContratoMwh)}</p>
              <p className="text-xs text-slate-500">Energía contratada que excedió el consumo real</p>
            </div>
          </div>

          {/* Gráfico mix mensual */}
          {chartData.length > 0 && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Mix mensual — Spot / MATER / Resto (%)</p>
              <ResponsiveContainer height={220} width="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(1)}%`, name as string]}
                  />
                  <Bar dataKey="spot" name="Spot" stackId="a" fill="#f97316" />
                  <Bar dataKey="mat" name="MATER" stackId="a" fill="#15caca" />
                  <Bar dataKey="resto" name="Resto" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Costo spot */}
          {costoData.some((d) => d.costo > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Costo spot promedio ($/MWh)</p>
              <ResponsiveContainer height={180} width="100%">
                <LineChart data={costoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={60} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v: unknown) => [(v as number).toLocaleString("es-AR", { maximumFractionDigits: 0 }), "$/MWh"]} />
                  <Line dataKey="costo" stroke="#163759" strokeWidth={2} dot={{ r: 3, fill: "#163759" }} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
