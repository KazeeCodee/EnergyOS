import type { ReactNode } from "react";
import { Panel } from "../ui/Panel";

export function ChartFrame({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`p-5 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-syne text-base font-bold text-ivory">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-mist">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </Panel>
  );
}
