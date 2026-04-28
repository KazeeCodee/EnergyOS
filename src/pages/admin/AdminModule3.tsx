import { Globe2, RefreshCcw, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  formatMonthKey,
  formatNumber,
  formatPercent,
  SectionHeading,
  tooltipPercent,
  tooltipUsd,
} from "./moduleScreenShared";
import { loadAdminModule3 } from "../../services/adminData";
import type { PickerOption } from "./moduleScreenShared";
import type { AdminAnalyticsPeriodOption, AdminModule3Overview } from "../../types";

const initialData: AdminModule3Overview = {
  agentes: [],
  periodos: [],
  seleccionado: { agente_id: "", desde: "", hasta: "" },
  agente_actual: null,
  resumen: {
    meses_en_rango: 0,
    meses_con_mercado: 0,
    meses_raw_economicos: 0,
    mix_renovable_promedio_pct: 0,
    precio_spot_promedio_usd_mwh: 0,
    costo_renovable_promedio_usd_mwh: 0,
    costo_cammesa_promedio_usd_mwh: 0,
  },
  serie: [],
  mix_promedio: [],
};

const chartColors = {
  termica: "#D97706",
  hidraulica: "#2563EB",
  nuclear: "#7C3AED",
  renovable: "#15caca",
  border: "#E2E8F0",
  muted: "#64748B",
};

