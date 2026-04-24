import { ChartFrame } from "../components/charts/ChartFrame";
import { ContractChart } from "../components/charts/ContractChart";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { getContratosData } from "../services/energyData";
import type { ContratosData } from "../types";
import { usd } from "../utils/format";

const emptyContratos: ContratosData = { precio_mercado_referencia: 0, contratos: [] };

export default function Contracts() {
  const { data: contratosData, error, loading } = useAsyncData(getContratosData, emptyContratos);
  const firstContracts = contratosData.contratos.slice(0, 2);

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando contratos...", "Consultando Supabase..."]} /> : null}
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

      <div className="grid gap-4 md:grid-cols-3">
        {firstContracts.map((contract) => (
          <StatCard
            borderColor="green"
            key={contract.id}
            label={`Precio ${contract.tipo}`}
            subtext={`${contract.generador} · Hasta ${contract.vigencia}`}
            value={`${usd(contract.precio_usd_mwh, 2)}/MWh`}
          />
        ))}
        <StatCard
          borderColor="yellow"
          label="Referencia mercado"
          subtext="Variables relevantes MEM"
          value={`${usd(contratosData.precio_mercado_referencia, 2)}/MWh`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartFrame title="Comparativo de precios">
          <ContractChart contratos={contratosData} />
        </ChartFrame>

        <Panel className="overflow-hidden">
          <div className="border-b border-navy-border p-5">
            <h3 className="font-syne text-base font-bold text-ivory">
              Contratos activos
            </h3>
          </div>
          <div className="divide-y divide-navy-border">
            {contratosData.contratos.map((contract) => (
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
  );
}
