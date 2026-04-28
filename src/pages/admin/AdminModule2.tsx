import { Coins, RefreshCcw, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import {
  ChartPanel,
  compareMonthKeys,
  EmptyState,
  FilterPicker,
  formatDateTimeLabel,
  formatMonthKey,
  formatNumber,
  formatUsd,
  SectionHeading,
  tooltipPesos,
  tooltipUsd,
  tooltipUsdWhole,
} from "./moduleScreenShared";
import { loadAdminModule2 } from "../../services/adminData";
import type { PickerOption } from "./moduleScreenShared";
import type { AdminAnalyticsPeriodOption, AdminModule2Overview } from "../../types";

const initialData: AdminModule2Overview = {
  agentes: [],
  periodos: [],
  seleccionado: { agente_id: "", desde: "", hasta: "" },
  agente_actual: null,
  resumen: {
    meses_en_rango: 0,
    meses_con_datos: 0,
    meses_raw_completos: 0,
    costo_total_usd: 0,
    costo_monomico_promedio_usd_mwh: 0,
    costo_spot_promedio_usd_mwh: 0,
    costo_renovable_promedio_usd_mwh: 0,
    transporte_promedio_pesos_mwh: 0,
    ultimo_procesado_en: null,
  },
  serie: [],
};

const chartColors = {
  total: "#D97706",
  monomico: "#163759",
  spot: "#D97706",
  renovable: "#15caca",
  transporte: "#2563EB",
  border: "#E2E8F0",
  muted: "#64748B",
};

export default function AdminModule2() {
  const [filters, setFilters] = useState({
    agenteId: "",
    desde: "",
    hasta: "",
    reloadKey: 0,
  });

  const load = useCallback(
    () =>
      loadAdminModule2({
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
      return next.agenteId === current.agenteId && next.desde === current.desde && next.hasta === current.hasta
        ? current
        : next;
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

  const setAgente = (nextAgenteId: string) =>
    setFilters((current) => ({ ...current, agenteId: nextAgenteId, desde: "", hasta: "" }));
  const setDesde = (nextDesde: string) =>
    setFilters((current) => ({
      ...current,
      desde: nextDesde,
      hasta: current.hasta && compareMonthKeys(nextDesde, current.hasta) <= 0 ? current.hasta : nextDesde,
    }));
  const setHasta = (nextHasta: string) =>
    setFilters((current) => ({
      ...current,
      hasta: nextHasta,
      desde: current.desde && compareMonthKeys(current.desde, nextHasta) <= 0 ? current.desde : nextHasta,
    }));

  const selectedAgentSummary = data.agente_actual
    ? `${data.agente_actual.razon_social} · ${data.agente_actual.nemo} · ${data.agente_actual.tipo_agente}`
    : "Sin agente seleccionado";
  const selectedRangeSummary =
    data.seleccionado.desde && data.seleccionado.hasta
      ? `${formatMonthKey(data.seleccionado.desde)} a ${formatMonthKey(data.seleccionado.hasta)}`
      : "Sin rango";
  const hasRows = data.serie.length > 0;

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Leyendo costos mensuales ya publicados...",
            "Validando referencias raw y consistencia del Modulo 2...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Validacion del modulo 2</p>
          <div className="space-y-3">
            <h1 className="max-w-4xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Pantalla admin para comprobar costos, referencias y cobertura raw del Modulo 2.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta vista cruza <span className="font-mono">datos_mensuales</span> con la cobertura raw consolidada
              para auditar costo total, monomico, spot, renovable y transporte sin depender operativamente del ZIP.
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

      {error ? <section className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">{error}</section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard borderColor="yellow" label="Costo total USD" subtext="Acumulado del rango" value={formatNumber(data.resumen.costo_total_usd)} />
        <StatCard borderColor="blue" label="Monomico prom." subtext="Costo total / demanda" value={formatNumber(data.resumen.costo_monomico_promedio_usd_mwh, 1)} />
        <StatCard borderColor="yellow" label="Spot prom. USD/MWh" subtext="Referencia persistida" value={formatNumber(data.resumen.costo_spot_promedio_usd_mwh, 1)} />
        <StatCard borderColor="green" label="Renovable prom." subtext="Referencia persistida" value={formatNumber(data.resumen.costo_renovable_promedio_usd_mwh, 1)} />
        <StatCard borderColor="blue" label="Transporte prom." subtext="Pesos/MWh del rango" value={formatNumber(data.resumen.transporte_promedio_pesos_mwh, 1)} />
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={Coins}
          index="02"
          title="Costos"
          description="Validacion puntual del costo mensual por agente usando la capa canónica ya publicada y la cobertura raw minima necesaria del periodo."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard borderColor="blue" label="Meses del rango" subtext="Meses pedidos por el filtro" value={String(data.resumen.meses_en_rango)} />
          <StatCard borderColor="green" label="Meses con datos" subtext="Filas reales del agente" value={String(data.resumen.meses_con_datos)} />
          <StatCard borderColor="green" label="Raw completos" subtext="AMAT + AGUM + ATRA disponibles" value={String(data.resumen.meses_raw_completos)} />
        </div>

        {!hasRows ? (
          <EmptyState
            title="No hay filas de costos para este agente en el rango elegido."
            description="La pantalla no inventa meses vacíos ni completa valores faltantes con cero cuando no existe una fila mensual real."
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartPanel
                title="Costo total estimado por mes"
                description="Serie mensual consolidada del costo publicado para el agente en el rango activo."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.serie}>
                    <CartesianGrid stroke={chartColors.border} vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} tickFormatter={(value) => formatNumber(Number(value))} />
                    <Tooltip formatter={tooltipUsdWhole} contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                    <Bar dataKey="costo_total_estimado_usd" name="Costo total" fill={chartColors.total} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel
                title="Monomico y referencias"
                description="Comparación entre el costo monomico del agente y las referencias spot/renovable publicadas para cada mes."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.serie}>
                    <CartesianGrid stroke={chartColors.border} vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <Tooltip formatter={tooltipUsd} contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                    <Legend />
                    <Line type="monotone" dataKey="costo_monomico_usd_mwh" name="Monomico" stroke={chartColors.monomico} strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="costo_spot_usd_mwh" name="Spot ref." stroke={chartColors.spot} strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="costo_renovable_usd_mwh" name="Renovable ref." stroke={chartColors.renovable} strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <ChartPanel
              title="Transporte y spot en pesos"
              description="Lectura operativa de los conceptos mensuales persistidos en pesos, útil para validar que la rama raw reconstruye bien los cargos económicos."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.serie}>
                  <CartesianGrid stroke={chartColors.border} vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                  <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                  <Tooltip formatter={tooltipPesos} contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                  <Legend />
                  <Line type="monotone" dataKey="cargo_transporte_pesos_mwh" name="Transporte" stroke={chartColors.transporte} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="precio_spot_pesos_mwh" name="Spot pesos/MWh" stroke={chartColors.spot} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Table2 size={18} className="text-forest" />
                <div>
                  <h3 className="font-syne text-xl font-bold text-ivory">Tabla mensual del Modulo 2</h3>
                  <p className="text-sm text-mist">Detalle de costos, referencias y calidad del período filtrado.</p>
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
                        <th className="px-5 py-3">Costo total</th>
                        <th className="px-5 py-3">Monomico</th>
                        <th className="px-5 py-3">Spot ref.</th>
                        <th className="px-5 py-3">Renovable ref.</th>
                        <th className="px-5 py-3">Transporte</th>
                        <th className="px-5 py-3">Raw</th>
                        <th className="px-5 py-3">Calidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border">
                      {data.serie.map((row) => (
                        <tr key={row.periodo} className="text-mist">
                          <td className="px-5 py-4 font-medium text-ivory">{row.etiqueta}</td>
                          <td className="px-5 py-4">{formatUsd(row.costo_total_estimado_usd, 0)}</td>
                          <td className="px-5 py-4">{formatUsd(row.costo_monomico_usd_mwh, 1)}</td>
                          <td className="px-5 py-4">{formatUsd(row.costo_spot_usd_mwh, 1)}</td>
                          <td className="px-5 py-4">{formatUsd(row.costo_renovable_usd_mwh, 1)}</td>
                          <td className="px-5 py-4">{row.cargo_transporte_pesos_mwh == null ? "—" : formatNumber(row.cargo_transporte_pesos_mwh, 1)}</td>
                          <td className="px-5 py-4">
                            <Badge tone={row.raw_completo ? "success" : "warning"}>{row.raw_completo ? "completo" : "parcial"}</Badge>
                          </td>
                          <td className="px-5 py-4">
                            <Badge tone={row.dato_sospechoso ? "warning" : "success"}>
                              {row.dato_sospechoso ? "sospechoso" : "ok"}
                            </Badge>
                            {row.sospechoso_motivo ? <p className="mt-2 max-w-[280px] text-xs text-mist">{row.sospechoso_motivo}</p> : null}
                          </td>
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
