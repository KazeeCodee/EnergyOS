import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowRight, BarChart3, FileSearch, Gauge, History, Leaf, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useSearchParams } from "react-router-dom";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { ChartCard, chartAxisTick, chartGridStroke, chartTooltipStyle } from "../../components/app/ChartCard";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { StatCard } from "../../components/app/StatCard";
import { Skeleton, SkeletonChartCard, SkeletonStatCard } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { fetchAuditoriaDte } from "../../services/auditoriaDte";
import { fetchCompliance27191 } from "../../services/compliance27191";
import { fetchExposicionSpotMensual } from "../../services/exposicionSpot";
import { fetchFactorCargaMensual } from "../../services/factorCarga";
import { fetchHistoriaEnergetica } from "../../services/historiaEnergetica";
import { fetchInformeInicio } from "../../services/informeInicio";
import type { AuditoriaDteResponse } from "../../types/auditoriaDte";
import type { Compliance27191Response } from "../../types/compliance27191";
import type { ExposicionSpotResponse } from "../../types/exposicionSpot";
import type { FactorCargaResponse } from "../../types/factorCarga";
import type { HistoriaEnergeticaResponse } from "../../types/historiaEnergetica";
import type { InformeInicioMix, InformeInicioResponse } from "../../types/informeInicio";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getCurrentTrial } from "../../utils/session";
import { getPremiumModuleCopy } from "../../utils/trialAccess";
import {
  buildExecutiveInsights,
  buildModulePreviewState,
  type DisclosureMode,
  formatPct,
  selectFeaturedModule,
  type HomeAuditInput,
  type HomeComplianceInput,
  type HomeFactorInput,
  type HomeModuleKey,
  type HomeSpotInput,
  type ModulePreview,
} from "./AppHome.helpers";

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

function pctTick(value: unknown): string {
  return `${Number(value).toFixed(0)}%`;
}

function mercadoTipoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    termico: "Térmico",
    nuclear: "Nuclear",
    importacion: "Importación",
    renovable_hidro_50mw: "Renovable hidro",
    renovable_ley_26190: "Renovable Ley 26.190",
    renovableLey26190: "Renovable Ley 26.190",
    renovableHidro50mw: "Renovable hidro",
  };
  return labels[tipo] ?? tipo.replaceAll("_", " ");
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

const EMPTY_SPOT: ExposicionSpotResponse = {
  nemo: "",
  meses: 12,
  autorizados: [],
  resumen: { meses: 0, demandaRealMwh: 0, compraSpotMwh: 0, demandaContratadaMwh: 0, pctSpot: null, pctMat: null, spotPesos: 0, costoSpotPromedioPesosMwh: null, subContratoMwh: 0, sobreContratoMwh: 0 },
  serie: [],
};

const EMPTY_COMPLIANCE: Compliance27191Response = {
  nemo: "",
  meses: 12,
  autorizados: [],
  resumen: { meses: 0, ultimoMes: null, pctRenovablePromedio: null, renovableContratadoMwh: 0, brechaMwh: 0, multaEstimadaPesos: 0, anioEnCurso: null, brechaAnioEnCursoMwh: 0, multaAnioEnCursoPesos: 0, cumpleYtd: false, brechaYtdMwh: null },
  serie: [],
  notas: { multa: "", obligacion: "" },
};

const EMPTY_FACTOR: FactorCargaResponse = {
  nemo: "",
  meses: 12,
  autorizados: [],
  resumen: { meses: 0, mesesConPvr: 0, ultimoMes: null, factorCargaPct: null, factorCargaMetodo: "no_disponible_sin_potencia_maxima", pctPicoPromedio: null, pctVallePromedio: null, pctRestoPromedio: null, ratioPicoVallePromedio: null, pctPicoPercentilPromedio: null, estacionalidadYoyUltimoMes: null, calidadDatoUltimoMes: null },
  serie: [],
  benchmark: [],
  notas: { factorCarga: "" },
};

