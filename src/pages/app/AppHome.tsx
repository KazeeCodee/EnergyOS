import { useCallback } from "react";
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
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
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
  return `${fmt(n)}%`;
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
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  highlight,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  color?: "teal" | "red" | "amber" | "default";
}) {
  const colors = {
    teal:    "border-t-[#15caca] bg-[#15caca]/5",
    red:     "border-t-red-400 bg-red-50",
    amber:   "border-t-amber-400 bg-amber-50",
    default: "border-t-slate-200 bg-white",
  };
  return (
    <div
      className={`rounded-2xl border border-slate-200 border-t-4 p-5 shadow-sm ${colors[color ?? "default"]} ${highlight ? "ring-2 ring-[#15caca]/30" : ""}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#163759]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alertas automáticas
// ---------------------------------------------------------------------------

function Alertas({ cliente }: { cliente: InformeInicioResponse["cliente"] }) {
  const alertas: { type: "danger" | "warning"; message: string }[] = [];

  const spotPct = cliente.demandaMes?.mix?.spotPct;
  if (spotPct != null && spotPct > 70) {
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-700 mb-4">Demanda — Año móvil (MWh)</p>
      <ResponsiveContainer height={200} width="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="demGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#15caca" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#15caca" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={50} />
          <Tooltip
            contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }}
            formatter={(v: unknown) => [`${(v as number).toLocaleString("es-AR")} MWh`, "Demanda"]}
          />
          <Area dataKey="mwh" fill="url(#demGrad)" stroke="#15caca" strokeWidth={2} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráfico: Mix spot / MAT
// ---------------------------------------------------------------------------

function GraficoMix({ mix }: { mix: InformeInicioMix | null }) {
  if (!mix) return null;
  const data = [
    { name: "Spot", value: mix.spotPct ?? 0, color: "#f97316" },
    { name: "MATER", value: mix.materEstimadoPct ?? 0, color: "#15caca" },
    { name: "Resto", value: mix.plusPct ?? 0, color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-700 mb-4">Mix de compra (% del mes)</p>
      <ResponsiveContainer height={160} width="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} width={48} />
          <Tooltip
            contentStyle={{ borderRadius: 10, fontSize: 12 }}
            formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(1)}%`, name as string]}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contexto MEM
// ---------------------------------------------------------------------------

function ContextoMEM({ mercado }: { mercado: InformeInicioResponse["mercado"] }) {
  if (!mercado) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Contexto MEM</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Generación total</p>
          <p className="font-bold text-[#163759]">{fmtGwh(mercado.generacionTotalGwh)}</p>
          {mercado.generacionTotalYoyPct != null && (
            <p className={`text-xs font-medium ${mercado.generacionTotalYoyPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {mercado.generacionTotalYoyPct >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(mercado.generacionTotalYoyPct))} YoY
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">MATER</p>
          <p className="font-bold text-[#163759]">{fmtGwh(mercado.generacionMaterGwh)}</p>
          {mercado.pctRenovableSistema != null && (
            <p className="text-xs text-slate-500">{fmtPct(mercado.pctRenovableSistema)} del sistema</p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">Fuente</p>
          <p className="text-sm font-semibold text-slate-700">{mercado.fuente}</p>
          <p className="text-xs text-slate-400">{mercado.periodoCompleto ? "Período completo" : "Parcial"}</p>
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

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#163759]">
          {cliente.descripcion ?? agente?.descripcion ?? "Informe Energético"}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatCard
            label="Demanda del mes"
            value={fmtGwh(demandaMes?.totalGwh)}
            sub="Total declarado CAMMESA"
            color="teal"
          />
          <StatCard
            label="Exposición Spot"
            value={fmtPct(demandaMes?.mix?.spotPct)}
            sub={`${fmtPct(demandaMes?.mix?.materEstimadoPct)} MATER`}
            color={
              (demandaMes?.mix?.spotPct ?? 0) > 70 ? "red" :
              (demandaMes?.mix?.spotPct ?? 0) > 40 ? "amber" : "teal"
            }
          />
          <StatCard
            label="Renovable anual"
            value={fmtPct(cliente.pctRenovableAnio)}
            sub="Año móvil"
            color="default"
          />
          <StatCard
            label="Ley 27.191"
            value={
              cliente.cumple27191 === true ? "Cumple ✅" :
              cliente.cumple27191 === false ? "No cumple ⚠️" : "—"
            }
            sub="Cupo renovable"
            color={
              cliente.cumple27191 === false ? "amber" :
              cliente.cumple27191 === true ? "teal" : "default"
            }
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
