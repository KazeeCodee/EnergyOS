import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  DatabaseZap,
  Layers3,
  LineChart as LineChartIcon,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";
import { StatCard } from "../../components/ui/StatCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { loadAdminAnalytics } from "../../services/adminData";
import type { AdminAnalyticsOverview, AdminAnalyticsPeriodOption } from "../../types";

type PickerOption = {
  value: string;
  label: string;
  meta?: string;
};

const initialData: AdminAnalyticsOverview = {
  agentes: [],
  periodos: [],
  seleccionado: {
    agente_id: "",
    desde: "",
    hasta: "",
  },
  agente_actual: null,
  resumen: {
    meses_disponibles: 0,
    meses_seleccionados: 0,
    demanda_total_mwh: 0,
    mater_total_mwh: 0,
    spot_total_mwh: 0,
    porcentaje_renovable_promedio: 0,
    costo_total_usd: 0,
    costo_monomico_promedio_usd_mwh: 0,
    precio_spot_promedio_usd_mwh: 0,
    transporte_promedio_pesos_mwh: 0,
    mix_renovable_promedio_pct: 0,
    meses_sospechosos: 0,
    cobertura_pct: 0,
    ultimo_procesado_en: null,
  },
  consumo_serie: [],
  costos_serie: [],
  mercado_serie: [],
  calidad_serie: [],
  mix_promedio: [],
};

const chartColors = {
  demand: "#0F172A",
  mater: "#168056",
  spot: "#D97706",
  renewable: "#16A34A",
  market: "#2563EB",
  cammesa: "#7C3AED",
  border: "#DDE5EA",
  muted: "#667085",
};

function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatMwh(value: number, digits = 0) {
  return `${formatNumber(value, digits)} MWh`;
}

function formatUsd(value: number, digits = 0) {
  return `USD ${formatNumber(value, digits)}`;
}

function formatPesos(value: number, digits = 0) {
  return `$ ${formatNumber(value, digits)}`;
}

function formatPercent(value: number, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

function readTooltipValue(value: number | string | ReadonlyArray<number | string> | undefined) {
  if (Array.isArray(value)) return Number(value[0] ?? 0);
  return Number(value ?? 0);
}

function formatTooltipMwh(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatMwh(readTooltipValue(value), 1);
}

function formatTooltipUsd(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatUsd(readTooltipValue(value), digits);
}

function formatTooltipPesos(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatPesos(readTooltipValue(value), digits);
}

function formatTooltipPercent(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatPercent(readTooltipValue(value), digits);
}

function tooltipUsd(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipUsd(value, 1);
}

function tooltipUsdWhole(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipUsd(value, 0);
}

function tooltipPesos(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipPesos(value, 1);
}

function tooltipPercent(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipPercent(value, 1);
}

function formatDateTimeLabel(value: string | null) {
  if (!value) return "Sin proceso registrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SectionHeading({
  icon: Icon,
  index,
  title,
  description,
}: {
  icon: typeof BarChart3;
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-navy-border bg-white shadow-panel">
        <Icon size={18} className="text-forest" />
      </div>
      <div className="space-y-2">
        <Badge tone="plan">Modulo {index}</Badge>
        <div>
          <h2 className="font-syne text-2xl font-bold text-ivory">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-mist">{description}</p>
        </div>
      </div>
    </div>
  );
}

function FilterPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-mist">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-navy-border bg-white px-4 py-3 text-left shadow-panel transition hover:border-forest/30"
      >
        <div className="min-w-0">
          <p className="truncate font-syne text-sm font-bold text-ivory">{selected?.label ?? "Seleccionar"}</p>
          {selected?.meta ? <p className="mt-1 truncate text-xs text-mist">{selected.meta}</p> : null}
        </div>
        <span className="ml-4 text-xs uppercase tracking-[0.2em] text-mist">{open ? "Cerrar" : "Abrir"}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 overflow-auto rounded-2xl border border-navy-border bg-white p-2 shadow-panel scrollbar-thin">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-start justify-between rounded-xl px-3 py-3 text-left transition ${
                option.value === value ? "bg-forest/10 text-forest" : "text-ivory hover:bg-navy"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{option.label}</p>
                {option.meta ? <p className="mt-1 truncate text-xs text-mist">{option.meta}</p> : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Panel className="h-full p-5">
      <div className="mb-4">
        <h3 className="font-syne text-lg font-bold text-ivory">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-mist">{description}</p>
      </div>
      <div className="h-[280px]">{children}</div>
    </Panel>
  );
}

