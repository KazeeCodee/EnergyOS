import { ArrowLeft, Database, FileCheck2, LineChart, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChartFrame } from "../../components/charts/ChartFrame";
import { ComplianceGauge } from "../../components/charts/ComplianceGauge";
import { ContractChart } from "../../components/charts/ContractChart";
import { CostChart } from "../../components/charts/CostChart";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";
import { StatCard } from "../../components/ui/StatCard";
import { useAdminContext } from "../../context/AdminContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  getAdminRawData,
  getComplianceData,
  getContratosData,
  getCostosData,
  getEmpresaData,
} from "../../services/energyData";
import type {
  AdminRawData,
  ComplianceRow,
  ContratosData,
  CostosData,
  EmpresaData,
} from "../../types";
import { number, percent, usd } from "../../utils/format";

type DashboardTab = "compliance" | "contratos" | "costos" | "raw";

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

const emptyContratos: ContratosData = {
  precio_mercado_referencia: 0,
  contratos: [],
};

const emptyCostos: CostosData = {
  serie: [],
  desglose_oct_2025: [],
};

const initialData = {
  empresa: emptyEmpresa,
  compliance: [] as ComplianceRow[],
  contratos: emptyContratos,
  costos: emptyCostos,
  raw: null as AdminRawData | null,
};

function pesos(value: number, decimals = 0) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function selectedMonthLabel(mes: number) {
  return monthLabels[mes - 1] ?? String(mes);
}

function isRowForPeriod(row: ComplianceRow, anio: number, mes: number) {
  return row.mes === `${selectedMonthLabel(mes)} ${anio}`;
}

