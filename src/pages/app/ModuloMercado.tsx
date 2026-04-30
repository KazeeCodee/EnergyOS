import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { StatCard } from "../../components/app/StatCard";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchMercadoContexto } from "../../services/mercadoContexto";
import type { MercadoContextoResponse } from "../../types/mercadoContexto";

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n)}%`; }
function fmtRatioPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n * 100)}%`; }
function fechaLabel(f: string) {
  return new Date(f).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");
}
function periodoLabel(p: string) {
  // Manufacturero viene como YYYY-MM
  const [y, m] = p.split("-");
  if (!y || !m) return p;
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" }).replace(".", "");
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
  fuente: "memnet", secciones: [], dias: 14, meses: 6,
  demanda: [], generacion: [], manufacturero: [],
  resumen: { ultimoDatoDemanda: null, ultimoDatoGeneracion: null, renovableSistemaPctUltimoDato: null, ultimoPeriodoManufacturero: null, sectorIndustrialLider: null, tendenciaManufactureraYoyPct: null },
  warnings: [],
};

const DIAS_PRESETS = [7, 14, 30, 60, 90];
const MESES_PRESETS = [3, 6, 12, 24];

export default function ModuloMercado() {
  const { ultimoMesDisponible } = useAppContext();
  const [dias, setDias] = useState(14);
  const [mesesIndustria, setMesesIndustria] = useState(6);

  const loader = useCallback(
    () => fetchMercadoContexto({ secciones: ["generacion", "demanda", "manufacturero"], dias, meses: mesesIndustria }),
    [dias, mesesIndustria],
  );
  const { data, loading, error } = useAsyncData<MercadoContextoResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando contexto del mercado eléctrico..."]} />;

  const resumen = data.resumen;
  const sinDatos = data.generacion.length === 0 && data.demanda.length === 0;

  const ultimaGen = data.generacion[data.generacion.length - 1];
  const genData = ultimaGen
    ? Object.entries(ultimaGen.porcentajes)
        .filter(([, v]) => v != null && v > 0)
        .map(([k, v]) => ({ name: GEN_LABELS[k] ?? k, value: v as number, color: GEN_COLORS[k] ?? "#e2e8f0" }))
        .sort((a, b) => b.value - a.value)
    : [];

  const totalGenPct = genData.reduce((a, d) => a + d.value, 0);

  const demandaData = data.demanda.slice(-dias).map((d) => ({
    fecha: fechaLabel(d.fecha), hoy: d.hoy, ayer: d.ayer, prevista: d.prevista,
  }));

  // Última fila manufacturero — top 5 sectores
  const ultimoManuf = data.manufacturero[data.manufacturero.length - 1];
  const topSectores = ultimoManuf
    ? Object.entries(ultimoManuf)
        .filter(([k, v]) => k !== "periodo" && k !== "totalIndustria" && typeof v === "number")
        .map(([k, v]) => ({
          name: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
          valor: v as number,
        }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 6)
    : [];

  // Evolución industria total
  const industriaSerie = data.manufacturero.map((p) => ({
    mes: periodoLabel(p.periodo),
    total: p.totalIndustria ?? 0,
  })).filter((d) => d.total > 0);

  return (
    <div>
      <ModuleHeader
        title="Mercado Eléctrico"
        subtitle="Contexto MEM, generación, demanda nacional y manufactura"
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
            <StatCard
              label="% Renovable sistema"
              value={fmtPct(resumen.renovableSistemaPctUltimoDato)}
              sub="Último dato disponible"
              tone="emerald"
            />
            <StatCard
              label="Fuente"
              value={data.fuente === "memnet" ? "MEMNET" : "Operaciones"}
              sub="Datos de generación"
            />
            <StatCard
              label="Sector industrial líder"
              value={resumen.sectorIndustrialLider?.sector ?? "—"}
              sub={resumen.sectorIndustrialLider ? `${resumen.sectorIndustrialLider.valor.toLocaleString("es-AR")} GWh` : ""}
              tone="indigo"
            />
            <StatCard
              label="Variación manufacturera"
              value={fmtRatioPct(resumen.tendenciaManufactureraYoyPct)}
              sub={`YoY ${mesesIndustria} meses`}
              tone={
                resumen.tendenciaManufactureraYoyPct == null ? "default" :
                resumen.tendenciaManufactureraYoyPct >= 0 ? "emerald" : "amber"
              }
              trend={resumen.tendenciaManufactureraYoyPct != null ? { value: resumen.tendenciaManufactureraYoyPct * 100, label: "YoY" } : undefined}
            />
          </div>

          {/* Mix de generación */}
          {genData.length > 0 && (
            <ChartCard
              title={`Mix de generación nacional${resumen.ultimoDatoGeneracion ? ` — ${fechaLabel(resumen.ultimoDatoGeneracion)}` : ""}`}
              hint="Composición de la energía generada en el país por tipo de fuente. La barra superior es una vista rápida; abajo el detalle ordenado."
              className="mb-5"
            >
              {/* Barra apilada superior */}
              <div className="mb-4 flex h-9 w-full overflow-hidden rounded-xl bg-slate-100">
                {genData.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ width: `${(s.value / totalGenPct) * 100}%`, backgroundColor: s.color, minWidth: 12 }}
                    title={`${s.name}: ${s.value.toFixed(1)}%`}
                  >
                    {s.value >= 8 ? `${Math.round(s.value)}%` : ""}
                  </div>
                ))}
              </div>

              {/* Detalle bar */}
              <ResponsiveContainer height={Math.max(160, genData.length * 36)} width="100%">
                <BarChart data={genData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                  <XAxis type="number" tick={chartAxisTick} unit="%" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={130} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, "Participación"]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {genData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Demanda diaria con filtro de días */}
          {data.demanda.length > 0 && (
            <ChartCard
              title="Demanda diaria nacional"
              hint="Comparación día a día entre la demanda de hoy, la de ayer y la prevista por CAMMESA."
              right={
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Días</span>
                  {DIAS_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDias(d)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                        dias === d
                          ? "bg-[#163759] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              }
              className="mb-5"
            >
              <ResponsiveContainer height={220} width="100%">
                <LineChart data={demandaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="fecha" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} width={60} tickFormatter={(v) => (v as number).toLocaleString("es-AR")} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => [`${(v as number)?.toLocaleString("es-AR")} MW`, n === "hoy" ? "Hoy" : n === "ayer" ? "Ayer" : "Prevista"]}
                  />
                  <Line dataKey="prevista" name="prevista" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="2 3" dot={false} type="monotone" connectNulls />
                  <Line dataKey="ayer" name="ayer" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} type="monotone" connectNulls />
                  <Line dataKey="hoy" name="hoy" stroke="#163759" strokeWidth={2.5} dot={{ r: 3, fill: "#163759" }} activeDot={{ r: 5 }} type="monotone" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Manufacturera — sectores top + evolución */}
          {(topSectores.length > 0 || industriaSerie.length > 0) && (
            <div className="grid gap-5 lg:grid-cols-2">
              {topSectores.length > 0 && (
                <ChartCard
                  title="Top sectores industriales"
                  hint="Sectores con mayor consumo eléctrico en el último período publicado por CAMMESA."
                  right={resumen.ultimoPeriodoManufacturero ? (
                    <span className="text-[11px] font-semibold text-slate-500">{periodoLabel(resumen.ultimoPeriodoManufacturero)}</span>
                  ) : undefined}
                >
                  <ResponsiveContainer height={Math.max(180, topSectores.length * 34)} width="100%">
                    <BarChart data={topSectores} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" tick={chartAxisTick} tickFormatter={(v) => (v as number).toLocaleString("es-AR")} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} width={130} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [`${(v as number).toLocaleString("es-AR")} GWh`, "Consumo"]} />
                      <Bar dataKey="valor" fill="#15caca" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {industriaSerie.length > 1 && (
                <ChartCard
                  title="Evolución industria total"
                  hint="Consumo agregado de la industria manufacturera, mes a mes."
                  right={
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Meses</span>
                      {MESES_PRESETS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMesesIndustria(m)}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                            mesesIndustria === m
                              ? "bg-[#163759] text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <ResponsiveContainer height={Math.max(180, topSectores.length * 34)} width="100%">
                    <LineChart data={industriaSerie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                      <XAxis dataKey="mes" tick={chartAxisTick} />
                      <YAxis tick={chartAxisTick} width={60} tickFormatter={(v) => (v as number).toLocaleString("es-AR")} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [`${(v as number).toLocaleString("es-AR")} GWh`, "Industria total"]} />
                      <Line dataKey="total" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1" }} type="monotone" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} fuente="CAMMESA / MEMNET" />
    </div>
  );
}
