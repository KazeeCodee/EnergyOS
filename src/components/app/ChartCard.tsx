import type { ReactNode } from "react";
import { TooltipHelp } from "./TooltipHelp";

export function ChartCard({
  title,
  hint,
  right,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {hint && <TooltipHelp content={hint} />}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos compartidos de Recharts
// ---------------------------------------------------------------------------

export const chartTooltipStyle = {
  borderRadius: 10,
  fontSize: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
  padding: "8px 10px",
} as const;

export const chartAxisTick = { fontSize: 11, fill: "#94a3b8" } as const;
export const chartGridStroke = "#f1f5f9";