const EMPTY_HISTORY: HistoriaEnergeticaResponse = {
  nemo: "",
  meses: 12,
  autorizados: [],
  serieMensual: [],
  heatmap: [],
  resumen: null,
};

const EMPTY_AUDIT: AuditoriaDteResponse = {
  nemo: "",
  meses: 12,
  autorizados: [],
  resumen: { meses: 0, ultimoMes: null, facturaTotalPesos: 0, importeRevisablePesos: 0, mesesConRevision: 0, costoPromedioPesosMwh: null },
  serie: [],
  conceptosUltimoMes: [],
  notas: { alcance: "", estado: "" },
};

function inputFromSpot(data: ExposicionSpotResponse): HomeSpotInput {
  return {
    pctSpot: data.resumen.pctSpot,
    pctMat: data.resumen.pctMat,
    costoSpotPromedioPesosMwh: data.resumen.costoSpotPromedioPesosMwh,
    spotPesos: data.resumen.spotPesos,
  };
}

function inputFromCompliance(data: Compliance27191Response): HomeComplianceInput {
  return {
    pctRenovablePromedio: data.resumen.pctRenovablePromedio,
    cumpleYtd: data.resumen.cumpleYtd,
    brechaYtdMwh: data.resumen.brechaYtdMwh,
    multaEstimadaPesos: data.resumen.multaEstimadaPesos,
  };
}

function inputFromFactor(data: FactorCargaResponse): HomeFactorInput {
  return {
    pctPicoPromedio: data.resumen.pctPicoPromedio,
    pctVallePromedio: data.resumen.pctVallePromedio,
    ratioPicoVallePromedio: data.resumen.ratioPicoVallePromedio,
    pctPicoPercentilPromedio: data.resumen.pctPicoPercentilPromedio,
  };
}

function inputFromAudit(data: AuditoriaDteResponse): HomeAuditInput {
  return {
    facturaTotalPesos: data.resumen.facturaTotalPesos,
    importeRevisablePesos: data.resumen.importeRevisablePesos,
    mesesConRevision: data.resumen.mesesConRevision,
    meses: data.resumen.meses,
    costoPromedioPesosMwh: data.resumen.costoPromedioPesosMwh,
  };
}

function statusClasses(status: ModulePreview["status"]) {
  if (status === "risk") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "watch") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function MiniEmpty({ label, height = 138 }: { label: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400"
      style={{ height }}
    >
      {label}
    </div>
  );
}

