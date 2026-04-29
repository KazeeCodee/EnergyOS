import type { ReactNode } from "react";
import { TooltipHelp } from "./TooltipHelp";

export function ModuleHeader({
  title,
  subtitle,
  tooltip,
  actions,
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-[#163759] tracking-tight">{title}</h1>
          {tooltip ? <TooltipHelp content={tooltip} /> : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
