import { ChartFrame } from "../components/charts/ChartFrame";
import { ContractChart } from "../components/charts/ContractChart";
import { DemandChart } from "../components/charts/DemandChart";
import { MixDonut } from "../components/charts/MixDonut";
import { Badge } from "../components/ui/Badge";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Panel } from "../components/ui/Panel";
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
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <div>
        <p className="text-sm uppercase text-mist">Resumen ejecutivo</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Estado energético de {data.empresa.razon_social || "tu empresa"}
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
          subtext={`Ultimo mes: ${latestCost?.mes ?? "Sin datos"}`}
          value={usd(latestCost?.total_usd ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <ChartFrame subtitle="MATER y SPOT por mes" title="Demanda de energía">
          <DemandChart data={data.compliance} />
        </ChartFrame>

        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">
                Mix de cobertura
              </h3>
              <p className="mt-1 text-sm text-mist">Distribución anual</p>
            </div>
            <Badge tone="success">Activo</Badge>
          </div>
          <div className="space-y-4">
            <MixDonut data={data.mercado.mater_spot} title={data.empresa.razon_social || "Empresa"} />
            <MixDonut data={data.mercado.mem_mix} title="MEM Argentina" />
          </div>
        </Panel>
      </div>

      <ChartFrame subtitle="Comparativo contra referencia MEM" title="Benchmark de contratos">
        <ContractChart contratos={data.contratos} />
      </ChartFrame>
    </div>
  );
}