export default function AdminModule3() {
  const [filters, setFilters] = useState({
    agenteId: "",
    desde: "",
    hasta: "",
    reloadKey: 0,
  });

  const load = useCallback(
    () =>
      loadAdminModule3({
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

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Leyendo contexto de mercado ya consolidado...",
            "Cruzando cobertura del agente con mercado y raw económico...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Validacion del modulo 3</p>
          <div className="space-y-3">
            <h1 className="max-w-4xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Pantalla admin para comprobar mercado, mix y referencias del Modulo 3.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta vista usa la capa publicada de <span className="font-mono">datos_mercado</span> y la recorta a los
              meses reales del agente para validar precios, mix energético y continuidad del contexto mensual.
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
          <div className="mt-6 rounded-2xl border border-navy-border bg-navy p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Agente activo</p>
            <p className="mt-2 text-sm text-ivory">{selectedAgentSummary}</p>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard borderColor="green" label="Mix renovable prom." subtext="Promedio del rango" value={formatPercent(data.resumen.mix_renovable_promedio_pct)} />
        <StatCard borderColor="yellow" label="Spot mercado" subtext="Promedio USD/MWh" value={formatNumber(data.resumen.precio_spot_promedio_usd_mwh, 1)} />
        <StatCard borderColor="green" label="Renovable mercado" subtext="Promedio USD/MWh" value={formatNumber(data.resumen.costo_renovable_promedio_usd_mwh, 1)} />
        <StatCard borderColor="blue" label="Costo CAMMESA" subtext="Promedio USD/MWh" value={formatNumber(data.resumen.costo_cammesa_promedio_usd_mwh, 1)} />
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={Globe2}
          index="03"
          title="Mercado"
          description="Validacion del contexto MEM publicado para los mismos meses en los que el agente realmente tiene datos dentro del rango filtrado."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard borderColor="blue" label="Meses del rango" subtext="Meses pedidos por el filtro" value={String(data.resumen.meses_en_rango)} />
          <StatCard borderColor="green" label="Meses con mercado" subtext="Meses con fila en datos_mercado" value={String(data.resumen.meses_con_mercado)} />
          <StatCard borderColor="green" label="Raw económicos" subtext="Meses con AMAT + AGUM + ATRA" value={String(data.resumen.meses_raw_economicos)} />
        </div>

        {data.serie.length === 0 ? (
          <EmptyState
            title="No hay meses de mercado visibles para este agente en el rango elegido."
            description="La pantalla sólo muestra meses donde el agente tiene datos reales y existe contexto de mercado publicado para ese mismo período."
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <ChartPanel
                title="Mix promedio del mercado"
                description="Promedio del mix mensual del MEM sobre los meses visibles del agente."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.mix_promedio} dataKey="value" nameKey="name" innerRadius={60} outerRadius={92} paddingAngle={2}>
                      {data.mix_promedio.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={
                            entry.name === "Renovable"
                              ? chartColors.renovable
                              : entry.name === "Termica"
                                ? chartColors.termica
                                : entry.name === "Hidraulica"
                                  ? chartColors.hidraulica
                                  : chartColors.nuclear
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={tooltipPercent} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel
                title="Precios de mercado"
                description="Comparación mensual entre spot, referencia renovable y costo CAMMESA del periodo."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.serie}>
                    <CartesianGrid stroke={chartColors.border} vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                    <Tooltip formatter={tooltipUsd} contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                    <Legend />
                    <Line type="monotone" dataKey="precio_spot_usd_mwh" name="Spot" stroke={chartColors.termica} strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="costo_renovable_usd_mwh" name="Renovable" stroke={chartColors.renovable} strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="costo_cammesa_usd_mwh" name="CAMMESA" stroke={chartColors.hidraulica} strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            <ChartPanel
              title="Evolución del mix mensual"
              description="Composición del mix del sistema para los meses del agente visibles en el rango."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.serie}>
                  <CartesianGrid stroke={chartColors.border} vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                  <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} />
                  <Tooltip formatter={tooltipPercent} contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                  <Legend />
                  <Area type="monotone" dataKey="mix_termica_pct" name="Termica" stackId="mix" stroke={chartColors.termica} fill="rgba(217, 119, 6, 0.26)" />
                  <Area type="monotone" dataKey="mix_hidraulica_pct" name="Hidraulica" stackId="mix" stroke={chartColors.hidraulica} fill="rgba(37, 99, 235, 0.22)" />
                  <Area type="monotone" dataKey="mix_nuclear_pct" name="Nuclear" stackId="mix" stroke={chartColors.nuclear} fill="rgba(124, 58, 237, 0.2)" />
                  <Area type="monotone" dataKey="mix_renovable_pct" name="Renovable" stackId="mix" stroke={chartColors.renovable} fill="rgba(22, 128, 86, 0.24)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartPanel>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Table2 size={18} className="text-forest" />
                <div>
                  <h3 className="font-syne text-xl font-bold text-ivory">Tabla mensual del Modulo 3</h3>
                  <p className="text-sm text-mist">Detalle del mix, precios y cobertura raw económica por mes.</p>
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
                        <th className="px-5 py-3">Termica</th>
                        <th className="px-5 py-3">Hidraulica</th>
                        <th className="px-5 py-3">Nuclear</th>
                        <th className="px-5 py-3">Renovable</th>
                        <th className="px-5 py-3">Spot</th>
                        <th className="px-5 py-3">CAMMESA</th>
                        <th className="px-5 py-3">Raw econ.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border">
                      {data.serie.map((row) => (
                        <tr key={row.periodo} className="text-mist">
                          <td className="px-5 py-4 font-medium text-ivory">{row.etiqueta}</td>
                          <td className="px-5 py-4">{formatPercent(row.mix_termica_pct, 1)}</td>
                          <td className="px-5 py-4">{formatPercent(row.mix_hidraulica_pct, 1)}</td>
                          <td className="px-5 py-4">{formatPercent(row.mix_nuclear_pct, 1)}</td>
                          <td className="px-5 py-4">{formatPercent(row.mix_renovable_pct, 1)}</td>
                          <td className="px-5 py-4">{formatNumber(row.precio_spot_usd_mwh, 1)}</td>
                          <td className="px-5 py-4">{formatNumber(row.costo_cammesa_usd_mwh, 1)}</td>
                          <td className="px-5 py-4">
                            <Badge tone={row.raw_economico_completo ? "success" : "warning"}>
                              {row.raw_economico_completo ? "completo" : "parcial"}
                            </Badge>
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
