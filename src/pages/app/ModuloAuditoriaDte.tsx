import { AlertTriangle, FileSearch, ReceiptText } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { ChartCard, chartAxisTick, chartGridStroke, chartTooltipStyle } from "../../components/app/ChartCard";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { RangeSelector } from "../../components/app/RangeSelector";
import { StatCard } from "../../components/app/StatCard";
import { Badge } from "../../components/ui/Badge";
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchAuditoriaDte } from "../../services/auditoriaDte";
import type { AuditoriaDtePoint, AuditoriaDteResponse, AuditoriaDteResumen } from "../../types/auditoriaDte";

const MAX_MESES = 63;

function fmt(n: number | null | undefined, d = 1) { return n == null ? "-" : n.toFixed(d).replace(".", ","); }
function fmtPesos(n: number | null | undefined) {
  if (n == null) return "-";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function fmtCompact(n: number | null | undefined) {
  if (n == null) return "-";
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function mesLabel(periodo: string) {
  const [y, m] = periodo.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}
function estadoLabel(estado: string) {
  const labels: Record<string, string> = {
    ok: "OK",
    sin_factura_total: "Sin total DTE",
    sin_conceptos: "Sin conceptos",
    revisar_reconciliacion: "Revisar cierre",
    variacion_mensual_alta: "Variacion alta",
  };
  return labels[estado] ?? estado;
}
function estadoTone(estado: string): "success" | "warning" | "danger" | "neutral" {
  if (estado === "ok") return "success";
  if (estado === "revisar_reconciliacion") return "danger";
  if (estado === "sin_datos") return "neutral";
  return "warning";
}

const EMPTY: AuditoriaDteResponse = {
  nemo: "",
  meses: MAX_MESES,
  autorizados: [],
  resumen: {
    meses: 0,
    ultimoMes: null,
    facturaTotalPesos: 0,
    importeRevisablePesos: 0,
    mesesConRevision: 0,
    costoPromedioPesosMwh: null,
  },
  serie: [],
  conceptosUltimoMes: [],
  notas: { alcance: "", estado: "" },
};

function recomputeResumen(serie: AuditoriaDtePoint[]): AuditoriaDteResumen {
  const ultimoMes = serie.at(-1) ?? null;
  const facturaTotal = serie.reduce((sum, row) => sum + (row.facturaTotalPesos ?? 0), 0);
  const importeRevisable = serie.reduce((sum, row) => sum + (row.importeRevisablePesos ?? 0), 0);
  const mesesConRevision = serie.filter((row) => row.estadoAuditoria !== "ok").length;
  const demanda = serie.reduce((sum, row) => sum + (row.demandaRealMwh ?? 0), 0);
  return {
    meses: serie.length,
    ultimoMes,
    facturaTotalPesos: facturaTotal,
    importeRevisablePesos: importeRevisable,
    mesesConRevision,
    costoPromedioPesosMwh: demanda > 0 ? facturaTotal / demanda : null,
  };
}

export default function ModuloAuditoriaDte() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(() => fetchAuditoriaDte({ nemo: agente?.nemo, meses: MAX_MESES }), [agente?.nemo]);
  const { data, loading, error } = useAsyncData<AuditoriaDteResponse>(loader, EMPTY);

  const serieAsc = useMemo(() => data.serie.slice(-meses), [data.serie, meses]);
  const resumen = useMemo(() => recomputeResumen(serieAsc), [serieAsc]);
  const ultimoMesEnSerie = data.serie.at(-1)?.periodo ?? ultimoMesDisponible;
  const sinDatos = serieAsc.length === 0;
  const ultimo = resumen.ultimoMes;

  const evolucionData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    factura: (p.facturaTotalPesos ?? 0) / 1_000_000,
    costo: p.costoDtePesosMwh ?? 0,
    revisar: (p.importeRevisablePesos ?? 0) / 1_000_000,
  }));

  const bloquesData = ultimo ? [
    { bloque: "Energia", importe: ultimo.energiaPesos ?? 0 },
    { bloque: "Potencia", importe: ultimo.potenciaPesos ?? 0 },
    { bloque: "Transporte", importe: ultimo.transportePesos ?? 0 },
    { bloque: "Obras", importe: ultimo.obrasServiciosPesos ?? 0 },
    { bloque: "Ajustes", importe: ultimo.ajustesOperativosPesos ?? 0 },
    { bloque: "Res. 281", importe: ultimo.cargosAplicadosPesos ?? 0 },
  ].filter((row) => Math.abs(row.importe) > 0) : [];

  if (loading) return <ModuleSkeleton />;

  return (
    <div>
      <ModuleHeader
        title="Auditoria DTE / Costos MEM"
        subtitle="Liquidacion CAMMESA, conceptos y alertas de revision"
        tooltip="Este modulo audita la liquidacion publica CAMMESA/DTE. No incluye la factura final privada del distribuidor, comercializador ni condiciones contractuales no cargadas."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        ultimoMesDisponible={ultimoMesEnSerie}
        maxMeses={Math.max(1, data.serie.length || MAX_MESES)}
        debounceMs={0}
      />

      {error && <AlertaBanner type="warning" message={error} />}
      {!sinDatos && data.notas.alcance && (
        <div className="mb-5">
          <AlertaBanner type="info" message={data.notas.alcance} />
        </div>
      )}
      {ultimo && ultimo.estadoAuditoria !== "ok" && (
        <div className="mb-5">
          <AlertaBanner
            type="warning"
            message={`Ultimo DTE con estado "${estadoLabel(ultimo.estadoAuditoria)}". Revisar desvio, conceptos y filas fuente antes de interpretar esto como reclamo.`}
          />
        </div>
      )}

      {sinDatos ? (
        <EmptyState
          icon={<FileSearch size={28} className="text-slate-400" />}
          title="Sin auditoria DTE disponible"
          description="No encontramos liquidaciones DTE procesadas para este agente en el periodo seleccionado."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="DTE ultimo mes"
              value={fmtPesos(ultimo?.facturaTotalPesos)}
              sub={ultimo?.periodo ?? "Ultimo periodo"}
              tone={ultimo?.estadoAuditoria === "ok" ? "emerald" : "amber"}
            />
            <StatCard
              label="Costo DTE"
              value={ultimo?.costoDtePesosMwh != null ? `${fmt(ultimo.costoDtePesosMwh, 0)} $/MWh` : "-"}
              sub="Liquidacion / demanda"
            />
            <StatCard
              label="Importe a revisar"
              value={fmtPesos(ultimo?.importeRevisablePesos)}
              sub="Indicador de auditoria"
              tone={(ultimo?.importeRevisablePesos ?? 0) > 0 ? "red" : "emerald"}
            />
            <StatCard
              label="Meses observados"
              value={`${resumen.mesesConRevision}/${resumen.meses}`}
              sub="Con estado distinto de OK"
              tone={resumen.mesesConRevision > 0 ? "amber" : "emerald"}
            />
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <ChartCard
              title="Evolucion de liquidacion DTE"
              hint="Barras en millones de pesos; linea de costo promedio por MWh."
            >
              <ResponsiveContainer height={250} width="100%">
                <ComposedChart data={evolucionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis yAxisId="left" tick={chartAxisTick} width={56} unit="M$" />
                  <YAxis yAxisId="right" orientation="right" tick={chartAxisTick} width={70} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => {
                      const name = n as string;
                      if (name === "Costo $/MWh") return [`$${(v as number).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`, name];
                      return [`${(v as number).toFixed(1)} M$`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="left" dataKey="factura" name="DTE total" fill="#163759" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="revisar" name="A revisar" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="costo" name="Costo $/MWh" stroke="#15caca" strokeWidth={2.5} dot={{ r: 3, fill: "#15caca" }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Composicion del ultimo DTE"
              hint="Bloques contables parseados desde la seccion 4.3 del DTE."
            >
              {bloquesData.length > 0 ? (
                <ResponsiveContainer height={250} width="100%">
                  <BarChart data={bloquesData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis type="number" tick={chartAxisTick} tickFormatter={(v) => fmtCompact(v as number)} />
                    <YAxis type="category" dataKey="bloque" tick={chartAxisTick} width={78} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [fmtPesos(v as number), "Importe"]} />
                    <Bar dataKey="importe" name="Importe" fill="#15caca" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">
                  Sin desglose de conceptos para el ultimo periodo.
                </div>
              )}
            </ChartCard>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#163759]">
                  <ReceiptText size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#163759]">Conceptos del ultimo DTE</h3>
                  <p className="text-xs text-slate-500">Importes agrupados con trazabilidad a filas del archivo CAMMESA.</p>
                </div>
              </div>
              <Badge tone={estadoTone(ultimo?.estadoAuditoria ?? "sin_datos")}>
                {estadoLabel(ultimo?.estadoAuditoria ?? "sin_datos")}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-bold">Bloque</th>
                    <th className="px-4 py-3 font-bold">Importe</th>
                    <th className="px-4 py-3 font-bold">Fuente</th>
                    <th className="px-4 py-3 font-bold">Filas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conceptosUltimoMes.map((concepto) => (
                    <tr key={concepto.conceptoCodigo} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-700">{concepto.bloqueNombre}</div>
                        <div className="font-mono text-[11px] text-slate-400">{concepto.conceptoCodigo}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">
                        {fmtPesos(concepto.importePesos)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{concepto.sourceFile ?? "raw_dte"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {concepto.sourceRowDesde === concepto.sourceRowHasta
                          ? concepto.sourceRowDesde ?? "-"
                          : `${concepto.sourceRowDesde ?? "-"}-${concepto.sourceRowHasta ?? "-"}`}
                      </td>
                    </tr>
                  ))}
                  {data.conceptosUltimoMes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                        No hay conceptos parseados para el ultimo DTE.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {data.notas.estado && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>{data.notas.estado}</p>
            </div>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
