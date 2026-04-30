import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchExposicionSpotMensual } from "../../services/exposicionSpot";
import type { ExposicionSpotResponse } from "../../types/exposicionSpot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n * 100)}%`; }
function fmtMwh(n: number | null | undefined) { return n == null ? "—" : `${n.toLocaleString("es-AR")} MWh`; }
function fmtPesos(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function mesLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

const EMPTY: ExposicionSpotResponse = {
  nemo: "", meses: 12, autorizados: [],
  resumen: { meses: 0, demandaRealMwh: 0, compraSpotMwh: 0, demandaContratadaMwh: 0, pctSpot: null, pctMat: null, spotPesos: 0, costoSpotPromedioPesosMwh: null, subContratoMwh: 0, sobreContratoMwh: 0 },
  serie: [],
};

// ---------------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------------
export default function ModuloExposicionSpot() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);
  const [anchorMes, setAnchorMes] = useState<string>("");

  const loader = useCallback(
    () => fetchExposicionSpotMensual({ nemo: agente?.nemo, meses, hasta: anchorMes || null }),
    [agente?.nemo, meses, anchorMes],
  );
  const { data, loading, error } = useAsyncData<ExposicionSpotResponse>(loader, EMPTY);

  if (loading) return <LoadingScreen messages={["Cargando exposición spot..."]} />;

  const r = data.resumen;

  // Series ordenadas cronológicamente (de más antiguo a más reciente).
  const serieAsc = data.serie.slice().reverse();

  const chartData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    spot: (p.pctSpot ?? 0) * 100,
    mat: (p.pctMat ?? 0) * 100,
    resto: Math.max(0, 100 - ((p.pctSpot ?? 0) * 100) - ((p.pctMat ?? 0) * 100)),
  }));

  const costoData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    costo: p.costoSpotPromedioPesosMwh ?? 0,
  }));

  const balanceData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    sub: -(p.subContratoMwh ?? 0),       // negativo, se ve hacia abajo
    sobre: p.sobreContratoMwh ?? 0,
    neto: (p.sobreContratoMwh ?? 0) - (p.subContratoMwh ?? 0),
  }));

  const sinDatos = data.serie.length === 0;

  // Promedio del costo spot para línea de referencia
  const costosValidos = costoData.filter((d) => d.costo > 0);
  const promedioCosto = costosValidos.length > 0
    ? costosValidos.reduce((a, d) => a + d.costo, 0) / costosValidos.length
    : 0;

  return (
    <div>
      <ModuleHeader
        title="Exposición Spot y Cobertura"
        subtitle="Riesgo spot, cobertura contractual y mix mensual"
        tooltip="El mercado spot es donde se compra energía al precio horario del MEM cuando no está cubierta por contratos MATER o bilaterales. Mayor exposición spot = mayor riesgo de precio."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        anchorMes={anchorMes || ultimoMesDisponible}
        onAnchorChange={(mes) => setAnchorMes(mes === ultimoMesDisponible ? "" : mes)}
        ultimoMesDisponible={ultimoMesDisponible}
        maxMeses={60}
      />

      {error && <AlertaBanner type="warning" message={error} />}

      {sinDatos ? (
        <EmptyState icon="📈" title="Sin datos de exposición" description="No hay registros de compra para este agente en el período seleccionado. Es posible que los datos aún no estén disponibles." />
      ) : (
        <>
          {/* Cards resumen */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="% Spot promedio"
              value={fmtPct(r.pctSpot)}
              sub={`Últimos ${meses} meses`}
              tone={(r.pctSpot ?? 0) > 0.7 ? "red" : (r.pctSpot ?? 0) > 0.4 ? "amber" : "teal"}
            />
            <StatCard
              label="% MATER promedio"
              value={fmtPct(r.pctMat)}
              sub="Cobertura renovable"
              tone="teal"
            />
            <StatCard
              label="Costo spot prom."
              value={r.costoSpotPromedioPesosMwh != null ? `${fmt(r.costoSpotPromedioPesosMwh, 0)} $/MWh` : "—"}
              sub="Precio implícito"
            />
            <StatCard
              label="Gasto spot total"
              value={fmtPesos(r.spotPesos)}
              sub={`${meses} meses acumulado`}
            />
          </div>

          {/* Sub/sobre contrato totales */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sub-contrato acumulado</p>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">DÉFICIT</span>
              </div>
              <p className="mt-1 text-xl font-bold text-red-600 tabular-nums">{fmtMwh(r.subContratoMwh)}</p>
              <p className="text-xs text-slate-500">Energía comprada en spot por encima del contrato</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sobre-contrato acumulado</p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">EXCESO</span>
              </div>
              <p className="mt-1 text-xl font-bold text-emerald-600 tabular-nums">{fmtMwh(r.sobreContratoMwh)}</p>
              <p className="text-xs text-slate-500">Energía contratada que excedió el consumo real</p>
            </div>
          </div>

          {/* Mix mensual + Balance contractual */}
          <div className="grid gap-5 mb-5 lg:grid-cols-2">
            {chartData.length > 0 && (
              <ChartCard
                title="Mix mensual de compra"
                hint="Spot, MATER y resto (bilaterales/plus) en porcentaje del consumo del mes."
              >
                <ResponsiveContainer height={240} width="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="mes" tick={chartAxisTick} />
                    <YAxis tick={chartAxisTick} unit="%" domain={[0, 100]} width={40} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(1)}%`, name as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="spot" name="Spot" stackId="a" fill="#f97316" />
                    <Bar dataKey="mat" name="MATER" stackId="a" fill="#15caca" />
                    <Bar dataKey="resto" name="Resto" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {balanceData.length > 0 && (
              <ChartCard
                title="Balance contractual mensual"
                hint="Diferencia entre lo que comprás en spot por sobre tu contrato (rojo, hacia abajo) o lo que dejás sin usar de tu contrato (verde, hacia arriba)."
              >
                <ResponsiveContainer height={240} width="100%">
                  <ComposedChart data={balanceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="mes" tick={chartAxisTick} />
                    <YAxis tick={chartAxisTick} width={55} tickFormatter={(v) => v.toLocaleString("es-AR")} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v: unknown, name: unknown) => [`${Math.abs(v as number).toLocaleString("es-AR")} MWh`, name as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
                    <Bar dataKey="sobre" name="Sobre-contrato" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sub" name="Sub-contrato" fill="#ef4444" radius={[0, 0, 4, 4]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Costo spot */}
          {costosValidos.length > 0 && (
            <ChartCard
              title="Costo spot promedio ($/MWh)"
              hint="Precio promedio por MWh comprado en el mercado spot."
              right={promedioCosto > 0 ? (
                <span className="text-xs text-slate-400">
                  Promedio: <strong className="text-slate-600">${promedioCosto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}/MWh</strong>
                </span>
              ) : undefined}
            >
              <ResponsiveContainer height={200} width="100%">
                <LineChart data={costoData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} width={70} tickFormatter={(v) => (v as number).toLocaleString("es-AR", { maximumFractionDigits: 0 })} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown) => [`$${(v as number).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`, "Costo spot"]}
                  />
                  {promedioCosto > 0 && (
                    <ReferenceLine
                      y={promedioCosto}
                      stroke="#94a3b8"
                      strokeDasharray="4 3"
                      label={{ value: "Promedio", position: "right", fill: "#94a3b8", fontSize: 10 }}
                    />
                  )}
                  <Line dataKey="costo" stroke="#163759" strokeWidth={2.5} dot={{ r: 3, fill: "#163759" }} activeDot={{ r: 5 }} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
