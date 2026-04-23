import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useState } from "react";
import { ChartFrame } from "../components/charts/ChartFrame";
import { ComplianceGauge } from "../components/charts/ComplianceGauge";
import { DemandChart } from "../components/charts/DemandChart";
import { MixDonut } from "../components/charts/MixDonut";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Panel } from "../components/ui/Panel";
import { useAsyncData } from "../hooks/useAsyncData";
import { getComplianceData, getMercadoData } from "../services/energyData";
import type { ComplianceRow, MercadoData } from "../types";
import { getSession } from "../utils/session";

const emptyLatest: ComplianceRow = {
  mes: "",
  demanda_mwh: 0,
  mater_mwh: 0,
  spot_mwh: 0,
  porcentaje_renovable: 0,
  acuerdo_mes_mwh: 0,
  cumple: false,
  alerta: false,
};
const emptyMercado: MercadoData = { mem_mix: [], mater_spot: [] };

async function loadCompliancePageData() {
  const [rows, mercado] = await Promise.all([getComplianceData(), getMercadoData()]);
  return { rows, mercado };
}

export default function Compliance() {
  const [reportStatus, setReportStatus] = useState<"idle" | "loading" | "sent">("idle");
  const session = getSession();
  const { data, error, loading } = useAsyncData(loadCompliancePageData, {
    rows: [] as ComplianceRow[],
    mercado: emptyMercado,
  });
  const latest = data.rows[data.rows.length - 1] ?? emptyLatest;
  const margin = Number((latest.porcentaje_renovable - 20).toFixed(2));

  const requestReport = () => {
    setReportStatus("loading");
    window.setTimeout(() => setReportStatus("sent"), 1500);
  };

  return (
    <div className="space-y-6">
      {loading ? <LoadingScreen messages={["Cargando compliance...", "Consultando Supabase..."]} /> : null}
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-mist">Compliance renovable</p>
          <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
            Seguimiento del 20% renovable
          </h2>
        </div>
        <Button disabled={reportStatus === "loading"} onClick={requestReport}>
          <Download size={16} />
          {reportStatus === "loading" ? "Generando reporte..." : "Descargar reporte PDF"}
        </Button>
      </div>

      {reportStatus === "sent" ? (
        <section className="rounded border border-forest/30 bg-forest/10 px-4 py-3 text-sm text-forest-light">
          Tu reporte fue enviado a {session?.email ?? "tu correo corporativo"}.
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.4fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-syne text-base font-bold text-ivory">
              Estado anual
            </h3>
            <Badge tone={latest.cumple ? "success" : "warning"}>
              {latest.cumple ? "Cumple" : "Riesgo"}
            </Badge>
          </div>
          <ComplianceGauge value={latest.porcentaje_renovable} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-navy-border bg-navy/45 p-4">
              <p className="text-xs text-mist">Objetivo</p>
              <p className="number mt-1 font-syne text-2xl font-bold text-ivory">
                20%
              </p>
            </div>
            <div className="rounded border border-navy-border bg-navy/45 p-4">
              <p className="text-xs text-mist">Margen</p>
              <p className="number mt-1 font-syne text-2xl font-bold text-forest-light">
                {margin >= 0 ? "+" : ""}
                {margin} pts
              </p>
            </div>
          </div>
        </Panel>

        <ChartFrame subtitle="Demanda MATER/SPOT con objetivo contractual" title="EvoluciÃ³n mensual">
          <DemandChart data={data.rows} />
        </ChartFrame>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel className="overflow-hidden">
          <div className="border-b border-navy-border p-5">
            <h3 className="font-syne text-base font-bold text-ivory">
              Tabla mensual
            </h3>
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
                {data.rows.map((row) => (
                  <tr className="text-mist" key={row.mes}>
                    <td className="px-5 py-3 font-medium text-ivory">{row.mes}</td>
                    <td className="number px-5 py-3">{row.demanda_mwh} MWh</td>
                    <td className="number px-5 py-3">{row.mater_mwh} MWh</td>
                    <td className="number px-5 py-3">{row.spot_mwh} MWh</td>
                    <td className="number px-5 py-3">{row.porcentaje_renovable}%</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-2 ${row.cumple ? "text-forest-light" : "text-alert"}`}>
                        {row.cumple ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        {row.cumple ? "Cumple" : "Riesgo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-5">
            <h3 className="font-syne text-base font-bold text-ivory">
              Contexto de mercado
            </h3>
            <p className="mt-1 text-sm text-mist">ComposiciÃ³n MEM</p>
          </div>
          <MixDonut data={data.mercado.mem_mix} title="MEM Argentina" />
        </Panel>
      </div>
    </div>
  );
}
