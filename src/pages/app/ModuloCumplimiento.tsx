import { Leaf } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchCompliance27191 } from "../../services/compliance27191";
import type { Compliance27191Point, Compliance27191Response, Compliance27191Resumen } from "../../types/compliance27191";

const MAX_MESES = 63;

function fmt(n: number | null | undefined, d = 1) { return n == null ? "—" : n.toFixed(d).replace(".", ","); }
function fmtPct(n: number | null | undefined) { return n == null ? "—" : `${fmt(n * 100)}%`; }
function fmtPesos(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}
function mesLabel(p: string) {
  const [y, m] = p.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

const EMPTY: Compliance27191Response = {
  nemo: "", meses: MAX_MESES, autorizados: [],
  resumen: { meses: 0, ultimoMes: null, pctRenovablePromedio: null, renovableContratadoMwh: 0, brechaMwh: 0, multaEstimadaPesos: 0, anioEnCurso: null, brechaAnioEnCursoMwh: 0, multaAnioEnCursoPesos: 0, cumpleYtd: false, brechaYtdMwh: null },
  serie: [],
  notas: { multa: "", obligacion: "" },
};

function recomputeResumen(serie: Compliance27191Point[]): Compliance27191Resumen {
  const ultimoMes = serie.at(-1) ?? null;
  const latestYear = ultimoMes?.anio ?? null;
  const yearRows = latestYear === null ? [] : serie.filter((row) => row.anio === latestYear);
  const demanda = serie.reduce((sum, row) => sum + (row.demandaRealMwh ?? 0), 0);
  const renovable = serie.reduce((sum, row) => sum + (row.renovableContratadoMwh ?? 0), 0);
  const brecha = serie.reduce((sum, row) => sum + (row.brechaMwh ?? 0), 0);
  const multa = serie.reduce((sum, row) => sum + (row.multaEstimadaPesos ?? 0), 0);
  const brechaAnio = yearRows.reduce((sum, row) => sum + (row.brechaMwh ?? 0), 0);
  const multaAnio = yearRows.reduce((sum, row) => sum + (row.multaEstimadaPesos ?? 0), 0);

  return {
    meses: serie.length,
    ultimoMes,
    pctRenovablePromedio: demanda > 0 ? renovable / demanda : null,
    renovableContratadoMwh: renovable,
    brechaMwh: brecha,
    multaEstimadaPesos: multa,
    anioEnCurso: latestYear,
    brechaAnioEnCursoMwh: brechaAnio,
    multaAnioEnCursoPesos: multaAnio,
    cumpleYtd: ultimoMes?.cumpleYtd ?? false,
    brechaYtdMwh: ultimoMes?.brechaYtdMwh ?? null,
  };
}

export default function ModuloCumplimiento() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);
  const [anchorMes, setAnchorMes] = useState("");

  const loader = useCallback(() => fetchCompliance27191({ nemo: agente?.nemo, meses: MAX_MESES }), [agente?.nemo]);
  const { data, loading, error } = useAsyncData<Compliance27191Response>(loader, EMPTY);

  const serieCompleta = data.serie;
  const ultimoMesEnSerie = serieCompleta.at(-1)?.periodo ?? ultimoMesDisponible;
  const anchorEfectivo = anchorMes || ultimoMesEnSerie;
  const view = useMemo(() => {
    const filtrada = serieCompleta.filter((p) => p.periodo <= anchorEfectivo);
    const ventana = filtrada.slice(-meses);
    return { ventana, resumen: recomputeResumen(ventana) };
  }, [serieCompleta, meses, anchorEfectivo]);

  if (loading) return <ModuleSkeleton />;

  const r = view.resumen;
  const sinDatos = view.ventana.length === 0;
  const serieAsc = view.ventana;

  const realVsObligData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    real: (p.pctRenovableReal ?? 0) * 100,
    obligacion: (p.obligacionPct ?? 0) * 100,
    cumple: p.cumpleMes,
  }));

  const ytdData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    realYtd: (p.pctRenovableYtd ?? 0) * 100,
    obligYtd: (p.obligacionPct ?? 0) * 100,
  }));

  const brechaData = serieAsc.map((p) => ({
    mes: mesLabel(p.periodo),
    brecha: p.brechaMwh ?? 0,
    multa: (p.multaEstimadaPesos ?? 0) / 1_000_000,
  }));

  const tieneBrecha = brechaData.some((d) => d.brecha > 0);

  return (
    <div>
      <ModuleHeader
        title="Cumplimiento Renovable 27.191"
        subtitle="Brecha, cumplimiento y multa estimada"
        tooltip="La Ley 27.191 obliga a los Grandes Usuarios del MEM a cubrir un porcentaje creciente de su consumo anual con energía renovable (MATER). El incumplimiento genera multa estimada."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        anchorMes={anchorEfectivo}
        onAnchorChange={(mes) => setAnchorMes(mes === ultimoMesEnSerie ? "" : mes)}
        allowStartSelect
        ultimoMesDisponible={ultimoMesEnSerie}
        maxMeses={Math.max(1, serieCompleta.length || MAX_MESES)}
        debounceMs={0}
      />

      {error && <AlertaBanner type="warning" message={error} />}
      {!sinDatos && (
        <div className="mb-5">
          <AlertaBanner
            type="info"
            message="La Ley 27.191 evalúa el cumplimiento al cierre anual (31/dic). Los indicadores mensuales son orientativos sobre el ritmo del año."
          />
        </div>
      )}
      {!sinDatos && !r.cumpleYtd && (
        <div className="mb-5">
          <AlertaBanner
            type="warning"
            message={`No cumplís el cupo renovable acumulado del año. Brecha YTD: ${r.brechaYtdMwh?.toLocaleString("es-AR") ?? "—"} MWh.`}
          />
        </div>
      )}

      {sinDatos ? (
        <EmptyState icon={<Leaf size={28} className="text-emerald-500" />} title="Sin datos de cumplimiento" description="No encontramos datos de renovables para este agente. Es posible que no tenga contratos MATER o que los datos aún no estén disponibles." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Renovable promedio"
              value={fmtPct(r.pctRenovablePromedio)}
              sub={`Últimos ${meses} meses`}
              tone={(r.pctRenovablePromedio ?? 0) >= 0.10 ? "emerald" : "red"}
            />
            <StatCard
              label="Brecha acumulada"
              value={r.brechaMwh ? `${r.brechaMwh.toLocaleString("es-AR")} MWh` : "—"}
              sub="MWh faltantes para cumplir"
              tone={r.brechaMwh <= 0 ? "emerald" : "red"}
            />
            <StatCard
              label="Multa estimada"
              value={fmtPesos(r.multaEstimadaPesos)}
              sub={r.multaEstimadaPesos > 0 ? "Acumulada del período" : "Sin multa"}
              tone={r.multaEstimadaPesos > 0 ? "amber" : "default"}
            />
            <StatCard
              label="Cumple Ley 27.191"
              value={r.cumpleYtd ? "Sí" : "No"}
              sub={`Indicador legal · Año ${r.anioEnCurso ?? "en curso"}`}
              tone={r.cumpleYtd ? "emerald" : "red"}
            />
          </div>

          {/* Mensual real vs obligación — orientativo (la ley se evalúa anualmente) */}
          {realVsObligData.length > 0 && (
            <ChartCard
              title="Ritmo mensual — orientativo (la ley se evalúa anualmente)"
              hint="Comparativa por mes entre el % renovable cubierto y el % exigido. Los meses bajos no implican incumplimiento si el acumulado anual cierra por encima de la obligación."
              className="mb-5"
            >
              <ResponsiveContainer height={240} width="100%">
                <BarChart data={realVsObligData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} unit="%" width={40} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="real" name="Renovable real" fill="#15caca" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="obligacion" name="Obligación" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Trayectoria YTD */}
          {ytdData.length > 0 && (
            <ChartCard
              title="Trayectoria del año — % renovable YTD vs. obligación"
              hint="Cómo va el promedio acumulado del año vs. el techo legal. Si la línea verde queda por debajo de la gris, hay brecha que pagar."
              className="mb-5"
            >
              <ResponsiveContainer height={220} width="100%">
                <AreaChart data={ytdData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="realYtdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis tick={chartAxisTick} unit="%" width={40} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => [`${(v as number).toFixed(1)}%`, n as string]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Area dataKey="realYtd" name="% Renovable YTD" stroke="#10b981" strokeWidth={2.5} fill="url(#realYtdGrad)" type="monotone" />
                  <Line dataKey="obligYtd" name="Obligación" stroke="#64748b" strokeWidth={2} strokeDasharray="5 3" dot={false} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Brecha + multa solo si hay déficit */}
          {tieneBrecha && (
            <ChartCard
              title="Brecha mensual y multa estimada"
              hint="Barras: MWh de renovable que faltaron en el mes. Línea: estimación de multa en millones de pesos."
            >
              <ResponsiveContainer height={220} width="100%">
                <ComposedChart data={brechaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis dataKey="mes" tick={chartAxisTick} />
                  <YAxis yAxisId="left" tick={chartAxisTick} width={50} tickFormatter={(v) => v.toLocaleString("es-AR")} />
                  <YAxis yAxisId="right" orientation="right" tick={chartAxisTick} width={50} unit="M$" />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: unknown, n: unknown) => {
                      const name = n as string;
                      if (name === "Brecha (MWh)") return [`${(v as number).toLocaleString("es-AR")} MWh`, name];
                      return [`${(v as number).toFixed(2)} M$`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <ReferenceLine yAxisId="left" y={0} stroke="#cbd5e1" />
                  <Bar yAxisId="left" dataKey="brecha" name="Brecha (MWh)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="multa" name="Multa (M$)" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: "#f97316" }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {r.ultimoMes?.multaMetodo && (
                  <p className="text-[11px] font-semibold text-slate-500">
                    Método de cálculo:{" "}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                      {r.ultimoMes.multaMetodo}
                    </span>
                  </p>
                )}
                {data.notas.multa && (
                  <p className="text-xs text-slate-400 italic">{data.notas.multa}</p>
                )}
              </div>
            </ChartCard>
          )}
        </>
      )}
      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
