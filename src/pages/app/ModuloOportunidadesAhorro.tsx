import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  ListOrdered,
  PiggyBank,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { RangeSelector } from "../../components/app/RangeSelector";
import { StatCard } from "../../components/app/StatCard";
import { Badge } from "../../components/ui/Badge";
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchOportunidadesAhorro } from "../../services/oportunidadesAhorro";
import type {
  OportunidadAhorro,
  OportunidadCategoria,
  OportunidadesAhorroResponse,
} from "../../types/oportunidadesAhorro";

const EMPTY: OportunidadesAhorroResponse = {
  nemo: "",
  meses: 12,
  autorizados: [],
  resumen: {
    oportunidades: 0,
    categorias: 0,
    impactoTotalPesos: 0,
    topCategoria: null,
    altas: 0,
    confianzaAlta: 0,
  },
  categorias: [],
  oportunidades: [],
  notas: { alcance: "" },
};

function fmtPesos(n: number | null | undefined) {
  if (n == null || n === 0) return "-";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function fmtCompact(n: number | null | undefined) {
  if (n == null || n === 0) return "-";
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function tone(value: string): "success" | "warning" | "danger" | "neutral" | "plan" {
  if (value === "alta") return "warning";
  if (value === "media") return "plan";
  if (value === "baja") return "neutral";
  return "neutral";
}

function origenHref(origen: string) {
  const routes: Record<string, string> = {
    "auditoria-dte": "/app/auditoria-dte",
    "exposicion-spot": "/app/exposicion-spot",
    "cumplimiento-27191": "/app/cumplimiento-renovable",
    "historia-energetica": "/app/historia",
    acciones: "/app/acciones",
  };
  return routes[origen] ?? "/app";
}

function origenLabel(origen: string) {
  const labels: Record<string, string> = {
    "auditoria-dte": "Auditoria DTE",
    "exposicion-spot": "Exposicion spot",
    "cumplimiento-27191": "Compliance 27.191",
    "historia-energetica": "Historia energetica",
    acciones: "Acciones",
  };
  return labels[origen] ?? origen;
}

function iconFor(codigo: string) {
  if (codigo === "COMPLIANCE_RENOVABLE") return ShieldCheck;
  if (codigo === "SPOT_COBERTURA") return TrendingDown;
  if (codigo === "DTE_AUDITORIA") return FileSearch;
  if (codigo === "ACCIONES_ABIERTAS") return CheckCircle2;
  return BarChart3;
}

function detalleDato(item: OportunidadAhorro) {
  const d = item.detalle;
  const pct = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1).replace(".", ",")}%` : null;
  };
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : null;
  };

  switch (item.oportunidadCodigo) {
    case "COMPLIANCE_RENOVABLE":
      return pct(d.pct_renovable_ytd) ? `Renovable YTD ${pct(d.pct_renovable_ytd)}` : "Brecha renovable";
    case "SPOT_COBERTURA":
      return pct(d.pct_spot) ? `Spot ${pct(d.pct_spot)}` : "Exposicion spot";
    case "DTE_AUDITORIA":
      return pct(d.variacion_mom_pct) ? `Variacion DTE ${pct(d.variacion_mom_pct)}` : "Auditoria DTE";
    case "CONSUMO_DESVIO":
      return pct(d.variacion_yoy_pct) ? `Consumo ${pct(d.variacion_yoy_pct)}` : "Desvio de consumo";
    case "ACCIONES_ABIERTAS":
      return num(d.acciones_abiertas) ? `${num(d.acciones_abiertas)} acciones abiertas` : "Acciones abiertas";
    default:
      return item.oportunidadNombre;
  }
}

function CategoriaCard({ categoria }: { categoria: OportunidadCategoria }) {
  const Icon = iconFor(categoria.oportunidadCodigo);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#15caca]/10 text-[#0e8a8a]">
            <Icon size={19} />
          </span>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-500">
                #{categoria.ranking}
              </span>
              <Badge tone={tone(categoria.prioridad)}>Prioridad {categoria.prioridad}</Badge>
              <Badge tone={tone(categoria.confianza)}>Confianza {categoria.confianza}</Badge>
            </div>
            <h3 className="text-base font-bold text-[#163759]">{categoria.oportunidadNombre}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{categoria.dolorCliente}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Potencial</p>
          <p className="mt-1 font-mono text-lg font-bold text-[#163759]">{fmtPesos(categoria.impactoTotalPesos)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
        <span className="font-semibold text-[#163759]">Accion recomendada:</span> {categoria.accionRecomendada}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>{categoria.periodosCount} evidencias en la ventana · mayor periodo {categoria.periodoTop}</span>
        <Link
          className="inline-flex items-center gap-1 font-bold text-[#0e8a8a] hover:text-[#163759]"
          to={origenHref(categoria.origenModulo)}
        >
          Abrir {origenLabel(categoria.origenModulo)}
          <ExternalLink size={12} />
        </Link>
      </div>
    </article>
  );
}

export default function ModuloOportunidadesAhorro() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);

  const loader = useCallback(
    () => fetchOportunidadesAhorro({ nemo: agente?.nemo, meses }),
    [agente?.nemo, meses],
  );
  const { data, loading, error } = useAsyncData<OportunidadesAhorroResponse>(loader, EMPTY);

  const evidencia = useMemo(() => data.oportunidades.slice(0, 20), [data.oportunidades]);
  const sinDatos = data.categorias.length === 0;

  if (loading) return <ModuleSkeleton />;

  return (
    <div>
      <ModuleHeader
        title="Oportunidades de Ahorro"
        subtitle="Ranking por impacto estimado, prioridad y confianza"
        tooltip="El ranking usa datos disponibles de EnergyOS. No usa contratos privados y no garantiza ahorro; prioriza donde conviene revisar primero."
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        ultimoMesDisponible={ultimoMesDisponible}
        maxMeses={24}
        debounceMs={0}
      />

      {error && <AlertaBanner type="warning" message={error} />}
      {data.notas.alcance && (
        <div className="mb-5">
          <AlertaBanner type="info" message={data.notas.alcance} />
        </div>
      )}

      {sinDatos ? (
        <EmptyState
          icon={<PiggyBank size={28} className="text-slate-400" />}
          title="Sin oportunidades detectadas"
          description="No encontramos oportunidades con impacto estimado para este agente en la ventana seleccionada."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Potencial estimado"
              value={fmtPesos(data.resumen.impactoTotalPesos)}
              sub="Suma de categorias"
              tone={data.resumen.impactoTotalPesos > 0 ? "amber" : "emerald"}
            />
            <StatCard
              label="Categorias"
              value={data.resumen.categorias.toLocaleString("es-AR")}
              sub={`${data.resumen.oportunidades} evidencias`}
            />
            <StatCard
              label="Prioridad alta"
              value={data.resumen.altas.toLocaleString("es-AR")}
              sub="Categorias a mirar primero"
              tone={data.resumen.altas > 0 ? "amber" : "emerald"}
            />
            <StatCard
              label="Top oportunidad"
              value={data.resumen.topCategoria ? fmtCompact(data.resumen.topCategoria.impactoTotalPesos) : "-"}
              sub={data.resumen.topCategoria?.oportunidadNombre ?? "Sin ranking"}
            />
          </div>

          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <ListOrdered size={18} className="text-[#0e8a8a]" />
              <h2 className="text-sm font-bold text-[#163759]">Ranking para decidir</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.categorias.map((categoria) => (
                <CategoriaCard categoria={categoria} key={categoria.oportunidadCodigo} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[#163759]">
                <BadgeDollarSign size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#163759]">Evidencia mensual</h3>
                <p className="text-xs text-slate-500">Items que alimentan el ranking agregado.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-bold">Periodo</th>
                    <th className="px-4 py-3 font-bold">Oportunidad</th>
                    <th className="px-4 py-3 font-bold">Dato clave</th>
                    <th className="px-4 py-3 font-bold">Potencial</th>
                    <th className="px-4 py-3 font-bold">Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {evidencia.map((item) => (
                    <tr key={`${item.oportunidadCodigo}-${item.periodoLabel}-${item.rankingScore}`} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.periodoLabel}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-700">{item.oportunidadNombre}</div>
                        <div className="mt-1 flex gap-1">
                          <Badge tone={tone(item.prioridad)}>{item.prioridad}</Badge>
                          <Badge tone={tone(item.confianza)}>{item.confianza}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{detalleDato(item)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">{fmtPesos(item.impactoEstimadoPesos)}</td>
                      <td className="px-4 py-3">
                        <Link className="inline-flex items-center gap-1 text-xs font-bold text-[#0e8a8a] hover:text-[#163759]" to={origenHref(item.origenModulo)}>
                          {origenLabel(item.origenModulo)}
                          <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