function ExecutiveInsights({ insights }: { insights: ReturnType<typeof buildExecutiveInsights> }) {
  if (insights.length === 0) return null;

  const toneMap = {
    danger: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  } satisfies Record<string, string>;

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#163759] text-white">
          <AlertTriangle size={17} />
        </span>
        <div>
          <h2 className="text-base font-bold text-[#163759]">Lectura ejecutiva</h2>
          <p className="text-xs text-slate-500">Senales que conviene mirar antes de abrir cada modulo.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => (
          <article key={insight.title} className={`rounded-xl border px-4 py-3 ${toneMap[insight.tone]}`}>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-75">{insight.title}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{insight.metric}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{insight.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PremiumUpsellNotice({
  moduleKey,
  onClose,
}: {
  moduleKey: string | null;
  onClose: () => void;
}) {
  const copy = getPremiumModuleCopy(moduleKey);
  if (!copy) return null;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
            {copy.eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold text-[#163759]">{copy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">{copy.body}</p>
          <p className="mt-2 text-sm font-semibold text-amber-900">
            Tu cuenta de prueba incluye Inicio y Ajustes. Para desbloquear este modulo, contactanos y activamos el acceso premium.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            className="inline-flex items-center justify-center rounded-xl bg-[#163759] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f2943]"
            href={`mailto:soporte@energyos.com.ar?subject=${encodeURIComponent(`Quiero activar ${copy.title}`)}`}
          >
            Contactar
          </a>
          <button
            className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
            onClick={onClose}
            type="button"
          >
            Seguir viendo inicio
          </button>
        </div>
      </div>
    </section>
  );
}

function SpotPreviewChart({ data, height = 138 }: { data: ExposicionSpotResponse; height?: number }) {
  const chartData = data.serie.slice(-6).map((p) => ({
    mes: mesLabel(p.periodo),
    spot: (p.pctSpot ?? 0) * 100,
    mat: (p.pctMat ?? 0) * 100,
  }));
  if (chartData.length === 0) return <MiniEmpty height={height} label="Sin serie spot" />;

  return (
    <ResponsiveContainer height={height} width="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
        <XAxis dataKey="mes" tick={chartAxisTick} />
        <YAxis tick={chartAxisTick} tickFormatter={pctTick} width={44} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n === "spot" ? "Spot" : "MATER"]} />
        <Bar dataKey="spot" fill="#f97316" radius={[4, 4, 0, 0]} />
        <Bar dataKey="mat" fill="#15caca" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CompliancePreviewChart({ data, height = 138 }: { data: Compliance27191Response; height?: number }) {
  const chartData = data.serie.slice(-6).map((p) => ({
    mes: mesLabel(p.periodo),
    real: (p.pctRenovableYtd ?? p.pctRenovableReal ?? 0) * 100,
    obligacion: (p.obligacionPct ?? 0) * 100,
  }));
  if (chartData.length === 0) return <MiniEmpty height={height} label="Sin serie renovable" />;

  return (
    <ResponsiveContainer height={height} width="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
        <XAxis dataKey="mes" tick={chartAxisTick} />
        <YAxis tick={chartAxisTick} tickFormatter={pctTick} width={44} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n === "real" ? "Renovable" : "Obligacion"]} />
        <Line dataKey="real" stroke="#10b981" strokeWidth={2.5} dot={false} type="monotone" />
        <Line dataKey="obligacion" stroke="#64748b" strokeDasharray="4 3" strokeWidth={1.8} dot={false} type="monotone" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function FactorPreviewChart({ data, height = 138 }: { data: FactorCargaResponse; height?: number }) {
  const last = data.serie.at(-1);
  if (!last) return <MiniEmpty height={height} label="Sin perfil horario" />;
  const rows = [
    { name: "Pico", value: (last.pctPico ?? 0) * 100, color: "#f97316" },
    { name: "Valle", value: (last.pctValle ?? 0) * 100, color: "#15caca" },
    { name: "Resto", value: (last.pctResto ?? 0) * 100, color: "#94a3b8" },
  ];

  return (
    <div className="flex flex-col justify-center gap-3" style={{ height }}>
      {rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>{row.name}</span>
            <span>{row.value.toFixed(1).replace(".", ",")}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, row.value)}%`, backgroundColor: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryPreviewChart({ data, height = 138 }: { data: HistoriaEnergeticaResponse; height?: number }) {
  const chartData = data.serieMensual.slice(-12).map((p) => ({
    mes: mesLabel(p.periodo),
    mwh: p.demandaMwh ?? 0,
  }));
  if (chartData.length === 0) return <MiniEmpty height={height} label="Sin historia" />;
  const promedio = chartData.reduce((sum, row) => sum + row.mwh, 0) / chartData.length;

  return (
    <ResponsiveContainer height={height} width="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
        <XAxis dataKey="mes" tick={chartAxisTick} interval={2} />
        <YAxis tick={chartAxisTick} width={42} />
        <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [`${(v as number).toLocaleString("es-AR")} MWh`, "Demanda"]} />
        <ReferenceLine y={promedio} stroke="#94a3b8" strokeDasharray="4 3" />
        <Area dataKey="mwh" fill="#15caca" fillOpacity={0.16} stroke="#0e8a8a" strokeWidth={2.2} type="monotone" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AuditPreviewChart({ data, height = 138, disclosure = "full" }: { data: AuditoriaDteResponse; height?: number; disclosure?: DisclosureMode }) {
  const rawRows = data.serie.slice(-6);
  const maxFactura = Math.max(...rawRows.map((p) => p.facturaTotalPesos ?? 0), 1);
  const chartData = rawRows.map((p) => ({
    mes: mesLabel(p.periodo),
    factura: disclosure === "preview" ? ((p.facturaTotalPesos ?? 0) / maxFactura) * 100 : (p.facturaTotalPesos ?? 0) / 1_000_000,
    revisar: disclosure === "preview" ? ((p.importeRevisablePesos ?? 0) / maxFactura) * 100 : (p.importeRevisablePesos ?? 0) / 1_000_000,
  }));
  if (chartData.length === 0) return <MiniEmpty height={height} label="Sin DTE" />;

  return (
    <ResponsiveContainer height={height} width="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
        <XAxis dataKey="mes" tick={chartAxisTick} />
        <YAxis tick={chartAxisTick} width={44} tickFormatter={(value) => disclosure === "preview" ? `${Number(value).toFixed(0)}` : `${Number(value).toFixed(0)}M`} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(v: unknown, n: unknown) => [
            disclosure === "preview" ? `Índice ${(v as number).toFixed(0)}` : `${(v as number).toFixed(1)} M$`,
            n === "revisar" ? "A revisar" : "DTE",
          ]}
        />
        <Bar dataKey="factura" fill="#163759" radius={[4, 4, 0, 0]} />
        <Bar dataKey="revisar" fill="#f97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MarketPreviewChart({ mercado, height = 138 }: { mercado: InformeInicioResponse["mercado"]; height?: number }) {
  const rows = mercado?.generacionPorTipo
    .filter((row) => row.pct != null && row.pct > 0)
    .slice(0, 5)
    .map((row, index) => ({
      name: mercadoTipoLabel(row.tipo),
      value: row.pct ?? 0,
      color: ["#163759", "#15caca", "#10b981", "#f97316", "#94a3b8"][index] ?? "#cbd5e1",
    })) ?? [];
  if (rows.length === 0) return <MiniEmpty height={height} label="Sin mix MEM" />;

  const effectiveHeight = Math.max(height, rows.length * 31);

  return (
    <div className="flex flex-col justify-center gap-2.5" style={{ height: effectiveHeight }}>
      {rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
            <span className="truncate">{row.name}</span>
            <span>{fmtPct(row.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, row.value * 100)}%`, backgroundColor: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ModulePreviewCard({
  title,
  subtitle,
  icon,
  preview,
  to,
  children,
  featured = false,
  layout = "card",
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  preview: ModulePreview;
  to: string;
  children: ReactNode;
  featured?: boolean;
  layout?: "card" | "strip";
}) {
  if (layout === "strip") {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.35fr] lg:items-center">
          <div>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#163759]">
                  {icon}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#163759]">{title}</h3>
                  <p className="text-sm text-slate-500">{subtitle}</p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses(preview.status)}`}>
                {preview.status === "risk" ? "Riesgo" : preview.status === "watch" ? "Mirar" : preview.status === "ok" ? "OK" : "S/D"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Indicador</p>
                <p className="mt-1 text-2xl font-bold text-[#163759] tabular-nums">{preview.primary}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lectura</p>
                <p className="mt-1 text-base font-semibold text-slate-700">{preview.secondary}</p>
              </div>
            </div>

            <Link className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0e8a8a] hover:text-[#163759]" to={to}>
              Ver modulo <ArrowRight size={14} />
            </Link>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-2">
            {children}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`rounded-2xl border bg-white shadow-sm ${
        featured ? "border-[#15caca]/40 p-6 ring-1 ring-[#15caca]/20" : "border-slate-200 p-4"
      }`}
    >
      <div className={`mb-3 flex items-start justify-between gap-3 ${featured ? "md:mb-4" : ""}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#163759] ${featured ? "h-11 w-11" : "h-9 w-9"}`}>
            {icon}
          </span>
          <div className="min-w-0">
            {featured && (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#15caca]">
                Foco principal del mes
              </p>
            )}
            <h3 className={`${featured ? "text-xl" : "text-sm"} truncate font-bold text-[#163759]`}>{title}</h3>
            <p className={`${featured ? "text-sm" : "text-xs"} text-slate-500`}>{subtitle}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClasses(preview.status)}`}>
          {preview.status === "risk" ? "Riesgo" : preview.status === "watch" ? "Mirar" : preview.status === "ok" ? "OK" : "S/D"}
        </span>
      </div>
      <div className={`mb-3 grid grid-cols-2 gap-3 ${featured ? "md:max-w-xl" : ""}`}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Indicador</p>
          <p className={`mt-0.5 font-bold text-[#163759] tabular-nums ${featured ? "text-3xl" : "text-lg"}`}>{preview.primary}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lectura</p>
          <p className={`mt-0.5 truncate font-semibold text-slate-600 ${featured ? "text-base" : "text-sm"}`}>{preview.secondary}</p>
        </div>
      </div>
      <div className={featured ? "mt-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-3" : ""}>
        {children}
      </div>
      <Link className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0e8a8a] hover:text-[#163759]" to={to}>
        Ver modulo <ArrowRight size={14} />
      </Link>
    </article>
  );
}

