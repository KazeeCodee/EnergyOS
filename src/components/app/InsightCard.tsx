import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Lightbulb, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import type { AnalizadorInsight, AnalizadorPrioridad, AnalizadorTipo } from "../../types/analizador";

const priorityStyles: Record<AnalizadorPrioridad, string> = {
  alta: "border-red-200 bg-red-50 text-red-700",
  media: "border-amber-200 bg-amber-50 text-amber-700",
  baja: "border-slate-200 bg-slate-50 text-slate-600",
};

const typeLabels: Record<AnalizadorTipo, string> = {
  alerta: "Alerta",
  riesgo: "Riesgo",
  oportunidad: "Oportunidad",
  mejora: "Mejora",
};

function typeIcon(type: AnalizadorTipo) {
  if (type === "riesgo") return ShieldAlert;
  if (type === "oportunidad") return Lightbulb;
  if (type === "mejora") return CheckCircle2;
  return AlertTriangle;
}

export function InsightCard({
  insight,
  featured = false,
}: {
  insight: AnalizadorInsight;
  featured?: boolean;
}) {
  const Icon = typeIcon(insight.tipo);
  const firstEvidenceUrl = insight.evidencia[0]?.urlModulo;

  return (
    <article
      className={`rounded-2xl border bg-white shadow-sm ${
        featured ? "border-[#15caca]/40 p-6 ring-1 ring-[#15caca]/20" : "border-slate-200 p-5"
      }`}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#163759] text-white">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityStyles[insight.prioridad]}`}>
                {insight.prioridad}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {typeLabels[insight.tipo]} · {insight.moduloOrigen.replace("_", " ")}
              </span>
            </div>
            <h3 className={`${featured ? "text-xl" : "text-base"} font-bold tracking-tight text-[#163759]`}>
              {insight.titulo}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{insight.problema}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {insight.periodoAnalizado} · Confianza {insight.confianza}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Impacto</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{insight.impacto}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accion recomendada</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{insight.accionRecomendada}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <ClipboardList size={14} />
          Evidencia
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {insight.evidencia.map((item) => (
            <div key={`${insight.id}-${item.label}`} className="rounded-lg border border-slate-100 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
              <p className="mt-0.5 text-sm font-bold text-[#163759] tabular-nums">{item.valor}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.fuente}</p>
            </div>
          ))}
        </div>
      </div>

      {firstEvidenceUrl ? (
        <Link
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0e8a8a] hover:text-[#163759]"
          to={firstEvidenceUrl}
        >
          Ver modulo tecnico <ArrowRight size={14} />
        </Link>
      ) : null}
    </article>
  );
}
