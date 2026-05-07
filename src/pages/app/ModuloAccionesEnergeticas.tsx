import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  XCircle,
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
import { Button } from "../../components/ui/Button";
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { fetchAccionesEnergeticas, updateAccionEnergetica } from "../../services/accionesEnergeticas";
import type {
  AccionEnergetica,
  AccionEstado,
  AccionesEnergeticasResponse,
} from "../../types/accionesEnergeticas";

const EMPTY: AccionesEnergeticasResponse = {
  nemo: "",
  meses: 12,
  estado: "abiertas",
  autorizados: [],
  resumen: {
    total: 0,
    abiertas: 0,
    pendientes: 0,
    enRevision: 0,
    resueltas: 0,
    descartadas: 0,
    criticas: 0,
    altas: 0,
    impactoAbiertoPesos: 0,
  },
  acciones: [],
  eventos: [],
  notas: { alcance: "" },
};

const ESTADOS: Array<{ value: "abiertas" | "todas" | AccionEstado; label: string }> = [
  { value: "abiertas", label: "Abiertas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "en_revision", label: "En revision" },
  { value: "resuelta", label: "Resueltas" },
  { value: "descartada", label: "Descartadas" },
  { value: "todas", label: "Todas" },
];

function fmtPesos(n: number | null | undefined) {
  if (n == null || n === 0) return "-";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function pct(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return `${(n * 100).toFixed(1).replace(".", ",")}%`;
}

function num(value: unknown, digits = 0) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits });
}

function estadoLabel(estado: AccionEstado | "abiertas" | "todas") {
  const labels: Record<string, string> = {
    abiertas: "Abiertas",
    todas: "Todas",
    pendiente: "Pendiente",
    en_revision: "En revision",
    resuelta: "Resuelta",
    descartada: "Descartada",
  };
  return labels[estado] ?? estado;
}

function estadoTone(estado: AccionEstado): "success" | "warning" | "danger" | "neutral" | "plan" {
  if (estado === "resuelta") return "success";
  if (estado === "descartada") return "neutral";
  if (estado === "pendiente") return "warning";
  return "plan";
}

function severidadTone(severidad: string): "success" | "warning" | "danger" | "neutral" | "plan" {
  if (severidad === "critica") return "danger";
  if (severidad === "alta") return "warning";
  if (severidad === "media") return "plan";
  return "neutral";
}

function origenHref(origen: string) {
  const routes: Record<string, string> = {
    "auditoria-dte": "/app/auditoria-dte",
    "exposicion-spot": "/app/exposicion-spot",
    "cumplimiento-27191": "/app/cumplimiento-renovable",
    "historia-energetica": "/app/historia",
  };
  return routes[origen] ?? "/app";
}

function origenLabel(origen: string) {
  const labels: Record<string, string> = {
    "auditoria-dte": "Auditoria DTE",
    "exposicion-spot": "Exposicion spot",
    "cumplimiento-27191": "Compliance 27.191",
    "historia-energetica": "Historia energetica",
  };
  return labels[origen] ?? origen;
}

function detallePrincipal(accion: AccionEnergetica) {
  const d = accion.detalle;
  switch (accion.reglaCodigo) {
    case "DTE_RECONCILIACION":
      return [
        ["Desvio", fmtPesos(num(d.desvio_reconciliacion_pesos) ? Number(d.desvio_reconciliacion_pesos) : null)],
        ["Desvio %", pct(d.desvio_reconciliacion_pct)],
      ];
    case "DTE_VARIACION_ALTA":
      return [
        ["Variacion", pct(d.variacion_mom_pct)],
        ["Costo DTE", num(d.costo_dte_pesos_mwh, 0) ? `${num(d.costo_dte_pesos_mwh, 0)} $/MWh` : null],
      ];
    case "SPOT_ALTA":
      return [
        ["Spot", pct(d.pct_spot)],
        ["Compra spot", num(d.compra_spot_mwh, 1) ? `${num(d.compra_spot_mwh, 1)} MWh` : null],
      ];
    case "COMPLIANCE_BRECHA":
      return [
        ["Brecha YTD", num(d.brecha_ytd_mwh, 1) ? `${num(d.brecha_ytd_mwh, 1)} MWh` : null],
        ["Renovable", pct(d.pct_renovable_ytd)],
      ];
    case "CONSUMO_VARIACION":
      return [
        ["Variacion", pct(d.variacion_yoy_pct)],
        ["Demanda", num(d.demanda_real_mwh, 1) ? `${num(d.demanda_real_mwh, 1)} MWh` : null],
      ];
    default:
      return [];
  }
}