const tabs: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof FileCheck2;
}> = [
  { id: "compliance", label: "Compliance", icon: FileCheck2 },
  { id: "contratos", label: "Contratos", icon: ShieldCheck },
  { id: "costos", label: "Costos", icon: LineChart },
  { id: "raw", label: "Datos RAW", icon: Database },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { filters, setPeriodo } = useAdminContext();
  const [activeTab, setActiveTab] = useState<DashboardTab>("compliance");

  const loadDashboard = useCallback(async () => {
    if (!filters.empresaId) return initialData;

    const [empresa, compliance, contratos, costos, raw] = await Promise.all([
      getEmpresaData(filters.empresaId),
      getComplianceData(filters.empresaId),
      getContratosData(filters.empresaId),
      getCostosData(filters.empresaId),
      getAdminRawData(filters.empresaId, filters.anio, filters.mes),
    ]);

    return { empresa, compliance, contratos, costos, raw };
  }, [filters.anio, filters.empresaId, filters.mes]);

  const { data, error, loading } = useAsyncData(loadDashboard, initialData);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => currentYear + 1 - index);
  }, []);

  const yearRows = useMemo(
    () => data.compliance.filter((row) => row.mes.endsWith(` ${filters.anio}`)),
    [data.compliance, filters.anio],
  );

  const selectedRow = useMemo(
    () => yearRows.find((row) => isRowForPeriod(row, filters.anio, filters.mes)) ?? null,
    [filters.anio, filters.mes, yearRows],
  );

  const annualRenewable = useMemo(() => {
    const totalDemand = yearRows.reduce((sum, row) => sum + row.demanda_mwh, 0);
    const totalMater = yearRows.reduce((sum, row) => sum + row.mater_mwh, 0);
    return totalDemand ? Number(((totalMater / totalDemand) * 100).toFixed(2)) : 0;
  }, [yearRows]);

  const complianceTone = annualRenewable >= 20 ? "success" : "warning";
  const selectedCostSeries =
    data.costos.serie.find(
      (row) => row.tipo === "historico" && row.mes === `${selectedMonthLabel(filters.mes)} ${filters.anio}`,
    ) ?? null;

  if (!filters.empresaId) {
    return (
      <Panel className="p-8">
        <h2 className="font-fraunces text-2xl font-bold text-ivory">Selecciona una empresa desde el listado</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
          El dashboard admin necesita una empresa activa para cargar compliance, contratos, costos y
          datos RAW del mes.
        </p>
        <div className="mt-5">
          <Button onClick={() => navigate("/admin/empresas")} type="button">
            <ArrowLeft size={16} />
            Ir a empresas
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <LoadingScreen messages={["Armando dashboard admin...", "Leyendo datos reales desde Supabase..."]} />
      ) : null}

      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm uppercase text-mist">Dashboard admin</p>
            <Badge tone="plan">Sin restriccion de plan</Badge>
          </div>
          <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
            {data.empresa.razon_social || filters.empresaNombre || "Empresa seleccionada"}
          </h2>
          <p className="mt-2 text-sm text-mist">
            Nemo activo: {data.empresa.nemo || "Sin NEMO"}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label>
            <span className="text-[11px] font-semibold uppercase text-mist">Año</span>
            <select
              className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
              onChange={(event) => setPeriodo({ anio: Number(event.target.value), mes: filters.mes })}
              value={filters.anio}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-[11px] font-semibold uppercase text-mist">Mes</span>
            <select
              className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
              onChange={(event) => setPeriodo({ anio: filters.anio, mes: Number(event.target.value) })}
              value={filters.mes}
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <Button onClick={() => navigate("/admin/empresas")} type="button" variant="outline">
            <ArrowLeft size={16} />
            Volver a empresas
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          borderColor="green"
          label="% renovable acumulado"
          subtext={`Año ${filters.anio}`}
          trend={annualRenewable >= 20 ? "up" : "neutral"}
          value={percent(annualRenewable, 2)}
        />
        <StatCard
          borderColor="blue"
          label="MWh MATER del mes"
          subtext={`${selectedMonthLabel(filters.mes)} ${filters.anio}`}
          value={`${number(selectedRow?.mater_mwh ?? data.raw?.mater_mwh ?? 0, 2)} MWh`}
        />
        <StatCard
          borderColor="yellow"
          label="Costo efectivo $/MWh"
          subtext="Dato exacto informado"
          value={pesos(data.raw?.precio_efectivo_pesos_mwh ?? 0, 2)}
        />
        <div className="rounded-lg border border-navy-border border-t-2 border-t-forest bg-navy-medium p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase text-mist">Estado de cumplimiento</p>
          <div className="mt-3 flex items-center gap-3">
            <Badge tone={complianceTone}>{annualRenewable >= 20 ? "Cumple" : "Riesgo"}</Badge>
            <strong className="font-syne text-xl font-bold text-ivory">
              {annualRenewable >= 20 ? "Sobre 20%" : "Debajo de 20%"}
            </strong>
          </div>
          <p className="mt-3 text-sm text-mist">
            Basado en el acumulado del año seleccionado para la empresa activa.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            variant={activeTab === tab.id ? "primary" : "ghost"}
          >
            <tab.icon size={16} />
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "compliance" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-syne text-base font-bold text-ivory">Compliance anual</h3>
              <Badge tone={complianceTone}>{annualRenewable >= 20 ? "Cumple" : "Riesgo"}</Badge>
            </div>
            <ComplianceGauge value={annualRenewable} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-navy-border bg-navy/45 p-4">
                <p className="text-xs text-mist">Objetivo</p>
                <p className="number mt-1 font-syne text-2xl font-bold text-ivory">20%</p>
              </div>
              <div className="rounded border border-navy-border bg-navy/45 p-4">
                <p className="text-xs text-mist">Margen</p>
                <p className="number mt-1 font-syne text-2xl font-bold text-forest-light">
                  {annualRenewable >= 20 ? "+" : ""}
                  {number(annualRenewable - 20, 2)} pts
                </p>
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-navy-border p-5">
              <h3 className="font-syne text-base font-bold text-ivory">Tabla mensual</h3>
              <p className="mt-1 text-sm text-mist">Solo meses del año seleccionado</p>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-navy/55 text-xs uppercase text-mist">
                  <tr>
                    <th className="px-5 py-3">Mes</th>
                    <th className="px-5 py-3">Demanda</th>
                    <th className="px-5 py-3">MATER</th>
                    <th className="px-5 py-3">SPOT</th>
                    <th className="px-5 py-3">Renovable</th>
                    <th className="px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-border">
                  {yearRows.map((row) => (
                    <tr className="text-mist" key={row.mes}>
                      <td className="px-5 py-3 font-medium text-ivory">{row.mes}</td>
                      <td className="number px-5 py-3">{number(row.demanda_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{number(row.mater_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{number(row.spot_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{percent(row.porcentaje_renovable, 2)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={row.cumple ? "success" : "warning"}>
                          {row.cumple ? "Cumple" : "Riesgo"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {yearRows.length === 0 ? (
                    <tr>
                      <td className="px-5 py-4 text-mist" colSpan={6}>
                        No hay meses procesados para el año seleccionado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "contratos" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ChartFrame subtitle="Benchmark contra referencia de mercado" title="Contratos activos">
            <ContractChart contratos={data.contratos} />
          </ChartFrame>

          <Panel className="overflow-hidden">
            <div className="border-b border-navy-border p-5">
              <h3 className="font-syne text-base font-bold text-ivory">Detalle contractual</h3>
            </div>
            <div className="divide-y divide-navy-border">
              {data.contratos.contratos.map((contract) => (
                <div className="p-5" key={contract.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="font-syne text-lg text-ivory">{contract.tipo}</strong>
                    <Badge tone={contract.score === "optimo" || contract.score === "en_rango" ? "success" : "warning"}>
                      {contract.score.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-mist">{contract.generador}</p>
                  <p className="number mt-3 font-syne text-2xl font-bold text-ivory">
                    {usd(contract.precio_usd_mwh, 2)}/MWh
                  </p>
                  <p className="mt-2 text-xs text-mist">Vigencia: {contract.vigencia}</p>
                </div>
              ))}
              {data.contratos.contratos.length === 0 ? (
                <p className="p-5 text-sm text-mist">No hay contratos activos para esta empresa.</p>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "costos" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ChartFrame subtitle="Historico y proyeccion del costo promedio mensual" title="Costos energeticos">
            <CostChart data={data.costos.serie} />
          </ChartFrame>

          <Panel className="p-5">
            <h3 className="font-syne text-base font-bold text-ivory">Corte del mes seleccionado</h3>
            <div className="mt-4 space-y-3">
              <MetricRow
                label="Periodo"
                value={`${selectedMonthLabel(filters.mes)} ${filters.anio}`}
              />
              <MetricRow
                label="Costo historico USD/MWh"
                value={`${usd(selectedCostSeries?.costo_usd_mwh ?? 0, 2)}/MWh`}
              />
              <MetricRow
                label="Total estimado USD"
                value={usd(selectedCostSeries?.total_usd ?? 0)}
              />
              <MetricRow
                label="Precio efectivo pesos/MWh"
                value={pesos(data.raw?.precio_efectivo_pesos_mwh ?? 0, 2)}
              />
              <MetricRow
                label="Cargo transporte"
                value={pesos(data.raw?.cargo_transporte_pesos_mwh ?? 0, 2)}
              />
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "raw" ? (
        <Panel className="overflow-hidden">
          <div className="border-b border-navy-border p-5">
            <h3 className="font-syne text-base font-bold text-ivory">Datos RAW del ZIP</h3>
            <p className="mt-1 text-sm text-mist">
              Valores exactos para {selectedMonthLabel(filters.mes)} {filters.anio}.
            </p>
          </div>

          {data.raw ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-navy/55 text-xs uppercase text-mist">
                  <tr>
                    <th className="px-5 py-3">Campo</th>
                    <th className="px-5 py-3">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-border">
                  <RawRow label="mater_mwh" value={`${number(data.raw.mater_mwh, 2)} MWh`} />
                  <RawRow label="demanda_total_mwh" value={`${number(data.raw.demanda_total_mwh, 2)} MWh`} />
                  <RawRow label="importe_mater_pesos" value={pesos(data.raw.importe_mater_pesos, 2)} />
                  <RawRow label="precio_efectivo_pesos_mwh" value={pesos(data.raw.precio_efectivo_pesos_mwh, 2)} />
                  <RawRow label="precio_spot_pico_pesos_mwh" value={pesos(data.raw.precio_spot_pico_pesos_mwh, 2)} />
                  <RawRow label="precio_spot_valle_pesos_mwh" value={pesos(data.raw.precio_spot_valle_pesos_mwh, 2)} />
                  <RawRow label="precio_spot_resto_pesos_mwh" value={pesos(data.raw.precio_spot_resto_pesos_mwh, 2)} />
                  <RawRow label="cargo_transporte_pesos_mwh" value={pesos(data.raw.cargo_transporte_pesos_mwh, 2)} />
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-mist">
              No encontramos datos RAW para la empresa y el mes seleccionados.
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-navy-border bg-navy/45 px-4 py-3">
      <span className="text-sm text-mist">{label}</span>
      <span className="text-right text-sm font-medium text-ivory">{value}</span>
    </div>
  );
}

function RawRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="text-mist">
      <td className="px-5 py-3 font-medium text-ivory">{label}</td>
      <td className="px-5 py-3 number">{value}</td>
    </tr>
  );
}