export default function AppHome() {
  const { agente, ultimoMesDisponible, informe: informeFromContext } = useAppContext();
  const [isTrial, setIsTrial] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    getCurrentTrial().then((trial) => {
      if (active) setIsTrial(Boolean(trial));
    });
    return () => {
      active = false;
    };
  }, []);

  // Si AppContext ya precargó el informe, usarlo. Sino, fetch como fallback.
  const loader = useCallback(
    () => fetchInformeInicio({ nemo: agente?.nemo }),
    [agente?.nemo],
  );

  const { data: fetched, loading, error } = useAsyncData<InformeInicioResponse>(
    loader,
    INITIAL_DATA,
    { skip: Boolean(informeFromContext) },
  );

  const data = informeFromContext ?? fetched;
  const isLoading = !informeFromContext && loading;

  const { cliente, mercado, contexto } = data;
  const demandaMes = cliente.demandaMes;
  const spotPct = demandaMes?.mix?.spotPct ?? 0;
  const disclosure: DisclosureMode = isTrial ? "preview" : "full";
  const premiumModuleKey = isTrial ? searchParams.get("premium") : null;
  const canLoadModulePreviews = Boolean(agente?.nemo && cliente.disponible);

  const spotLoader = useCallback(
    () => fetchExposicionSpotMensual({ nemo: agente?.nemo, meses: 12 }),
    [agente?.nemo],
  );
  const complianceLoader = useCallback(
    () => fetchCompliance27191({ nemo: agente?.nemo, meses: 12 }),
    [agente?.nemo],
  );
  const factorLoader = useCallback(
    () => fetchFactorCargaMensual({ nemo: agente?.nemo, meses: 12 }),
    [agente?.nemo],
  );
  const historyLoader = useCallback(
    () => fetchHistoriaEnergetica({ nemo: agente?.nemo, meses: 12 }),
    [agente?.nemo],
  );
  const auditLoader = useCallback(
    () => fetchAuditoriaDte({ nemo: agente?.nemo, meses: 12 }),
    [agente?.nemo],
  );

  const { data: spotData, error: spotError } = useAsyncData<ExposicionSpotResponse>(
    spotLoader,
    EMPTY_SPOT,
    { skip: !canLoadModulePreviews },
  );
  const { data: complianceData, error: complianceError } = useAsyncData<Compliance27191Response>(
    complianceLoader,
    EMPTY_COMPLIANCE,
    { skip: !canLoadModulePreviews },
  );
  const { data: factorData, error: factorError } = useAsyncData<FactorCargaResponse>(
    factorLoader,
    EMPTY_FACTOR,
    { skip: !canLoadModulePreviews },
  );
  const { data: historyData, error: historyError } = useAsyncData<HistoriaEnergeticaResponse>(
    historyLoader,
    EMPTY_HISTORY,
    { skip: !canLoadModulePreviews },
  );
  const { data: auditData, error: auditError } = useAsyncData<AuditoriaDteResponse>(
    auditLoader,
    EMPTY_AUDIT,
    { skip: !canLoadModulePreviews },
  );

  const spotInput = spotData.serie.length > 0
    ? inputFromSpot(spotData)
    : {
        pctSpot: demandaMes?.mix?.spotPct ?? null,
        pctMat: demandaMes?.mix?.materEstimadoPct ?? null,
        costoSpotPromedioPesosMwh: null,
        spotPesos: null,
      };
  const complianceInput = complianceData.serie.length > 0
    ? inputFromCompliance(complianceData)
    : {
        pctRenovablePromedio: cliente.pctRenovableAnio,
        cumpleYtd: cliente.cumple27191,
        brechaYtdMwh: null,
        multaEstimadaPesos: null,
      };
  const factorInput = factorData.serie.length > 0 ? inputFromFactor(factorData) : null;
  const auditInput = auditData.serie.length > 0 ? inputFromAudit(auditData) : null;
  const insights = buildExecutiveInsights({
    spot: spotInput,
    compliance: complianceInput,
    factor: factorInput,
    audit: auditInput,
  }, { disclosure });
  const previews = buildModulePreviewState({
    spot: spotInput,
    compliance: complianceInput,
    factor: factorInput,
    audit: auditInput,
  }, { disclosure });
  const moduleErrors = [
    spotError && "Spot",
    complianceError && "Renovables",
    factorError && "Perfil",
    historyError && "Historia",
    auditError && "DTE",
  ].filter(Boolean).join(", ");
  const historyPreview: ModulePreview = {
    primary: fmtGwh(historyData.resumen?.demandaUltimos12mMwh != null ? historyData.resumen.demandaUltimos12mMwh / 1000 : cliente.demandaAnioMovilTotal.totalGwh),
    secondary: historyData.resumen?.variacionUltimos12mPct != null ? `${formatPct(historyData.resumen.variacionUltimos12mPct)} YoY` : "Demanda anual",
    status: historyData.serieMensual.length > 0 ? "ok" : "empty",
  };
  const marketPreview: ModulePreview = {
    primary: fmtGwh(mercado?.generacionTotalGwh),
    secondary: mercado?.pctRenovableSistema != null ? `${fmtPct(mercado.pctRenovableSistema)} renovable` : "Mix nacional",
    status: mercado ? "ok" : "empty",
  };
  const featuredModule = selectFeaturedModule(previews);
  const moduleOrder: HomeModuleKey[] = ["spot", "compliance", "factor", "history", "market", "audit"];

  function renderModulePreview(moduleKey: HomeModuleKey, featured = false, layout: "card" | "strip" = "card") {
    const chartHeight = featured ? 320 : layout === "strip" ? 210 : 138;
    if (moduleKey === "spot") {
      return (
        <ModulePreviewCard
          key={moduleKey}
          title="Exposición Spot"
          subtitle="Cobertura contractual y precio"
          icon={<Gauge size={featured ? 21 : 18} />}
          preview={previews.spot}
          to="/app/exposicion-spot"
          featured={featured}
          layout={layout}
        >
          <SpotPreviewChart data={spotData} height={chartHeight} />
        </ModulePreviewCard>
      );
    }
    if (moduleKey === "compliance") {
      return (
        <ModulePreviewCard
          key={moduleKey}
          title="Renovables 27.191"
          subtitle="Avance contra obligación"
          icon={<Leaf size={featured ? 21 : 18} />}
          preview={previews.compliance}
          to="/app/cumplimiento-renovable"
          featured={featured}
          layout={layout}
        >
          <CompliancePreviewChart data={complianceData} height={chartHeight} />
        </ModulePreviewCard>
      );
    }
    if (moduleKey === "factor") {
      return (
        <ModulePreviewCard
          key={moduleKey}
          title="Perfil de Carga"
          subtitle="Pico, valle y resto"
          icon={<TrendingUp size={featured ? 21 : 18} />}
          preview={previews.factor}
          to="/app/perfil-carga"
          featured={featured}
          layout={layout}
        >
          <FactorPreviewChart data={factorData} height={chartHeight} />
        </ModulePreviewCard>
      );
    }
    if (moduleKey === "history") {
      return (
        <ModulePreviewCard
          key={moduleKey}
          title="Historia Energética"
          subtitle="Últimos 12 meses"
          icon={<History size={featured ? 21 : 18} />}
          preview={historyPreview}
          to="/app/historia"
          featured={featured}
          layout={layout}
        >
          <HistoryPreviewChart data={historyData} height={chartHeight} />
        </ModulePreviewCard>
      );
    }
    if (moduleKey === "market") {
      return (
        <ModulePreviewCard
          key={moduleKey}
          title="Mercado Eléctrico"
          subtitle="Contexto MEM nacional"
          icon={<Zap size={featured ? 21 : 18} />}
          preview={marketPreview}
          to="/app/mercado"
          featured={featured}
          layout={layout}
        >
          <MarketPreviewChart mercado={mercado} height={chartHeight} />
        </ModulePreviewCard>
      );
    }
    return (
      <ModulePreviewCard
        key={moduleKey}
        title="Auditoría DTE"
        subtitle="Liquidación y alertas"
        icon={<FileSearch size={featured ? 21 : 18} />}
      preview={previews.audit}
      to="/app/auditoria-dte"
      featured={featured}
      layout={layout}
    >
        <AuditPreviewChart data={auditData} disclosure={disclosure} height={chartHeight} />
      </ModulePreviewCard>
    );
  }

  const closePremiumNotice = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("premium");
    setSearchParams(next, { replace: true });
  };

  // Skeleton del dashboard mientras carga: shell ya visible, solo placeholders.
  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <Skeleton height={11} width={140} className="mb-2" />
          <Skeleton height={28} width="55%" className="mb-2" />
          <Skeleton height={12} width="35%" />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChartCard />
          <SkeletonChartCard />
        </div>
      </div>
    );
  }

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
        <div className="mb-6">
          <AlertaBanner type="warning" message={`No se pudo cargar el informe: ${error}`} />
        </div>
      )}

      {isTrial && (
        <PremiumUpsellNotice moduleKey={premiumModuleKey} onClose={closePremiumNotice} />
      )}

      {/* Advertencias del servidor */}
      {contexto.warnings && contexto.warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {contexto.warnings.map((w, i) => (
            <AlertaBanner key={i} type="info" message={w} />
          ))}
        </div>
      )}

      {/* Alertas automáticas */}
      {cliente.disponible && <Alertas cliente={cliente} />}

      {cliente.disponible && <ExecutiveInsights insights={insights} />}

      {cliente.disponible && moduleErrors && (
        <div className="mb-6">
          <AlertaBanner type="info" message={`Algunos previews no pudieron actualizarse ahora: ${moduleErrors}. La home sigue mostrando el informe principal.`} />
        </div>
      )}

      {/* Cliente sin datos */}
      {!cliente.disponible && (
        <EmptyState
          icon={<BarChart3 size={28} className="text-slate-400" />}
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

      {cliente.disponible && (
        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#15caca]">Módulos de análisis</p>
              <h2 className="text-xl font-bold text-[#163759] tracking-tight">Lo que EnergyOS ya puede leer de tu operación</h2>
            </div>
            <p className="max-w-xl text-xs text-slate-500">
              Previews compactas de las pantallas completas: riesgo, cumplimiento, horario, historia, mercado y DTE.
            </p>
          </div>

          <div className="space-y-5">
            {renderModulePreview(featuredModule, true)}

            <div>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Radar complementario
                </p>
                <p className="max-w-xl text-xs text-slate-500">
                  Cada bloque conserva su gráfico y su lectura, pero ya no compite como tarjeta chica.
                </p>
              </div>
              <div className="space-y-4">
                {moduleOrder
                  .filter((moduleKey) => moduleKey !== featuredModule)
                  .map((moduleKey) => renderModulePreview(moduleKey, false, "strip"))}
              </div>
            </div>
          </div>
        </section>
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
