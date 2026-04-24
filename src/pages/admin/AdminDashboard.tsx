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

function isRowInYear(row: ComplianceRow, anio: number) {
  return row.anio === anio;
}

const emptyEmpresa: EmpresaData = {
  id: "",
  razon_social: "",
  nemo: "",
  tipo_usuario: "GUME",
  comercializador: "",
  plan_activo: "compliance",
  miembro_desde: "",
  acuerdo_mensual_mwh: null,
};

const emptyContratos: ContratosData = {
  precio_mercado_referencia: 0,
  precio_mercado_por_tipo: { RPB: 0, RPE: 0, BAS: 0 },
  contratos: [],
};

const emptyCostos: CostosData = {
  serie: [],
  desglose_mes: [],
  desglose_periodo: null,
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
  return row.anio === anio && row.mes_numero === mes;
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
      getContratosData(filters.empresaId, filters.anio, filters.mes),
      getCostosData(filters.empresaId, filters.anio, filters.mes),
      getAdminRawData(filters.empresaId, filters.anio, filters.mes),
    ]);

    return { empresa, compliance, contratos, costos, raw };
  }, [filters.anio, filters.empresaId, filters.mes]);

  const { data, error, loading } = useAsyncData(loadDashboard, initialData);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const available = new Set<number>(data.compliance.map((row) => row.anio).filter(Boolean));
    available.add(filters.anio);
    available.add(currentYear);
    return Array.from(available).sort((a, b) => b - a);
  }, [data.compliance, filters.anio]);

  const yearRows = useMemo(
    () => data.compliance.filter((row) => isRowInYear(row, filters.anio)),
    [data.compliance, filters.anio],
  );

  const selectedRow = useMemo(
    () => yearRows.find((row) => isRowForPeriod(row, filters.anio, filters.mes)) ?? null,
    [filters.anio, filters.mes, yearRows],
  );

  const cleanYearRows = useMemo(() => yearRows.filter((row) => !row.dato_sospechoso), [yearRows]);
  const sospechososAnio = yearRows.length - cleanYearRows.length;

  const annualRenewable = useMemo(() => {
    const totalDemand = cleanYearRows.reduce((sum, row) => sum + row.demanda_mwh, 0);
    const totalMater = cleanYearRows.reduce((sum, row) => sum + row.mater_mwh, 0);
    if (!totalDemand) return 0;
    const pct = (totalMater / totalDemand) * 100;
    return Number(Math.max(0, Math.min(100, pct)).toFixed(2));
  }, [cleanYearRows]);

  const ytdMonthsCovered = cleanYearRows.length;

  const prevYearSameCutoff = useMemo(() => {
    const monthsInYear = new Set(cleanYearRows.map((row) => row.mes_numero));
    if (!monthsInYear.size) return 0;
    const prevRows = data.compliance.filter(
      (row) =>
        row.anio === filters.anio - 1 &&
        monthsInYear.has(row.mes_numero) &&
        !row.dato_sospechoso,
    );
    const totalDemand = prevRows.reduce((sum, row) => sum + row.demanda_mwh, 0);
    const totalMater = prevRows.reduce((sum, row) => sum + row.mater_mwh, 0);
    return totalDemand ? Number(((totalMater / totalDemand) * 100).toFixed(2)) : 0;
  }, [data.compliance, filters.anio, cleanYearRows]);

  const projectedYearClose = useMemo(() => {
    if (!cleanYearRows.length || cleanYearRows.length === 12) return annualRenewable;
    const coveredMonths = new Set(cleanYearRows.map((row) => row.mes_numero));
    const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (m) => !coveredMonths.has(m),
    );
    const historyByMonth = new Map<number, { mater: number; demanda: number }[]>();
    data.compliance.forEach((row) => {
      if (row.anio >= filters.anio || row.dato_sospechoso) return;
      const bucket = historyByMonth.get(row.mes_numero) ?? [];
      bucket.push({ mater: row.mater_mwh, demanda: row.demanda_mwh });
      historyByMonth.set(row.mes_numero, bucket);
    });
    const avgDemandYtd = cleanYearRows.reduce((sum, row) => sum + row.demanda_mwh, 0) / cleanYearRows.length;
    const avgMaterYtd = cleanYearRows.reduce((sum, row) => sum + row.mater_mwh, 0) / cleanYearRows.length;
    let projectedMater = cleanYearRows.reduce((sum, row) => sum + row.mater_mwh, 0);
    let projectedDemand = cleanYearRows.reduce((sum, row) => sum + row.demanda_mwh, 0);
    missingMonths.forEach((m) => {
      const bucket = historyByMonth.get(m) ?? [];
      if (bucket.length) {
        projectedMater += bucket.reduce((sum, r) => sum + r.mater, 0) / bucket.length;
        projectedDemand += bucket.reduce((sum, r) => sum + r.demanda, 0) / bucket.length;
      } else {
        projectedMater += avgMaterYtd;
        projectedDemand += avgDemandYtd;
      }
    });
    if (!projectedDemand) return 0;
    const pct = (projectedMater / projectedDemand) * 100;
    return Number(Math.max(0, Math.min(100, pct)).toFixed(2));
  }, [annualRenewable, data.compliance, filters.anio, cleanYearRows]);

  const annualTrend: "up" | "down" | "neutral" =
    !prevYearSameCutoff || Math.abs(annualRenewable - prevYearSameCutoff) < 0.5
      ? "neutral"
      : annualRenewable > prevYearSameCutoff
        ? "up"
        : "down";

  const selectedIndex = yearRows.findIndex(
    (row) => row.anio === filters.anio && row.mes_numero === filters.mes,
  );
  const previousRow = selectedIndex > 0 ? yearRows[selectedIndex - 1] : null;
  const materTrend: "up" | "down" | "neutral" = !previousRow || !selectedRow
    ? "neutral"
    : selectedRow.mater_mwh > previousRow.mater_mwh + 0.5
      ? "up"
      : selectedRow.mater_mwh < previousRow.mater_mwh - 0.5
        ? "down"
        : "neutral";

  const complianceTone = projectedYearClose >= 20 ? "success" : "warning";
  const selectedCostSeries =
    data.costos.serie.find(
      (row) => row.tipo === "historico" && row.anio === filters.anio && row.mes_numero === filters.mes,
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

      {selectedRow?.dato_sospechoso ? (
        <section className="rounded border border-alert/40 bg-alert/10 px-4 py-3 text-sm text-ivory">
          <strong>Dato sospechoso en el mes seleccionado.</strong>{" "}
          {selectedRow.sospechoso_motivo ?? "Revisar archivo CAMMESA original."}
        </section>
      ) : sospechososAnio > 0 ? (
        <section className="rounded border border-alert/30 bg-alert/5 px-4 py-2 text-xs text-mist">
          {sospechososAnio} mes{sospechososAnio > 1 ? "es" : ""} del año con datos marcados sospechosos. Excluidos del cálculo YTD / proyección.
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
          label="% renovable YTD"
          subtext={`${filters.anio} · ${ytdMonthsCovered}/12 meses · cierre proy. ${percent(projectedYearClose, 2)}`}
          trend={annualTrend}
          value={percent(annualRenewable, 2)}
        />
        <StatCard
          borderColor="blue"
          label="MWh MATER del mes"
          subtext={
            previousRow
              ? `${selectedMonthLabel(filters.mes)} ${filters.anio} · prev ${number(previousRow.mater_mwh, 2)} MWh`
              : `${selectedMonthLabel(filters.mes)} ${filters.anio}`
          }
          trend={materTrend}
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
            <Badge tone={complianceTone}>{projectedYearClose >= 20 ? "Cumple" : "Riesgo"}</Badge>
            <strong className="font-syne text-xl font-bold text-ivory">
              {projectedYearClose >= 20 ? "Proyección sobre 20%" : "Proyección bajo 20%"}
            </strong>
          </div>
          <p className="mt-3 text-sm text-mist">
            YTD {percent(annualRenewable, 2)} ({ytdMonthsCovered}/12 meses). Cierre proyectado {percent(projectedYearClose, 2)} con estacionalidad histórica.
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
              <Badge tone={complianceTone}>{projectedYearClose >= 20 ? "Cumple" : "Riesgo"}</Badge>
            </div>
            <ComplianceGauge value={projectedYearClose} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-navy-border bg-navy/45 p-4">
                <p className="text-xs text-mist">YTD</p>
                <p className="number mt-1 font-syne text-2xl font-bold text-ivory">
                  {percent(annualRenewable, 2)}
                </p>
                <p className="mt-1 text-[11px] text-mist">{ytdMonthsCovered}/12 meses</p>
              </div>
              <div className="rounded border border-navy-border bg-navy/45 p-4">
                <p className="text-xs text-mist">Cierre proy.</p>
                <p className="number mt-1 font-syne text-2xl font-bold text-ivory">
                  {percent(projectedYearClose, 2)}
                </p>
                <p className="mt-1 text-[11px] text-mist">Objetivo 20%</p>
              </div>
              <div className="rounded border border-navy-border bg-navy/45 p-4">
                <p className="text-xs text-mist">Margen cierre</p>
                <p className="number mt-1 font-syne text-2xl font-bold text-forest-light">
                  {projectedYearClose >= 20 ? "+" : ""}
                  {number(projectedYearClose - 20, 2)} pts
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
                      <td className="px-5 py-3 font-medium text-ivory">
                        {row.mes}
                        {row.dato_sospechoso ? (
                          <span
                            className="ml-2 rounded border border-alert/45 bg-alert/10 px-1.5 py-0.5 text-[10px] uppercase text-alert"
                            title={row.sospechoso_motivo ?? ""}
                          >
                            sospechoso
                          </span>
                        ) : null}
                      </td>
                      <td className="number px-5 py-3">{number(row.demanda_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{number(row.mater_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{number(row.spot_mwh, 2)} MWh</td>
                      <td className="number px-5 py-3">{percent(row.porcentaje_renovable, 2)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={row.dato_sospechoso ? "neutral" : row.cumple ? "success" : "warning"}>
                          {row.dato_sospechoso ? "N/A" : row.cumple ? "Cumple" : "Riesgo"}
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
                    <Badge
                      tone={
                        contract.score === "optimo" || contract.score === "en_rango"
                          ? "success"
                          : contract.score === "sin_referencia"
                            ? "neutral"
                            : "warning"
                      }
                    >
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