function AccionCard({
  accion,
  busy,
  onChangeEstado,
}: {
  accion: AccionEnergetica;
  busy: boolean;
  onChangeEstado: (accion: AccionEnergetica, estado: AccionEstado) => void;
}) {
  const detalles = detallePrincipal(accion).filter(([, value]) => Boolean(value));
  const isClosed = accion.estado === "resuelta" || accion.estado === "descartada";

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={severidadTone(accion.severidad)}>{accion.severidad}</Badge>
            <Badge tone={estadoTone(accion.estado)}>{estadoLabel(accion.estado)}</Badge>
            <span className="text-xs font-semibold text-slate-400">{accion.periodoLabel}</span>
          </div>
          <h3 className="text-base font-bold text-[#163759]">{accion.titulo}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{accion.descripcion}</p>
        </div>

        <div className="shrink-0 text-left lg:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Impacto estimado</p>
          <p className="mt-1 font-mono text-lg font-bold text-[#163759]">{fmtPesos(accion.impactoEstimadoPesos)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <Link
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:border-[#15caca] hover:text-[#163759]"
            to={origenHref(accion.origenModulo)}
          >
            {origenLabel(accion.origenModulo)}
            <ExternalLink size={12} />
          </Link>
          {detalles.map(([label, value]) => (
            <span key={label} className="rounded-md bg-slate-50 px-2.5 py-1">
              <span className="font-semibold text-slate-600">{label}:</span> {value}
            </span>
          ))}
          {accion.comentarioUltimo ? (
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-sky-700">{accion.comentarioUltimo}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {accion.estado !== "en_revision" && !isClosed ? (
            <button
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[#15caca] hover:text-[#163759] disabled:opacity-50"
              disabled={busy}
              onClick={() => onChangeEstado(accion, "en_revision")}
              type="button"
            >
              <CircleDot size={14} />
              Revisar
            </button>
          ) : null}
          {!isClosed ? (
            <>
              <button
                className="inline-flex h-9 items-center gap-1 rounded-md border border-emerald-200 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => onChangeEstado(accion, "resuelta")}
                type="button"
              >
                <CheckCircle2 size={14} />
                Resolver
              </button>
              <button
                className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => onChangeEstado(accion, "descartada")}
                type="button"
              >
                <XCircle size={14} />
                Descartar
              </button>
            </>
          ) : (
            <button
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[#15caca] hover:text-[#163759] disabled:opacity-50"
              disabled={busy}
              onClick={() => onChangeEstado(accion, "pendiente")}
              type="button"
            >
              <RefreshCw size={14} />
              Reabrir
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ModuloAccionesEnergeticas() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [meses, setMeses] = useState(12);
  const [estado, setEstado] = useState<"abiertas" | "todas" | AccionEstado>("abiertas");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [localError, setLocalError] = useState("");

  const loader = useCallback(
    () => fetchAccionesEnergeticas({ nemo: agente?.nemo, meses, estado }),
    [agente?.nemo, meses, estado, reloadKey],
  );
  const { data, loading, error } = useAsyncData<AccionesEnergeticasResponse>(loader, EMPTY);

  const acciones = useMemo(() => data.acciones, [data.acciones]);
  const sinDatos = !loading && acciones.length === 0;

  const onChangeEstado = useCallback(async (accion: AccionEnergetica, next: AccionEstado) => {
    const comentario = window.prompt("Comentario opcional para esta accion:", accion.comentarioUltimo ?? "");
    if (comentario === null) return;

    setBusyId(accion.id);
    setLocalError("");
    try {
      await updateAccionEnergetica(accion.id, next, comentario);
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "No se pudo actualizar la accion.");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (loading) return <ModuleSkeleton />;

  return (
    <div>
      <ModuleHeader
        title="Acciones Energeticas"
        subtitle="Bandeja operativa de riesgos, desvios y oportunidades detectadas"
        tooltip="Las acciones se generan con reglas automaticas sobre DTE, spot, compliance 27.191 y consumo. Son senales para revisar y gestionar, no reclamos automaticos."
        actions={
          <Button className="min-h-9 px-3" onClick={() => setReloadKey((key) => key + 1)} type="button" variant="outline">
            <RefreshCw size={14} />
            Actualizar
          </Button>
        }
      />

      <RangeSelector
        meses={meses}
        onMesesChange={setMeses}
        ultimoMesDisponible={ultimoMesDisponible}
        maxMeses={24}
        debounceMs={0}
      />

      {(error || localError) && <AlertaBanner type="warning" message={error || localError} />}
      {data.notas.alcance && (
        <div className="mb-5">
          <AlertaBanner type="info" message={data.notas.alcance} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Acciones abiertas" value={data.resumen.abiertas.toLocaleString("es-AR")} sub="Pendientes o en revision" tone={data.resumen.abiertas > 0 ? "amber" : "emerald"} />
        <StatCard label="Criticas / altas" value={`${data.resumen.criticas}/${data.resumen.altas}`} sub="Prioridad operativa" tone={data.resumen.criticas > 0 ? "red" : data.resumen.altas > 0 ? "amber" : "emerald"} />
        <StatCard label="Impacto abierto" value={fmtPesos(data.resumen.impactoAbiertoPesos)} sub="Suma estimada" tone={data.resumen.impactoAbiertoPesos > 0 ? "amber" : "emerald"} />
        <StatCard label="Resueltas" value={data.resumen.resueltas.toLocaleString("es-AR")} sub="En la ventana elegida" />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {ESTADOS.map((item) => {
          const active = item.value === estado;
          return (
            <button
              className={`h-9 rounded-md border px-3 text-xs font-bold transition ${
                active
                  ? "border-[#15caca] bg-[#15caca]/10 text-[#163759]"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-[#163759]"
              }`}
              key={item.value}
              onClick={() => setEstado(item.value)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {sinDatos ? (
        <EmptyState
          icon={<ClipboardCheck size={28} className="text-slate-400" />}
          title="Sin acciones para mostrar"
          description="No hay pendientes con los filtros seleccionados para este agente."
        />
      ) : (
        <section className="space-y-3">
          {acciones.map((accion) => (
            <AccionCard
              accion={accion}
              busy={busyId === accion.id}
              key={accion.id}
              onChangeEstado={onChangeEstado}
            />
          ))}
        </section>
      )}

      {data.resumen.criticas > 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <p>Hay acciones criticas abiertas. Conviene revisarlas antes de cerrar el periodo energetico.</p>
        </div>
      ) : data.resumen.altas > 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>Hay acciones de severidad alta abiertas. Priorizarlas reduce riesgo economico y operativo.</p>
        </div>
      ) : null}

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
