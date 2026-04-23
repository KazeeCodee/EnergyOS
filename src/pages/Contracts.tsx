import { useState } from "react";
import { ChartFrame } from "../components/charts/ChartFrame";
import { ContractChart } from "../components/charts/ContractChart";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { LockedOverlay } from "../components/ui/LockedOverlay";
import { Panel } from "../components/ui/Panel";
import { PricingModal } from "../components/ui/PricingModal";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { getContratosData, getEmpresaData } from "../services/energyData";
import type { ContratosData, EmpresaData } from "../types";
import { usd } from "../utils/format";

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
const emptyContratos: ContratosData = { precio_mercado_referencia: 0, contratos: [] };

async function loadContractsPageData() {
  const [empresa, contratos] = await Promise.all([getEmpresaData(), getContratosData()]);
  return { empresa, contratos };
}

export default function Contracts() {
  const [pricingOpen, setPricingOpen] = useState(false);
  const { data, error, loading } = useAsyncData(loadContractsPageData, {
    empresa: emptyEmpresa,
    contratos: emptyContratos,
  });
  const locked = data.empresa.plan_activo === "compliance";
  const firstContracts = data.contratos.contratos.slice(0, 2);

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando contratos...", "Consultando Supabase..."]} /> : null}
      {pricingOpen ? <PricingModal onClose={() => setPricingOpen(false)} /> : null}
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}
      <div>
        <p className="text-sm uppercase text-mist">Contratos</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Benchmark MATER vs mercado
        </h2>
      </div>

      <div className="relative overflow-hidden rounded">
        <div className={locked ? "pointer-events-none blur-[6px]" : ""}>
          <div className="grid gap-4 md:grid-cols-3">
            {firstContracts.map((contract) => (
              <StatCard
                borderColor="green"
                key={contract.id}
                label={`Precio ${contract.tipo}`}
                subtext={`${contract.generador} Â· Hasta ${contract.vigencia}`}
                value={`${usd(contract.precio_usd_mwh, 2)}/MWh`}
              />
            ))}
            <StatCard
              borderColor="yellow"
              label="Referencia mercado"
              subtext="Variables relevantes MEM"
              value={`${usd(data.contratos.precio_mercado_referencia, 2)}/MWh`}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <ChartFrame title="Comparativo de precios">
              <ContractChart contratos={data.contratos} />
            </ChartFrame>

            <Panel className="overflow-hidden">
              <div className="border-b border-navy-border p-5">
                <h3 className="font-syne text-base font-bold text-ivory">
                  Contratos activos
                </h3>
              </div>
              <div className="divide-y divide-navy-border">
                {data.contratos.contratos.map((contract) => (
                  <div className="p-5" key={contract.id}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="font-syne text-lg text-ivory">
                        {contract.tipo}
                      </strong>
                      <span className="rounded border border-forest/35 bg-forest/15 px-2 py-1 text-xs uppercase text-forest-light">
                        {contract.score.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-mist">{contract.generador}</p>
                    <p className="number mt-3 font-syne text-2xl font-bold text-ivory">
                      {usd(contract.precio_usd_mwh, 2)}/MWh
                    </p>
                    <p className="mt-2 text-xs text-mist">Vigencia: {contract.vigencia}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {locked ? (
          <LockedOverlay
            description="El anÃ¡lisis de contratos permite identificar si tus precios MATER estÃ¡n por encima o por debajo de referencias de mercado."
            onUpgradeClick={() => setPricingOpen(true)}
          />
        ) : null}
      </div>
    </div>
  );
}
