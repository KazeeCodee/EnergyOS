import { RefreshCcw, ShieldCheck, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  formatPercent,
  SectionHeading,
} from "./moduleScreenShared";
import { loadAdminModule4 } from "../../services/adminData";
import type { PickerOption } from "./moduleScreenShared";
import type { AdminAnalyticsPeriodOption, AdminModule4Overview } from "../../types";

const initialData: AdminModule4Overview = {
  agentes: [],
  periodos: [],
  seleccionado: { agente_id: "", desde: "", hasta: "" },
  agente_actual: null,
  resumen: {
    meses_en_rango: 0,
    meses_con_datos_agente: 0,
    meses_raw_completos: 0,
    meses_mercado_publicado: 0,
    meses_sospechosos: 0,
    cobertura_agente_pct: 0,
    ultimo_procesado_en: null,
  },
  serie: [],
};

const chartColors = {
  raw: "#168056",
  mercado: "#2563EB",
  sospechoso: "#D97706",
  border: "#DDE5EA",
  muted: "#667085",
};

export default function AdminModule4() {
  const [filters, setFilters] = useState({
    agenteId: "",
    desde: "",
    hasta: "",
    reloadKey: 0,
  });

  const load = useCallback(
    () =>
      loadAdminModule4({
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

  const chartData = data.serie.map((row) => ({
    etiqueta: row.etiqueta,
    raw: row.raw_completo ? 1 : 0,
    mercado: row.mercado_publicado ? 1 : 0,
    sospechoso: row.dato_sospechoso ? 1 : 0,
  }));

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Leyendo cobertura y calidad del agente...",
            "Contrastando raw, mercado publicado y flags sospechosos...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Validacion del modulo 4</p>
          <div className="space-y-3">
            <h1 className="max-w-4xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Pantalla admin para comprobar cobertura, completitud y calidad del dato del Modulo 4.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta vista resume si el agente tiene meses publicados, si el raw mínimo del período está completo y si el
              pipeline marcó observaciones que deban revisarse antes de confiar en el módulo.
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard borderColor="blue" label="Meses del rango" subtext="Meses pedidos por el filtro" value={String(data.resumen.meses_en_rango)} />
        <StatCard borderColor="green" label="Meses del agente" subtext="Filas reales del agente" value={String(data.resumen.meses_con_datos_agente)} />
        <StatCard borderColor="green" label="Raw completos" subtext="AMAT + AGUM + ATRA" value={String(data.resumen.meses_raw_completos)} />
        <StatCard borderColor="blue" label="Mercado publicado" subtext="Meses con datos_mercado" value={String(data.resumen.meses_mercado_publicado)} />
        <StatCard borderColor={data.resumen.meses_sospechosos > 0 ? "yellow" : "green"} label="Meses sospechosos" subtext="Marcados por pipeline" value={String(data.resumen.meses_sospechosos)} />
        <StatCard borderColor={data.resumen.cobertura_agente_pct >= 100 ? "green" : "yellow"} label="Cobertura agente" subtext="Meses reales / meses del rango" value={formatPercent(data.resumen.cobertura_agente_pct)} />
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={ShieldCheck}
          index="04"
          title="Calidad del dato"
          description="Validacion del rango real del agente, trazabilidad de publicación y señales de revisión sobre meses concretos."
        />

        {data.serie.length === 0 ? (
          <EmptyState
            title="No hay meses publicados para este agente dentro del rango elegido."
            description="La vista conserva la cobertura del filtro, pero no inventa filas ni rellena meses ausentes cuando el agente todavía no tenía datos publicados."
          />
        ) : (
          <>
            <ChartPanel
              title="Cobertura operativa por mes"
              description="Cada mes visible muestra si el raw mínimo está completo, si el mercado quedó publicado y si existe alguna observación sospechosa."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke={chartColors.border} vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: chartColors.muted, fontSize: 12 }} />
                  <YAxis tick={{ fill: chartColors.muted, fontSize: 12 }} domain={[0, 1]} />
                  <Tooltip contentStyle={{ borderRadius: 16, borderColor: chartColors.border }} />
                  <Legend />
                  <Bar dataKey="raw" name="Raw completo" fill={chartColors.raw} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="mercado" name="Mercado publicado" fill={chartColors.mercado} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sospechoso" name="Sospechoso" fill={chartColors.sospechoso} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-syne text-lg font-bold text-ivory">Lectura de cobertura</h3>
                  <p className="mt-2 text-sm leading-6 text-mist">
                    El sistema compara el rango pedido contra las filas reales del agente. Si el agente entró tarde,
                    la cobertura baja pero la tabla sigue mostrando sólo meses existentes.
                  </p>
                </div>
                <strong className="font-mono text-2xl text-ivory">{formatPercent(data.resumen.cobertura_agente_pct)}</strong>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-navy">
                <div
                  className={`h-full rounded-full ${data.resumen.cobertura_agente_pct >= 100 ? "bg-forest" : "bg-alert"}`}
                  style={{ width: `${Math.min(data.resumen.cobertura_agente_pct, 100)}%` }}
                />
              </div>
            </Panel>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Table2 size={18} className="text-forest" />
                <div>
                  <h3 className="font-syne text-xl font-bold text-ivory">Tabla mensual del Modulo 4</h3>
                  <p className="text-sm text-mist">Mes a mes visible para auditar publicación, raw y observaciones.</p>
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
                        <th className="px-5 py-3">Raw</th>
                        <th className="px-5 py-3">Mercado</th>
                        <th className="px-5 py-3">Calidad</th>
                        <th className="px-5 py-3">Detalle</th>
                        <th className="px-5 py-3">Procesado en</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-border">
                      {data.serie.map((row) => (
                        <tr key={row.periodo} className="text-mist">
                          <td className="px-5 py-4 font-medium text-ivory">{row.etiqueta}</td>
                          <td className="px-5 py-4">
                            <Badge tone={row.raw_completo ? "success" : "warning"}>{row.raw_completo ? "completo" : "parcial"}</Badge>
                          </td>
                          <td className="px-5 py-4">
                            <Badge tone={row.mercado_publicado ? "success" : "warning"}>{row.mercado_publicado ? "publicado" : "faltante"}</Badge>
                          </td>
                          <td className="px-5 py-4">
                            <Badge tone={row.dato_sospechoso ? "warning" : "success"}>{row.dato_sospechoso ? "sospechoso" : "ok"}</Badge>
                          </td>
                          <td className="px-5 py-4">
                            {row.sospechoso_motivo ? <p className="max-w-[320px] text-xs text-mist">{row.sospechoso_motivo}</p> : "Sin observaciones"}
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
