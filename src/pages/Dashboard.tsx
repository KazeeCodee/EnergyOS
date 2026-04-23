import { Lock } from "lucide-react";
import { useState } from "react";
import { ChartFrame } from "../components/charts/ChartFrame";
import { ContractChart } from "../components/charts/ContractChart";
import { DemandChart } from "../components/charts/DemandChart";
import { MixDonut } from "../components/charts/MixDonut";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { LockedOverlay } from "../components/ui/LockedOverlay";
import { Panel } from "../components/ui/Panel";
import { PricingModal } from "../components/ui/PricingModal";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  getComplianceData,
  getContratosData,
  getCostosData,
  getEmpresaData,
  getMercadoData,
} from "../services/energyData";
import type { ComplianceRow, ContratosData, CostosData, EmpresaData, MercadoData } from "../types";
import { number, percent, usd } from "../utils/format";

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
const emptyCostos: CostosData = { serie: [], desglose_oct_2025: [] };
const emptyMercado: MercadoData = { mem_mix: [], mater_spot: [] };
const emptyCompliance: ComplianceRow = {
  mes: "",
  demanda_mwh: 0,
  mater_mwh: 0,
  spot_mwh: 0,
  porcentaje_renovable: 0,
  acuerdo_mes_mwh: 0,
  cumple: false,
  alerta: false,
};

async function loadDashboardData() {
  const [empresa, compliance, contratos, costos, mercado] = await Promise.all([
    getEmpresaData(),
    getComplianceData(),
    getContratosData(),
    getCostosData(),
    getMercadoData(),
  ]);
  return { empresa, compliance, contratos, costos, mercado };
}

export default function Dashboard() {
  const [pricingOpen, setPricingOpen] = useState(false);
  const { data, error, loading } = useAsyncData(loadDashboardData, {
    empresa: emptyEmpresa,
    compliance: [] as ComplianceRow[],
    contratos: emptyContratos,
    costos: emptyCostos,
    mercado: emptyMercado,
  });
  const latest = data.compliance[data.compliance.length - 1] ?? emptyCompliance;
  const latestCost = data.costos.serie.filter((row) => row.tipo === "historico").at(-1);
  const totalDemand = data.compliance.reduce((sum, row) => sum + row.demanda_mwh, 0);

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando datos reales...", "Consultando Supabase..."]} /> : null}
      {pricingOpen ? <PricingModal onClose={() => setPricingOpen(false)} /> : null}
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <section className="rounded border border-forest/25 bg-forest/10 px-4 py-3 text-sm text-forest-light">
        Tu plan Compliance incluye seguimiento renovable. Los anÃ¡lisis de
        contratos y costos estÃ¡n disponibles en planes superiores.{" "}
        <button
          className="font-semibold text-ivory transition hover:text-forest-light"
          onClick={() => setPricingOpen(true)}
        >
          Ver planes
        </button>
      </section>

      <div>
        <p className="text-sm uppercase text-mist">Resumen ejecutivo</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Estado energÃ©tico de {data.empresa.razon_social || "tu empresa"}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          borderColor="green"
          label="Renovable anual"
          subtext="Objetivo legal: 20%"
          trend="up"
          value={percent(latest.porcentaje_renovable)}
        />
        <StatCard
          borderColor="blue"
          label="Demanda anual"
          subtext={`${number(latest.demanda_mwh)} MWh en ${latest.mes || "el ultimo mes"}`}
          value={`${number(totalDemand)} MWh`}
        />
        <StatCard
          borderColor="green"
          label="Precio ponderado"
          subtext={`Mercado ref. ${usd(data.contratos.precio_mercado_referencia, 2)}/MWh`}
          trend="down"
          value={`${usd(latestCost?.costo_usd_mwh ?? 0, 2)}/MWh`}
        />
        <StatCard
          borderColor="yellow"
          label="Factura"
          subtext="Desglose disponible en Plan GestiÃ³n"
          locked
          value={usd(latestCost?.total_usd ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <ChartFrame subtitle="MATER y SPOT por mes" title="Demanda de energÃ­a">
          <DemandChart data={data.compliance} />
        </ChartFrame>

        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">
                Mix de cobertura
              </h3>
              <p className="mt-1 text-sm text-mist">DistribuciÃ³n anual</p>
            </div>
            <Badge tone="success">Incluido</Badge>
          </div>
          <div className="space-y-4">
            <MixDonut data={data.mercado.mater_spot} title={data.empresa.razon_social || "Empresa"} />
            <MixDonut data={data.mercado.mem_mix} title="MEM Argentina" />
          </div>
        </Panel>
      </div>

      <div className="relative overflow-hidden rounded">
        <div className="blur-[4px]">
          <ChartFrame subtitle="Comparativo contra referencia MEM" title="Benchmark de contratos">
            <ContractChart contratos={data.contratos} />
          </ChartFrame>
        </div>
        <LockedOverlay
          description="ComparÃ¡ el precio de cada contrato contra referencias de mercado y detectÃ¡ oportunidades de renegociaciÃ³n."
          onUpgradeClick={() => setPricingOpen(true)}
        />
      </div>

      <Panel className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded border border-forest/35 bg-forest/15 p-3 text-forest-light">
            <Lock size={22} />
          </div>
          <div>
            <h3 className="font-syne text-base font-bold text-ivory">
              PrÃ³xima mejora recomendada
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-mist">
              Activar Plan GestiÃ³n habilita benchmark MATER, proyecciÃ³n de
              costos 12 meses y desglose de factura para anticipar picos de
              invierno.
            </p>
            <Button className="mt-4" onClick={() => setPricingOpen(true)}>
              Ver planes
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