function QualityStrip({
  label,
  active,
  detail,
}: {
  label: string;
  active: boolean;
  detail: string | null;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active ? "border-alert/35 bg-alert/10" : "border-navy-border bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-syne text-sm font-bold text-ivory">{label}</p>
        <Badge tone={active ? "warning" : "success"}>{active ? "sospechoso" : "ok"}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-mist">{detail ?? "Sin observaciones para este periodo."}</p>
    </div>
  );
}

export default function AdminAnalytics() {
  const [filters, setFilters] = useState({
    agenteId: "",
    desde: "",
    hasta: "",
    reloadKey: 0,
  });

  const load = useCallback(
    () =>
      loadAdminAnalytics({
        agenteId: filters.agenteId || undefined,
        desde: filters.desde || undefined,
        hasta: filters.hasta || undefined,
      }),
    [filters.agenteId, filters.desde, filters.hasta, filters.reloadKey],
  );

  const { data, error, loading } = useAsyncData(load, initialData);

  useEffect(() => {
    if (!data.seleccionado.agente_id) return;
    setFilters((current) => {
      const next = {
        ...current,
        agenteId: current.agenteId || data.seleccionado.agente_id,
        desde: current.desde || data.seleccionado.desde,
        hasta: current.hasta || data.seleccionado.hasta,
      };

      if (
        next.agenteId === current.agenteId &&
        next.desde === current.desde &&
        next.hasta === current.hasta
      ) {
        return current;
      }

      return next;
    });
  }, [data.seleccionado.agente_id, data.seleccionado.desde, data.seleccionado.hasta]);

  const agenteOptions: PickerOption[] = data.agentes.map((agente) => ({
    value: agente.id,
    label: agente.razon_social,
    meta: `${agente.nemo} · ${agente.tipo_agente}`,
  }));

  const periodOptions: PickerOption[] = data.periodos.map((periodo: AdminAnalyticsPeriodOption) => ({
    value: periodo.value,
    label: periodo.label,
  }));

  const setAgente = (nextAgenteId: string) => {
    setFilters((current) => ({
      ...current,
      agenteId: nextAgenteId,
      desde: "",
      hasta: "",
    }));
  };

  const setDesde = (nextDesde: string) => {
    setFilters((current) => ({
      ...current,
      desde: nextDesde,
      hasta: current.hasta && compareMonthKeys(nextDesde, current.hasta) <= 0 ? current.hasta : nextDesde,
    }));
  };

  const setHasta = (nextHasta: string) => {
    setFilters((current) => ({
      ...current,
      hasta: nextHasta,
      desde: current.desde && compareMonthKeys(current.desde, nextHasta) <= 0 ? current.desde : nextHasta,
    }));
  };

  const averageMarketCammesa =
    data.mercado_serie.length > 0
      ? data.mercado_serie.reduce((sum, row) => sum + row.costo_cammesa_usd_mwh, 0) / data.mercado_serie.length
      : 0;

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Leyendo agente monitoreado y rango mensual...",
            "Cargando series de consumo, costos, mercado y calidad...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Analitica del sistema</p>
          <div className="space-y-3">
            <h1 className="max-w-4xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Vista de datos, estadisticas y graficos del seguimiento mensual por agente.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta pantalla cruza el agente monitoreado con periodos mensuales continuos y organiza la lectura en
              cuatro modulos: consumo y cobertura, costos, mercado y calidad del dato.
            </p>
          </div>
        </div>

        <Panel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Rango activo</p>
              <p className="mt-2 font-syne text-3xl font-bold text-ivory">
                {data.seleccionado.desde && data.seleccionado.hasta
                  ? `${data.seleccionado.desde} a ${data.seleccionado.hasta}`
                  : "Sin rango"}
              </p>
            </div>
            <Button
              onClick={() => setFilters((current) => ({ ...current, reloadKey: current.reloadKey + 1 }))}
              type="button"
              variant="outline"
            >
              <RefreshCcw size={16} />
              Recargar
            </Button>
          </div>
          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-navy-border bg-navy p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Agente activo</p>
              <p className="mt-2 text-sm text-ivory">
                {data.agente_actual
                  ? `${data.agente_actual.razon_social} · ${data.agente_actual.nemo} · ${data.agente_actual.tipo_agente}`
                  : "Sin agente seleccionado"}
              </p>
            </div>
            <div className="rounded-2xl border border-navy-border bg-navy p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Ultimo procesamiento</p>
              <p className="mt-2 text-sm text-ivory">{formatDateTimeLabel(data.resumen.ultimo_procesado_en)}</p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <FilterPicker label="Agente monitoreado" value={filters.agenteId} options={agenteOptions} onChange={setAgente} />
        </Panel>
        <Panel className="p-5">
          <FilterPicker label="Desde" value={filters.desde} options={periodOptions} onChange={setDesde} />
        </Panel>
        <Panel className="p-5">
          <FilterPicker label="Hasta" value={filters.hasta} options={periodOptions} onChange={setHasta} />
        </Panel>
      </section>

      {error ? (
        <section className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          borderColor="blue"
          label="Meses filtrados"
          subtext="Periodo mensual continuo activo"
          value={String(data.resumen.meses_seleccionados)}
        />
        <StatCard
          borderColor="green"
          label="Demanda total"
          subtext="Energia consolidada del rango"
          value={formatNumber(data.resumen.demanda_total_mwh)}
        />
        <StatCard
          borderColor="green"
          label="MATER total"
          subtext="Cobertura renovable acumulada"
          value={formatNumber(data.resumen.mater_total_mwh)}
        />
        <StatCard
          borderColor="yellow"
          label="Costo total"
          subtext="Estimacion acumulada en USD"
          value={formatNumber(data.resumen.costo_total_usd)}
        />
        <StatCard
          borderColor={data.resumen.meses_sospechosos > 0 ? "yellow" : "blue"}
          label="Calidad"
          subtext="Meses marcados como sospechosos"
          value={String(data.resumen.meses_sospechosos)}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={Layers3}
          index="01"
          title="Consumo y cobertura"
          description="Lectura principal del agente: demanda total, energia MATER, energia SPOT y porcentaje renovable para el rango mensual seleccionado."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="blue"
            label="Demanda acumulada"
            subtext="Suma de demanda del rango"
            value={formatNumber(data.resumen.demanda_total_mwh)}
          />
          <StatCard
            borderColor="green"
            label="Cobertura MATER"
            subtext="Energia renovable registrada"
            value={formatNumber(data.resumen.mater_total_mwh)}
          />
          <StatCard
            borderColor="yellow"
            label="Exposicion SPOT"
            subtext="Volumen no cubierto por MATER"
            value={formatNumber(data.resumen.spot_total_mwh)}
          />
          <StatCard
            borderColor="green"
            label="Renovable promedio"
            subtext="Promedio ponderado del rango"
            value={formatPercent(data.resumen.porcentaje_renovable_promedio)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title="Demanda, MATER y SPOT"
            description="Composicion mensual de energia del agente, con la demanda total como referencia superior."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.consumo_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <Tooltip
                  formatter={formatTooltipMwh}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <Legend />
                <Bar dataKey="mater_mwh" name="MATER" stackId="energia" fill={chartColors.mater} radius={[6, 6, 0, 0]} />
                <Bar dataKey="spot_mwh" name="SPOT" stackId="energia" fill={chartColors.spot} radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="demanda_total_mwh" name="Demanda total" stroke={chartColors.demand} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Cumplimiento renovable"
            description="Serie mensual del porcentaje renovable, con la referencia de 20% visible sobre todo el periodo."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.consumo_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipPercent}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <ReferenceLine
                  y={20}
                  stroke={chartColors.spot}
                  strokeDasharray="4 4"
                  label={{ value: "Referencia 20%", fill: chartColors.spot, fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="porcentaje_renovable"
                  name="% renovable"
                  stroke={chartColors.renewable}
                  fill="rgba(22, 163, 74, 0.18)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={DatabaseZap}
          index="02"
          title="Costos"
          description="Seguimiento del costo total estimado, costo monomico y referencias de precio que ya quedan persistidas en la capa mensual."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="yellow"
            label="Costo total USD"
            subtext="Acumulado del rango"
            value={formatNumber(data.resumen.costo_total_usd)}
          />
          <StatCard
            borderColor="blue"
            label="Monomico promedio"
            subtext="Costo total / demanda total"
            value={formatNumber(data.resumen.costo_monomico_promedio_usd_mwh, 1)}
          />
          <StatCard
            borderColor="yellow"
            label="Spot promedio USD/MWh"
            subtext="Referencia mensual promedio"
            value={formatNumber(data.resumen.precio_spot_promedio_usd_mwh, 1)}
          />
          <StatCard
            borderColor="blue"
            label="Transporte promedio"
            subtext="Pesos por MWh del rango"
            value={formatNumber(data.resumen.transporte_promedio_pesos_mwh, 1)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title="Costo total estimado por mes"
            description="Serie mensual consolidada del costo total estimado del agente en el rango filtrado."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.costos_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} tickFormatter={(value) => formatNumber(Number(value))} />
                <Tooltip
                  formatter={tooltipUsdWhole}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <Bar dataKey="costo_total_estimado_usd" name="Costo total estimado" fill={chartColors.spot} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Costo monomico y referencias"
            description="Comparacion entre el costo monomico mensual del agente y las referencias de energia renovable y spot."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.costos_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipUsd}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <Legend />
                <Line type="monotone" dataKey="costo_monomico_usd_mwh" name="Monomico" stroke={chartColors.demand} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="costo_spot_usd_mwh" name="Spot ref." stroke={chartColors.spot} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="costo_renovable_usd_mwh" name="Renovable ref." stroke={chartColors.mater} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>

        <div className="grid gap-4 xl:grid-cols-1">
          <ChartPanel
            title="Transporte y precio spot en pesos"
            description="Lectura operativa de los conceptos en pesos por MWh persistidos en la tabla mensual."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.costos_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipPesos}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <Legend />
                <Line type="monotone" dataKey="cargo_transporte_pesos_mwh" name="Transporte" stroke={chartColors.market} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="precio_spot_pesos_mwh" name="Spot pesos/MWh" stroke={chartColors.spot} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={LineChartIcon}
          index="03"
          title="Mercado"
          description="Contexto mensual del MEM para el mismo rango filtrado, usando la capa agregada de datos_mercado."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="green"
            label="Mix renovable prom."
            subtext="Promedio del mercado en el rango"
            value={formatPercent(data.resumen.mix_renovable_promedio_pct)}
          />
          <StatCard
            borderColor="blue"
            label="Spot mercado"
            subtext="Promedio spot USD/MWh"
            value={formatNumber(
              data.mercado_serie.length
                ? data.mercado_serie.reduce((sum, row) => sum + row.precio_spot_usd_mwh, 0) / data.mercado_serie.length
                : 0,
              1,
            )}
          />
          <StatCard
            borderColor="blue"
            label="Costo CAMMESA"
            subtext="Promedio USD/MWh del rango"
            value={formatNumber(averageMarketCammesa, 1)}
          />
          <StatCard
            borderColor="green"
            label="Meses mercado"
            subtext="Puntos de contexto disponibles"
            value={String(data.mercado_serie.length)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <ChartPanel
            title="Mix promedio del mercado"
            description="Promedio de composicion del sistema para el rango del filtro actual."
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.mix_promedio}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${formatPercent(Number(value), 1)}`}
                >
                  {data.mix_promedio.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.name === "Renovable"
                          ? chartColors.mater
                          : entry.name === "Termica"
                            ? chartColors.spot
                            : entry.name === "Hidraulica"
                              ? chartColors.market
                              : chartColors.cammesa
                      }
                    />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipPercent} />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Precios de mercado"
            description="Comparacion mensual entre spot, costo renovable y costo CAMMESA en USD/MWh."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.mercado_serie}>
                <CartesianGrid stroke={chartColors.border} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipUsd}
                  labelStyle={{ color: chartColors.demand }}
                  contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                />
                <Legend />
                <Line type="monotone" dataKey="precio_spot_usd_mwh" name="Spot" stroke={chartColors.spot} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="costo_renovable_usd_mwh" name="Renovable" stroke={chartColors.mater} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="costo_cammesa_usd_mwh" name="CAMMESA" stroke={chartColors.market} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>

        <ChartPanel
          title="Evolucion del mix mensual"
          description="Lectura de composicion del mercado mes a mes para el mismo intervalo usado por el agente."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.mercado_serie}>
              <CartesianGrid stroke={chartColors.border} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
              <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
              <Tooltip
                formatter={tooltipPercent}
                labelStyle={{ color: chartColors.demand }}
                contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
              />
              <Legend />
              <Area type="monotone" dataKey="mix_termica_pct" name="Termica" stackId="mix" stroke={chartColors.spot} fill="rgba(217, 119, 6, 0.28)" />
              <Area type="monotone" dataKey="mix_hidraulica_pct" name="Hidraulica" stackId="mix" stroke={chartColors.market} fill="rgba(37, 99, 235, 0.22)" />
              <Area type="monotone" dataKey="mix_nuclear_pct" name="Nuclear" stackId="mix" stroke={chartColors.cammesa} fill="rgba(124, 58, 237, 0.22)" />
              <Area type="monotone" dataKey="mix_renovable_pct" name="Renovable" stackId="mix" stroke={chartColors.mater} fill="rgba(22, 128, 86, 0.24)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={AlertTriangle}
          index="04"
          title="Calidad del dato"
          description="Cobertura real del rango filtrado, meses sospechosos y trazabilidad del ultimo procesamiento persistido."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="blue"
            label="Meses disponibles"
            subtext="Cobertura total del agente"
            value={String(data.resumen.meses_disponibles)}
          />
          <StatCard
            borderColor={data.resumen.cobertura_pct >= 100 ? "green" : "yellow"}
            label="Cobertura del rango"
            subtext="Meses cargados / meses esperados"
            value={formatPercent(data.resumen.cobertura_pct)}
          />
          <StatCard
            borderColor={data.resumen.meses_sospechosos > 0 ? "yellow" : "green"}
            label="Meses sospechosos"
            subtext="Marcados por pipeline"
            value={String(data.resumen.meses_sospechosos)}
          />
          <StatCard
            borderColor="blue"
            label="Ultimo proceso"
            subtext="Fecha del ultimo guardado"
            value={data.resumen.ultimo_procesado_en ? "registrado" : "sin dato"}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel className="p-5">
            <h3 className="font-syne text-lg font-bold text-ivory">Lectura de cobertura</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              El rango actual exige meses completos, no dias sueltos. Esta barra muestra si el historico cargado cubre
              todo el tramo pedido.
            </p>
            <div className="mt-6 rounded-2xl border border-navy-border bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ivory">Cobertura del filtro</p>
                <strong className="font-mono text-xl text-ivory">{formatPercent(data.resumen.cobertura_pct)}</strong>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-navy">
                <div
                  className={`h-full rounded-full ${data.resumen.cobertura_pct >= 100 ? "bg-forest" : "bg-alert"}`}
                  style={{ width: `${Math.min(data.resumen.cobertura_pct, 100)}%` }}
                />
              </div>
              <p className="mt-4 text-sm text-mist">
                {data.resumen.meses_seleccionados} meses cargados sobre un rango operativo de {data.seleccionado.desde} a{" "}
                {data.seleccionado.hasta}.
              </p>
              <p className="mt-2 text-sm text-mist">Ultimo procesamiento: {formatDateTimeLabel(data.resumen.ultimo_procesado_en)}</p>
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="font-syne text-lg font-bold text-ivory">Linea mensual de calidad</h3>
            <p className="mt-2 text-sm leading-6 text-mist">
              Cada bloque representa un mes del rango y deja visible si el dato fue marcado como sospechoso.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {data.calidad_serie.map((row) => (
                <QualityStrip
                  key={row.periodo}
                  label={row.etiqueta}
                  active={row.dato_sospechoso}
                  detail={row.sospechoso_motivo}
                />
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}
