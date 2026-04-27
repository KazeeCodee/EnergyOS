import { Activity, BarChart3, RefreshCcw, Table2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import { loadAdminModule1 } from "../../services/adminData";
import type { AdminAnalyticsPeriodOption, AdminModule1Overview } from "../../types";

type PickerOption = {
  value: string;
  label: string;
  meta?: string;
};

const initialData: AdminModule1Overview = {
  agentes: [],
  periodos: [],
  seleccionado: {
    agente_id: "",
    desde: "",
    hasta: "",
  },
  agente_actual: null,
  resumen: {
    meses_en_rango: 0,
    meses_con_datos: 0,
    demanda_total_mwh: 0,
    mater_total_mwh: 0,
    spot_total_mwh: 0,
    porcentaje_renovable_ponderado: 0,
    importe_mater_pesos: 0,
    precio_efectivo_promedio_pesos_mwh: 0,
    primer_periodo_con_datos: null,
    ultimo_periodo_con_datos: null,
    ultimo_procesado_en: null,
  },
  serie: [],
};

const chartColors = {
  demand: "#0F172A",
  mater: "#168056",
  spot: "#D97706",
  renewable: "#16A34A",
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

function formatPesos(value: number, digits = 0) {
  return `$ ${formatNumber(value, digits)}`;
}

function formatPercent(value: number, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

function formatMonthKey(value: string | null) {
  if (!value) return "Sin datos";
  const [anio, mes] = value.split("-").map(Number);
  const date = new Date(anio, (mes || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
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

function readTooltipValue(value: number | string | ReadonlyArray<number | string> | undefined) {
  if (Array.isArray(value)) return Number(value[0] ?? 0);
  return Number(value ?? 0);
}

function formatTooltipMwh(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatMwh(readTooltipValue(value), 1);
}

function formatTooltipPercent(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatPercent(readTooltipValue(value), 1);
}

function renewableChartDomain(data: Array<{ porcentaje_renovable: number }>) {
  const maxValue = data.reduce((current, row) => Math.max(current, row.porcentaje_renovable), 0);
  return [0, Math.max(25, Math.ceil(maxValue / 5) * 5 || 25)];
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BarChart3;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-navy-border bg-white shadow-panel">
        <Icon size={18} className="text-forest" />
      </div>
      <div className="space-y-2">
        <Badge tone="plan">Modulo 1</Badge>
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
      <div className="h-[300px]">{children}</div>
    </Panel>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Panel className="p-8">
      <div className="mx-auto max-w-2xl text-center">
        <Badge tone="warning">Sin datos en el rango</Badge>
        <h3 className="mt-4 font-syne text-2xl font-bold text-ivory">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-mist">{description}</p>
      </div>
    </Panel>
  );
}

export default function AdminModule1() {
  const [filters, setFilters] = useState({
    agenteId: "",
    desde: "",
    hasta: "",
    reloadKey: 0,
  });

  const load = useCallback(
    () =>
      loadAdminModule1({
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

  const selectedAgentSummary = data.agente_actual
    ? `${data.agente_actual.razon_social} · ${data.agente_actual.nemo} · ${data.agente_actual.tipo_agente}`
    : "Sin agente seleccionado";
  const selectedRangeSummary =
    data.seleccionado.desde && data.seleccionado.hasta
      ? `${formatMonthKey(data.seleccionado.desde)} a ${formatMonthKey(data.seleccionado.hasta)}`
      : "Sin rango";

  const hasRows = data.serie.length > 0;
  const skippedMonths = Math.max(0, data.resumen.meses_en_rango - data.resumen.meses_con_datos);

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Leyendo agentes monitoreados y periodos del sistema...",
            "Cargando datos reales del Modulo 1 para validar calculos y filtros...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Validacion del modulo 1</p>
          <div className="space-y-3">
            <h1 className="max-w-4xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Pantalla admin para comprobar consumo, cobertura y filtros reales del Modulo 1.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta vista usa exclusivamente datos reales ya procesados en <span className="font-mono">datos_mensuales</span> para probar el flujo
              de MATER, SPOT, demanda total y porcentaje renovable por agente.
            </p>
          </div>
        </div>

        <Panel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Rango activo</p>
              <p className="mt-2 font-syne text-2xl font-bold text-ivory">{selectedRangeSummary}</p>
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
              <p className="mt-2 text-sm text-ivory">{selectedAgentSummary}</p>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          borderColor="blue"
          label="Meses del rango"
          subtext="Cantidad total pedida por el filtro"
          value={String(data.resumen.meses_en_rango)}
        />
        <StatCard
          borderColor="green"
          label="Meses con datos"
          subtext="Meses reales devueltos para el agente"
          value={String(data.resumen.meses_con_datos)}
        />
        <StatCard
          borderColor="blue"
          label="Demanda total"
          subtext="Suma mensual validada del rango"
          value={formatNumber(data.resumen.demanda_total_mwh)}
        />
        <StatCard
          borderColor="green"
          label="MATER total"
          subtext="Energia renovable acumulada"
          value={formatNumber(data.resumen.mater_total_mwh)}
        />
        <StatCard
          borderColor="yellow"
          label="SPOT total"
          subtext="Energia expuesta del periodo"
          value={formatNumber(data.resumen.spot_total_mwh)}
        />
        <StatCard
          borderColor="green"
          label="% renovable"
          subtext="Promedio ponderado por demanda"
          value={formatPercent(data.resumen.porcentaje_renovable_ponderado)}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={Activity}
          title="Consumo y cobertura"
          description="Prueba operativa del Modulo 1 con agente unico, rango por mes y datos reales persistidos en el sistema."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            borderColor="blue"
            label="Importe MATER"
            subtext="Pesos acumulados del rango"
            value={formatNumber(data.resumen.importe_mater_pesos)}
          />
          <StatCard
            borderColor="green"
            label="Precio efectivo"
            subtext="Pesos/MWh ponderado del rango"
            value={formatNumber(data.resumen.precio_efectivo_promedio_pesos_mwh, 1)}
          />
          <StatCard
            borderColor={skippedMonths > 0 ? "yellow" : "green"}
            label="Meses fuera del agente"
            subtext="Meses del rango sin fila para este agente"
            value={String(skippedMonths)}
          />
          <StatCard
            borderColor="blue"
            label="Cobertura real"
            subtext="Primer y ultimo mes con datos"
            value={
              data.resumen.primer_periodo_con_datos && data.resumen.ultimo_periodo_con_datos
                ? `${data.resumen.primer_periodo_con_datos} → ${data.resumen.ultimo_periodo_con_datos}`
                : "Sin datos"
            }
          />
        </div>

        {skippedMonths > 0 ? (
          <Panel className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="warning">Cobertura parcial del agente</Badge>
              <p className="text-sm leading-6 text-mist">
                El filtro cubre {data.resumen.meses_en_rango} meses del sistema, pero este agente tiene datos reales en{" "}
                {data.resumen.meses_con_datos}. La pantalla muestra solo los meses existentes dentro del rango elegido.
              </p>
            </div>
          </Panel>
        ) : null}

        {!hasRows ? (
          <EmptyState
            title="No hay filas del Modulo 1 en este rango para el agente elegido."
            description="Probá con otro agente o ampliá el rango. La vista no inventa meses ni completa valores con cero cuando no existe una fila mensual real."
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartPanel
                title="Demanda, MATER y SPOT por mes"
                description="MATER y SPOT se comparan como barras paralelas, mientras la demanda total queda como referencia separada para leer mejor la cobertura del mes."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.serie}
                    margin={{ top: 16, right: 18, left: 8, bottom: 8 }}
                    barCategoryGap="24%"
                  >
                    <CartesianGrid stroke={chartColors.border} vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <YAxis
                      yAxisId="coverage"
                      tick={{ fill: chartColors.muted, fontSize: 12 }}
                      tickFormatter={(value) => formatNumber(Number(value))}
                    />
                    <YAxis
                      yAxisId="demand"
                      orientation="right"
                      tick={{ fill: chartColors.muted, fontSize: 12 }}
                      tickFormatter={(value) => formatNumber(Number(value))}
                    />
                    <Tooltip
                      formatter={formatTooltipMwh}
                      labelStyle={{ color: chartColors.demand }}
                      contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="coverage"
                      dataKey="mater_mwh"
                      name="MATER"
                      fill={chartColors.mater}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      yAxisId="coverage"
                      dataKey="spot_mwh"
                      name="SPOT"
                      fill={chartColors.spot}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="demand"
                      type="monotone"
                      dataKey="demanda_total_mwh"
                      name="Demanda total"
                      stroke={chartColors.demand}
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel
                title="Porcentaje renovable mensual"
                description="Lectura mensual directa del porcentaje renovable, mostrada como barras para que siga siendo clara incluso cuando el rango tiene un solo mes."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.serie} margin={{ top: 16, right: 18, left: 8, bottom: 8 }}>
                    <CartesianGrid stroke={chartColors.border} vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <YAxis
                      domain={renewableChartDomain(data.serie)}
                      tick={{ fill: chartColors.muted, fontSize: 12 }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      formatter={formatTooltipPercent}
                      labelStyle={{ color: chartColors.demand }}
                      contentStyle={{ borderRadius: 16, borderColor: chartColors.border }}
                    />
                    <ReferenceLine
                      y={20}
                      stroke={chartColors.spot}
                      strokeDasharray="4 4"
                      label={{ value: "Referencia 20%", fill: chartColors.spot, fontSize: 12 }}
                    />
                    <Bar
                      dataKey="porcentaje_renovable"
                      name="% renovable"
                      fill={chartColors.renewable}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={56}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Table2 size={18} className="text-forest" />
                <div>
                  <h3 className="font-syne text-xl font-bold text-ivory">Tabla mensual del Modulo 1</h3>
                  <p className="text-sm text-mist">
                    Detalle exacto del rango filtrado para validar importes, precio efectivo y fechas de procesamiento.
                  </p>
                </div>
              </div>

              <Panel className="overflow-hidden">
                <div className="border-b border-navy-border px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="plan">{data.serie.length} meses visibles</Badge>
                    <Badge tone="success">{selectedAgentSummary}</Badge>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-navy/55 text-xs uppercase tracking-wide text-mist">
                      <tr>
                        <th className="px-5 py-3">Periodo</th>
                        <th className="px-5 py-3">Demanda total</th>
                        <th className="px-5 py-3">MATER</th>
                        <th className="px-5 py-3">SPOT</th>
                        <th className="px-5 py-3">% renovable</th>
                        <th className="px-5 py-3">Importe MATER</th>
                        <th className="px-5 py-3">Precio efectivo</th>
                        <th className="px-5 py-3">Procesado en</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border">
                      {data.serie.map((row) => (
                        <tr key={row.periodo} className="text-mist">
                          <td className="px-5 py-4 font-medium text-ivory">{row.etiqueta}</td>
                          <td className="px-5 py-4">{formatMwh(row.demanda_total_mwh, 1)}</td>
                          <td className="px-5 py-4">{formatMwh(row.mater_mwh, 1)}</td>
                          <td className="px-5 py-4">{formatMwh(row.spot_mwh, 1)}</td>
                          <td className="px-5 py-4">
                            <Badge tone={row.porcentaje_renovable >= 20 ? "success" : "warning"}>
                              {formatPercent(row.porcentaje_renovable, 1)}
                            </Badge>
                          </td>
                          <td className="px-5 py-4">
                            {row.importe_mater_pesos == null ? "—" : formatPesos(row.importe_mater_pesos, 0)}
                          </td>
                          <td className="px-5 py-4">
                            {row.precio_efectivo_pesos_mwh == null ? "—" : formatPesos(row.precio_efectivo_pesos_mwh, 1)}
                          </td>
                          <td className="px-5 py-4">{formatDateTimeLabel(row.procesado_en)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
