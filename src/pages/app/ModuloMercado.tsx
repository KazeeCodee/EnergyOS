import { useCallback } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchMercadoContexto } from "../../services/mercadoContexto";
import type { MercadoContextoResponse } from "../../types/mercadoContexto";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
function fechaLabel(f: string) {
  return new Date(f).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");
}

const GEN_COLORS: Record<string, string> = {
  nuclear: "#6366f1",
  termico: "#f97316",
  renovableHidro50mw: "#15caca",
  renovableLey26190: "#10b981",
  importacion: "#94a3b8",
};

const GEN_LABELS: Record<string, string> = {
  nuclear: "Nuclear", termico: "Térmico", renovableHidro50mw: "Hidro ≥50MW",
  renovableLey26190: "Renovable Ley 26.190", importacion: "Importación",
};

const EMPTY: MercadoContextoResponse = {
  fuente: "memnet", secciones: [], dias: 7, meses: 3,
  demanda: [], generacion: [], manufacturero: [],
  resumen: { ultimoDatoDemanda: null, ultimoDatoGeneracion: null, renovableSistemaPctUltimoDato: null, ultimoPeriodoManufacturero: null, sectorIndustrialLider: null, tendenciaManufactureraYoyPct: null },
  warnings: [],
};

export default function ModuloMercado() {
  const { ultimoMesDisponible } = useAppContext();

  const loader = useCallback(() => fetchMercadoContexto({ secciones: ["generacion", "demanda", "manufacturero"], dias: 14, meses: 6 }), []);
  const { data, loading, error } = useAsyncData<MercadoContextoResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando contexto del mercado eléctrico..."]} />;

  const resumen = data.resumen;
  const sinDatos = data.generacion.length === 0 && data.demanda.length === 0;

  // Generación: último punto
  const ultimaGen = data.generacion[data.generacion.length - 1];
  const genPieData = ultimaGen
    ? Object.entries(ultimaGen.porcentajes)
        .filter(([, v]) => v != null && v > 0)
        .map(([k, v]) => ({ name: GEN_LABELS[k] ?? k, value: v as number, color: GEN_COLORS[k] ?? "#e2e8f0" }))
    : [];

  // Demanda últimos 14 días
  const demandaData = data.demanda.slice(-14).map((d) => ({
    fecha: fechaLabel(d.fecha), hoy: d.hoy, ayer: d.ayer,
  }));

  return (
    <div>
      <ModuleHeader
        title="Mercado Eléctrico"
        subtitle="Módulo 5 · Contexto MEM, generación, demanda y manufactura"
        tooltip="El MEM (Mercado Eléctrico Mayorista) es donde se transan la generación y demanda de energía eléctrica en Argentina. CAMMESA opera como administrador del mercado."
      />

      {error && <AlertaBanner type="warning" message={error} />}
      {data.warnings.map((w, i) => <AlertaBanner key={i} type="info" message={w} />)}

      {sinDatos ? (
        <EmptyState icon="⚡" title="Sin datos de mercado" description="No hay datos disponibles del mercado eléctrico por el momento. Volvé más tarde." />
      ) : (
        <>
          {/* Cards resumen */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "% Renovable sistema", value: fmtPct(resumen.renovableSistemaPctUltimoDato), sub: "Último dato disponible" },
              { label: "Fuente", value: data.fuente === "memnet" ? "MEMNET" : "Operaciones", sub: `Datos de generación` },
              { label: "Sector líder", value: resumen.sectorIndustrialLider?.sector ?? "—", sub: resumen.sectorIndustrialLider ? `${resumen.sectorIndustrialLider.valor.toLocaleString("es-AR")} GWh` : "" },
              { label: "Variación manuf.", value: fmtPct(resumen.tendenciaManufactureraYoyPct), sub: "YoY últimos 6 meses" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-t-4 border-t-[#15caca] bg-[#15caca]/5 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
                <p className="mt-2 text-lg font-bold text-[#163759]">{c.value}</p>
                {c.sub && <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>}
              </div>
            ))}
          </div>

          {/* Mix de generación */}
          {genPieData.length > 0 && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Mix de generación — último dato {resumen.ultimoDatoGeneracion ? `(${fechaLabel(resumen.ultimoDatoGeneracion)})` : ""}
              </p>
              <ResponsiveContainer height={200} width="100%">
                <BarChart data={genPieData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={110} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {genPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Demanda diaria */}
          {demandaData.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-4">Demanda diaria — Hoy vs. ayer (MW)</p>
              <ResponsiveContainer height={200} width="100%">
                <LineChart data={demandaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={55} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v: unknown, n: unknown) => [`${(v as number)?.toLocaleString("es-AR")} MW`, n === "hoy" ? "Hoy" : "Ayer"]} />
                  <Line dataKey="hoy" name="hoy" stroke="#163759" strokeWidth={2} dot={false} type="monotone" />
                  <Line dataKey="ayer" name="ayer" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} fuente="CAMMESA / MEMNET" />
    </div>
  );
}
