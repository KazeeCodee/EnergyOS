import { Activity, GitBranch, ListTree, RefreshCcw, TableProperties } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";
import { StatCard } from "../../components/ui/StatCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { loadAdminSystemOverview } from "../../services/adminData";
import type { AdminSystemMetric, AdminSystemOverview, AdminSystemTable } from "../../types";

const initialData: AdminSystemOverview = {
  ultima_actualizacion: "",
  resumen: {
    agentes_cammesa: 0,
    agentes_monitoreados: 0,
    agentes_con_datos: 0,
    filas_datos_mensuales: 0,
    periodos_cubiertos: 0,
    periodo_desde: null,
    periodo_hasta: null,
  },
  tablas: [],
  metricas: [],
  agentes: [],
};

function formatDateLabel(value: string | null) {
  if (!value) return "Sin datos";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function tableTone(nombre: string) {
  if (nombre === "cammesa_agentes_mem" || nombre === "agentes_monitoreados") return "plan";
  if (nombre === "datos_mensuales" || nombre === "datos_mercado") return "success";
  return "neutral";
}

function metricTone(metric: AdminSystemMetric) {
  if (metric.tablas.includes("datos_mensuales")) return "success";
  if (metric.tablas.includes("datos_mercado")) return "plan";
  return "neutral";
}

function TableCard({ table }: { table: AdminSystemTable }) {
  return (
    <Panel className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[13px] font-semibold text-ivory">{table.nombre}</p>
          <p className="mt-2 text-sm leading-6 text-mist">{table.proposito}</p>
        </div>
        <Badge tone={tableTone(table.nombre)}>{table.campos.length} campos</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {table.campos.map((campo) => (
          <span
            key={campo}
            className="rounded-full border border-navy-border bg-navy px-2.5 py-1 font-mono text-[11px] text-mist"
          >
            {campo}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function MetricCard({ metric }: { metric: AdminSystemMetric }) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-syne text-base font-bold text-ivory">{metric.nombre}</p>
          <p className="mt-2 text-sm leading-6 text-mist">{metric.descripcion}</p>
        </div>
        <Badge tone={metricTone(metric)}>{metric.tablas.length} tablas</Badge>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Tablas</p>
          <p className="mt-2 text-sm text-ivory">{metric.tablas.join(" + ")}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Campos</p>
          <p className="mt-2 text-sm text-ivory">{metric.campos.join(" · ")}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Operacion</p>
          <p className="mt-2 text-sm text-ivory">{metric.operacion}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Salida</p>
          <p className="mt-2 text-sm text-ivory">{metric.salida}</p>
        </div>
      </div>
    </Panel>
  );
}

export default function SystemOverview() {
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => loadAdminSystemOverview(), [reloadKey]);
  const { data, error, loading } = useAsyncData(load, initialData);

  return (
    <div className="space-y-8">
      {loading ? (
        <LoadingScreen
          messages={[
            "Relevando estado del sistema...",
            "Cargando tablas, cálculos y agentes monitoreados...",
          ]}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-mist">Administrador del sistema</p>
          <div className="space-y-3">
            <h1 className="max-w-3xl font-fraunces text-4xl font-bold leading-tight text-ivory">
              Centro de control de EnergyOS para auditar estructura, datos y trazabilidad.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-mist">
              Esta primera pantalla reemplaza el dashboard anterior y muestra cómo está compuesto el
              sistema hoy: qué tablas siguen vigentes, qué cálculos genera y qué agentes están siendo
              monitoreados activamente.
            </p>
          </div>
        </div>

        <Panel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Última actualización</p>
              <p className="mt-2 font-syne text-3xl font-bold text-ivory">
                {formatDateLabel(data.ultima_actualizacion)}
              </p>
            </div>
            <Button onClick={() => setReloadKey((current) => current + 1)} type="button" variant="outline">
              <RefreshCcw size={16} />
              Recargar
            </Button>
          </div>
          <div className="mt-6 grid gap-3">
            <div className="rounded-lg border border-navy-border bg-navy p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Cobertura activa</p>
              <p className="mt-2 text-sm text-ivory">
                Desde {formatDateLabel(data.resumen.periodo_desde)} hasta {formatDateLabel(data.resumen.periodo_hasta)}.
              </p>
            </div>
            <div className="rounded-lg border border-navy-border bg-navy p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">Lectura del modelo</p>
              <p className="mt-2 text-sm leading-6 text-ivory">
                <span className="font-medium">Fuente CAMMESA:</span> <span className="font-mono">cammesa_agentes_mem</span>
                {" "}· <span className="font-medium">Seguimiento interno:</span> <span className="font-mono">agentes_monitoreados</span>
                {" "}· <span className="font-medium">Salida analítica:</span> <span className="font-mono">datos_mensuales</span> y <span className="font-mono">datos_mercado</span>.
              </p>
            </div>
          </div>
        </Panel>
      </section>

      {error ? (
        <section className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          borderColor="blue"
          label="Agentes CAMMESA"
          subtext="Universo fuente disponible"
          value={String(data.resumen.agentes_cammesa)}
        />
        <StatCard
          borderColor="green"
          label="Agentes monitoreados"
          subtext="Seguimiento interno activo"
          value={String(data.resumen.agentes_monitoreados)}
        />
        <StatCard
          borderColor="green"
          label="Agentes con datos"
          subtext="Con histórico persistido"
          value={String(data.resumen.agentes_con_datos)}
        />
        <StatCard
          borderColor="yellow"
          label="Filas mensuales"
          subtext="Histórico consolidado"
          value={String(data.resumen.filas_datos_mensuales)}
        />
        <StatCard
          borderColor="blue"
          label="Períodos cubiertos"
          subtext="Rango mensual disponible"
          value={String(data.resumen.periodos_cubiertos)}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <TableProperties size={18} className="text-forest" />
          <div>
            <h2 className="font-syne text-xl font-bold text-ivory">Tablas vigentes del sistema</h2>
            <p className="text-sm text-mist">
              Inventario actual de la base, mostrando propósito y campos principales por tabla.
            </p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.tablas.map((table) => (
            <TableCard key={table.nombre} table={table} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <GitBranch size={18} className="text-forest" />
          <div>
            <h2 className="font-syne text-xl font-bold text-ivory">Datos, gráficos y cálculos que genera EnergyOS</h2>
            <p className="text-sm text-mist">
              Cada ficha documenta de qué tablas parte el sistema, qué campos cruza y cómo produce cada salida.
            </p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.metricas.map((metric) => (
            <MetricCard key={metric.nombre} metric={metric} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-forest" />
          <div>
            <h2 className="font-syne text-xl font-bold text-ivory">Agentes monitoreados actualmente</h2>
            <p className="text-sm text-mist">
              Lista completa de agentes internos que hoy siguen activos en el sistema.
            </p>
          </div>
        </div>

        <Panel className="overflow-hidden">
          <div className="border-b border-navy-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="plan">{data.agentes.length} agentes</Badge>
              <Badge tone="success">
                {data.agentes.filter((agent) => agent.estado === "completo").length} con cobertura completa
              </Badge>
            </div>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-navy/55 text-xs uppercase tracking-wide text-mist">
                <tr>
                  <th className="px-5 py-3">Razón social</th>
                  <th className="px-5 py-3">Nemo</th>
                  <th className="px-5 py-3">Tipo CAMMESA</th>
                  <th className="px-5 py-3">Cobertura</th>
                  <th className="px-5 py-3">Meses cargados</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-border">
                {data.agentes.map((agent) => (
                  <tr key={agent.id} className="text-mist">
                    <td className="px-5 py-4 font-medium text-ivory">{agent.razon_social}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full border border-navy-border bg-navy px-2.5 py-1 font-mono text-[12px] text-ivory">
                        {agent.nemo}
                      </span>
                    </td>
                    <td className="px-5 py-4">{agent.tipo_agente}</td>
                    <td className="px-5 py-4">
                      {formatDateLabel(agent.cobertura_desde)} · {formatDateLabel(agent.cobertura_hasta)}
                    </td>
                    <td className="px-5 py-4">{agent.meses_cargados}</td>
                    <td className="px-5 py-4">
                      <Badge tone={agent.estado === "completo" ? "success" : "warning"}>
                        {agent.estado}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <ListTree size={18} className="text-forest" />
          <div>
            <h2 className="font-syne text-xl font-bold text-ivory">Lectura operativa del sistema</h2>
            <p className="text-sm text-mist">
              La capa fuente y la capa de seguimiento ya están separadas. El próximo paso es construir las demás pantallas admin sobre este modelo nuevo.
            </p>
          </div>
        </div>
        <Panel className="p-5">
          <p className="text-sm leading-7 text-ivory">
            EnergyOS ya no mezcla padrón interno, clientes y planes. El sistema quedó ordenado en tres niveles:
            fuente CAMMESA, agentes monitoreados y resultados analíticos. Esta home administra esa lectura y
            reemplaza el dashboard anterior como punto de entrada del backoffice.
          </p>
        </Panel>
      </section>
    </div>
  );
}
