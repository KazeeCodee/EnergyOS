import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFrame } from "../components/charts/ChartFrame";
import { CostChart } from "../components/charts/CostChart";
import { tooltipStyle } from "../components/charts/RechartsBase";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { LockedOverlay } from "../components/ui/LockedOverlay";
import { Panel } from "../components/ui/Panel";
import { PricingModal } from "../components/ui/PricingModal";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { getCostosData, getEmpresaData } from "../services/energyData";
import type { CostosData, EmpresaData } from "../types";
import { usd } from "../utils/format";

const colors = ["#168056", "#B7791F", "#356CA5", "#7A8797", "#57B887"];
const emptyEmpresa: EmpresaData = {
  id: "",
  razon_social: "",
  nemo: "",
  tipo_usuario: "GUME",
  comercializador: "",
  plan_activo: "compliance",
  miembro_desde: "",
  acuerdo_mensual_mwh: 0,
};
const emptyCostos: CostosData = { serie: [], desglose_oct_2025: [] };

async function loadCostsPageData() {
  const [empresa, costos] = await Promise.all([getEmpresaData(), getCostosData()]);
  return { empresa, costos };
}

export default function Costs() {
  const [pricingOpen, setPricingOpen] = useState(false);
  const { data, error, loading } = useAsyncData(loadCostsPageData, {
    empresa: emptyEmpresa,
    costos: emptyCostos,
  });
  const rows = data.costos.serie;
  const locked = data.empresa.plan_activo === "compliance";
  const historical = rows.filter((row) => row.tipo === "historico");
  const latest = historical.at(-1);
  const nextWinter = rows.filter((row) => row.tipo === "proyeccion" && row.es_pico);
  const peak = nextWinter.length
    ? nextWinter.reduce((current, row) => (row.costo_usd_mwh > current.costo_usd_mwh ? row : current))
    : undefined;

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando costos...", "Consultando Supabase..."]} /> : null}
      {pricingOpen ? <PricingModal onClose={() => setPricingOpen(false)} /> : null}
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}
      <div>
        <p className="text-sm uppercase text-mist">Costos</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          ProyecciÃ³n de costos energÃ©ticos
        </h2>
      </div>

      <div className="relative overflow-hidden rounded">
        <div className={locked ? "pointer-events-none blur-[6px]" : ""}>
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
              label="Meses crÃ­ticos"
              subtext={nextWinter.map((row) => row.mes).join(" Â· ")}
              value={String(nextWinter.length)}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <ChartFrame subtitle="HistÃ³rico y proyecciÃ³n 12 meses" title="Costo promedio mensual">
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
                      data={data.costos.desglose_oct_2025}
                      dataKey="valor_usd"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {data.costos.desglose_oct_2025.map((item, index) => (
                        <Cell fill={colors[index % colors.length]} key={item.concepto} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-3">
                {data.costos.desglose_oct_2025.map((item, index) => (
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

        {locked ? (
          <LockedOverlay
            description="La proyecciÃ³n permite anticipar picos de invierno, explicar variaciones de factura y priorizar decisiones financieras."
            onUpgradeClick={() => setPricingOpen(true)}
          />
        ) : null}
      </div>
    </div>
  );
}
