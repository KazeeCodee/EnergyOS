import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFrame } from "../components/charts/ChartFrame";
import { CostChart } from "../components/charts/CostChart";
import { tooltipStyle } from "../components/charts/RechartsBase";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { getCostosData } from "../services/energyData";
import type { CostosData } from "../types";
import { usd } from "../utils/format";

const colors = ["#168056", "#B7791F", "#356CA5", "#7A8797", "#57B887"];
const emptyCostos: CostosData = { serie: [], desglose_oct_2025: [] };

export default function Costs() {
  const { data: costos, error, loading } = useAsyncData(getCostosData, emptyCostos);
  const rows = costos.serie;
  const historical = rows.filter((row) => row.tipo === "historico");
  const latest = historical.at(-1);
  const nextWinter = rows.filter((row) => row.tipo === "proyeccion" && row.es_pico);
  const peak = nextWinter.length
    ? nextWinter.reduce((current, row) => (row.costo_usd_mwh > current.costo_usd_mwh ? row : current))
    : undefined;

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando costos...", "Consultando Supabase..."]} /> : null}
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}
      <div>
        <p className="text-sm uppercase text-mist">Costos</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Proyección de costos energéticos
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          borderColor="green"
          label={latest?.mes ?? "Ultimo mes"}
          subtext="Total facturado"
          value={usd(latest?.total_usd ?? 0)}
        />
        <StatCard
          borderColor="yellow"
          label="Pico proyectado"
          subtext={peak?.mes ?? "Sin proyeccion"}
          value={`${usd(peak?.costo_usd_mwh ?? 0)}/MWh`}
        />
        <StatCard
          borderColor="blue"
          label="Meses críticos"
          subtext={nextWinter.map((row) => row.mes).join(" · ")}
          value={String(nextWinter.length)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <ChartFrame subtitle="Histórico y proyección 12 meses" title="Costo promedio mensual">
          <CostChart data={rows} />
        </ChartFrame>

        <Panel className="p-5">
          <h3 className="font-syne text-base font-bold text-ivory">
            Desglose {latest?.mes ?? ""}
          </h3>
          <div className="mt-4 h-56">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={costos.desglose_oct_2025}
                  dataKey="valor_usd"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {costos.desglose_oct_2025.map((item, index) => (
                    <Cell fill={colors[index % colors.length]} key={item.concepto} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-3">
            {costos.desglose_oct_2025.map((item, index) => (
              <div className="flex justify-between gap-3 text-sm" key={item.concepto}>
                <span className="flex items-center gap-2 text-mist">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  {item.concepto}
                </span>
                <strong className="number text-ivory">{usd(item.valor_usd)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
