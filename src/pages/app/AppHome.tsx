import { useCallback } from "react";
import { Activity, Gauge, Leaf, ShieldCheck } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { ChartCard, chartAxisTick, chartGridStroke, chartTooltipStyle } from "../../components/app/ChartCard";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { StatCard } from "../../components/app/StatCard";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { fetchInformeInicio } from "../../services/informeInicio";
import type { InformeInicioMix, InformeInicioResponse } from "../../types/informeInicio";
import { useAsyncData } from "../../hooks/useAsyncData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals).replace(".", ",");
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${fmt(n * 100)}%`;
}

function fmtGwh(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${fmt(n / 1000)} TWh`;
  return `${fmt(n)} GWh`;
}

function mesLabel(anioMes: string): string {
  const [y, m] = anioMes.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

// ---------------------------------------------------------------------------
// Alertas automáticas
// ---------------------------------------------------------------------------

function Alertas({ cliente }: { cliente: InformeInicioResponse["cliente"] }) {
  const alertas: { type: "danger" | "warning"; message: string }[] = [];

  const spotPct = cliente.demandaMes?.mix?.spotPct;
  if (spotPct != null && spotPct > 0.7) {
    alertas.push({ type: "danger", message: `Alta exposición spot este mes: ${fmtPct(spotPct)} de tu energía se compró en el mercado spot.` });
  }

  if (cliente.cumple27191 === false) {
    alertas.push({ type: "warning", message: "No estás cumpliendo el cupo renovable de la Ley 27.191 este año." });
  }

  if (alertas.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {alertas.map((a, i) => (
        <AlertaBanner key={i} type={a.type} message={a.message} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráfico: Demanda año móvil
// ---------------------------------------------------------------------------

function GraficoDemandaAnual({ serie }: { serie: InformeInicioResponse["cliente"]["demandaAnioMovil"] }) {
  const data = serie
    .filter((d) => d.mwh != null)
    .map((d) => ({ mes: mesLabel(d.anioMes), mwh: d.mwh ?? 0 }));

  if (data.length === 0) return null;

  const promedio = data.reduce((acc, d) => acc + d.mwh, 0) / data.length;

  return (
    <ChartCard
      title="Demanda — año móvil"
      hint="Energía mensual declarada ante CAMMESA durante los últimos 12 meses."
      right={<span className="text-xs text-slate-400">Promedio: <strong className="text-slate-600">{promedio.toLocaleString("es-AR", { maximumFractionDigits: 0 })} MWh</strong></span>}
    >
      <ResponsiveContainer height={220} width="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="demGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#15caca" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#15caca" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
          <XAxis dataKey="mes" tick={chartAxisTick} />
          <YAxis tick={chartAxisTick} width={55} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(v: unknown) => [`${(v as number).toLocaleString("es-AR")} MWh`, "Demanda"]}
          />
          <Area dataKey="mwh" fill="url(#demGrad)" stroke="#15caca" strokeWidth={2.5} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Gráfico: Mix spot / MATER / Resto — donut tipo barra horizontal segmentada
// ---------------------------------------------------------------------------

function GraficoMix({ mix }: { mix: InformeInicioMix | null }) {
  if (!mix) return null;
  const segments = [
    { name: "Spot",   value: (mix.spotPct ?? 0) * 100,           color: "#f97316" },
    { name: "MATER",  value: (mix.materEstimadoPct ?? 0) * 100,  color: "#15caca" },
    { name: "Resto",  value: (mix.plusPct ?? 0) * 100,           color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  if (segments.length === 0) return null;

  return (
    <ChartCard
      title="Mix de compra del mes"
      hint="Cómo se reparte tu energía del mes entre el mercado spot, contratos MATER y resto (bilaterales / plus)."
    >
      {/* Barra segmentada */}
      <div className="mb-5">
        <div className="flex h-10 w-full overflow-hidden rounded-xl bg-slate-100">
          {segments.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-center text-[11px] font-bold text-white transition-all"
              style={{ width: `${s.value}%`, backgroundColor: s.color, minWidth: s.value > 0 ? 32 : 0 }}
              title={`${s.name}: ${s.value.toFixed(1)}%`}
            >
              {s.value >= 8 ? `${Math.round(s.value)}%` : ""}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {segments.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <strong>{s.name}</strong>
              <span className="text-slate-400">{s.value.toFixed(1)}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* Detalle barras horizontal */}
      <ResponsiveContainer height={120} width="100%">
        <BarChart data={segments} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
          <XAxis type="number" tick={chartAxisTick} domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} width={56} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(1)}%`, name as string]}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {segments.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Contexto MEM
// ---------------------------------------------------------------------------

function ContextoMEM({ mercado }: { mercado: InformeInicioResponse["mercado"] }) {
  if (!mercado) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contexto MEM</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          Fuente {mercado.fuente} · {mercado.periodoCompleto ? "completo" : "parcial"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Generación total</p>
          <p className="mt-0.5 text-lg font-bold text-[#163759] tabular-nums">{fmtGwh(mercado.generacionTotalGwh)}</p>
          {mercado.generacionTotalYoyPct != null && (
            <p className={`text-xs font-semibold ${mercado.generacionTotalYoyPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {mercado.generacionTotalYoyPct >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(mercado.generacionTotalYoyPct))} YoY
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">MATER</p>
          <p className="mt-0.5 text-lg font-bold text-[#163759] tabular-nums">{fmtGwh(mercado.generacionMaterGwh)}</p>
          {mercado.pctRenovableSistema != null && (
            <p className="text-xs text-slate-500">{fmtPct(mercado.pctRenovableSistema)} del sistema</p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">Última publicación</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">
            {mercado.fuenteHasta ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppHome
// ---------------------------------------------------------------------------

const INITIAL_DATA: InformeInicioResponse = {
  contexto: { anio: 0, mes: 0, periodo: "", ultimoMesDisponible: "", warnings: [] },
  mercado: null,
  universo: {
    guma: { disponible: false, demandaTotalGwh: null, agentesCount: null, mix: { materEstimadoPct: null, spotPct: null, plusPct: null }, plusDisponible: false },
    gume: { disponible: false, demandaTotalGwh: null, agentesCount: null, mix: { materEstimadoPct: null, spotPct: null, plusPct: null }, plusDisponible: false },
    gudi: { disponible: false, demandaTotalGwh: null, agentesCount: null, mix: { materEstimadoPct: null, spotPct: null, plusPct: null }, plusDisponible: false },
  },
  cliente: {
    disponible: false,
    razonNoDisponible: null,
    nemo: "",
    descripcion: null,
    tipoAgente: null,
    agrupacion: null,
    demandaAnioMovil: [],
    demandaMes: null,
    demandaAnioMovilTotal: { totalGwh: 0, mix: { materEstimadoPct: null, spotPct: null, plusPct: null }, plusDisponible: false },
    pctRenovableAnio: null,
    cumple27191: null,
  },
};

export default function AppHome() {
  const { agente, ultimoMesDisponible } = useAppContext();

  const loader = useCallback(
    () => fetchInformeInicio({ nemo: agente?.nemo }),
    [agente?.nemo],
  );

  const { data, loading, error } = useAsyncData<InformeInicioResponse>(loader, INITIAL_DATA);

  if (loading) {
    return <LoadingScreen messages={["Cargando informe energético...", "Procesando datos..."]} />;
  }

  const { cliente, mercado, contexto } = data;
  const demandaMes = cliente.demandaMes;
  const spotPct = demandaMes?.mix?.spotPct ?? 0;

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#15caca]">Informe energético</p>
        <h1 className="mt-1 text-2xl font-bold text-[#163759] tracking-tight">
          {cliente.descripcion ?? agente?.descripcion ?? "—"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {cliente.tipoAgente ?? agente?.tipoAgente}
          {cliente.agrupacion ? ` · ${cliente.agrupacion}` : ""}
          {contexto.periodo ? ` · ${contexto.periodo}` : ""}
        </p>
      </div>

      {/* Error global */}
      {error && (
        <AlertaBanner type="warning" message={`No se pudo cargar el informe: ${error}`} />
      )}

      {/* Advertencias del servidor */}
      {contexto.warnings?.map((w, i) => (
        <AlertaBanner key={i} type="info" message={w} />
      ))}

      {/* Alertas automáticas */}
      {cliente.disponible && <Alertas cliente={cliente} />}

      {/* Cliente sin datos */}
      {!cliente.disponible && (
        <EmptyState
          icon="📊"
          title="Sin datos disponibles"
          description={
            cliente.razonNoDisponible ??
            "No encontramos datos para tu agente en el último período. Es posible que aún no estén procesados. Volvé en unos días."
          }
        />
      )}

      {/* Cards ejecutivas */}
      {cliente.disponible && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Demanda del mes"
            value={fmtGwh(demandaMes?.totalGwh)}
            sub="Total declarado"
            tone="teal"
            icon={<Activity size={16} />}
          />
          <StatCard
            label="Exposición Spot"
            value={fmtPct(spotPct)}
            sub={`${fmtPct(demandaMes?.mix?.materEstimadoPct)} MATER`}
            tone={spotPct > 0.7 ? "red" : spotPct > 0.4 ? "amber" : "teal"}
            icon={<Gauge size={16} />}
          />
          <StatCard
            label="Renovable anual"
            value={fmtPct(cliente.pctRenovableAnio)}
            sub="Año móvil"
            tone="emerald"
            icon={<Leaf size={16} />}
          />
          <StatCard
            label="Ley 27.191"
            value={
              cliente.cumple27191 === true ? "Cumple" :
              cliente.cumple27191 === false ? "No cumple" : "—"
            }
            sub="Cupo renovable"
            tone={
              cliente.cumple27191 === false ? "amber" :
              cliente.cumple27191 === true ? "emerald" : "default"
            }
            icon={<ShieldCheck size={16} />}
          />
        </div>
      )}

      {/* Gráficos */}
      {cliente.disponible && (
        <div className="grid gap-5 lg:grid-cols-2">
          <GraficoDemandaAnual serie={cliente.demandaAnioMovil} />
          <GraficoMix mix={demandaMes?.mix ?? null} />
        </div>
      )}

      {/* Contexto MEM */}
      {mercado && (
        <div className="mt-5">
          <ContextoMEM mercado={mercado} />
        </div>
      )}

      {/* Footer de datos */}
      <DataFooter ultimoMesDisponible={ultimoMesDisponible || contexto.ultimoMesDisponible} />
    </div>
  );
}
