import type { ReactNode } from "react";

export type StatCardTone = "teal" | "red" | "amber" | "emerald" | "orange" | "indigo" | "default";

const toneClasses: Record<StatCardTone, string> = {
  teal:    "border-t-[#15caca] bg-[#15caca]/5",
  red:     "border-t-red-400 bg-red-50",
  amber:   "border-t-amber-400 bg-amber-50",
  emerald: "border-t-emerald-400 bg-emerald-50",
  orange:  "border-t-orange-400 bg-orange-50",
  indigo:  "border-t-indigo-400 bg-indigo-50",
  default: "border-t-slate-200 bg-white",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  highlight,
  trend,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatCardTone;
  highlight?: boolean;
  /** Indicador de tendencia opcional, con signo y unidad. */
  trend?: { value: number; label?: string; positiveIsGood?: boolean };
  icon?: ReactNode;
}) {
  const trendColor = trend
    ? (trend.positiveIsGood ?? true)
      ? trend.value >= 0 ? "text-emerald-600" : "text-red-500"
      : trend.value >= 0 ? "text-red-500" : "text-emerald-600"
    : "";

  return (
    <div
      className={`rounded-2xl border border-slate-200 border-t-4 p-5 shadow-sm transition-shadow hover:shadow-md ${toneClasses[tone]} ${
        highlight ? "ring-2 ring-[#15caca]/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold text-[#163759] leading-tight tabular-nums">{value}</p>
      {(sub || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {trend && (
            <span className={`font-semibold ${trendColor}`}>
              {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}%
              {trend.label ? ` ${trend.label}` : ""}
            </span>
          )}
          {sub && <span className="text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}
