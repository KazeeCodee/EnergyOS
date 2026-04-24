import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

type Trend = "up" | "down" | "neutral";
type Border = "green" | "yellow" | "blue" | "none";

const borderClass: Record<Border, string> = {
  green: "border-t-forest",
  yellow: "border-t-alert",
  blue: "border-t-mist",
  none: "border-t-navy-border",
};

const trendIcon: Record<Trend, ReactNode> = {
  up: <ArrowUpRight size={16} />,
  down: <ArrowDownRight size={16} />,
  neutral: <Minus size={16} />,
};

export function StatCard({
  label,
  value,
  subtext,
  trend = "neutral",
  borderColor = "none",
}: {
  label: string;
  value: string;
  subtext: string;
  trend?: Trend;
  borderColor?: Border;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-navy-border bg-navy-medium p-5 shadow-panel border-t-2 ${borderClass[borderColor]}`}
    >
      <p className="text-xs font-semibold uppercase text-mist">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <strong className="number font-syne text-3xl font-extrabold text-ivory">
          {value}
        </strong>
        <span className="mb-1 text-forest">{trendIcon[trend]}</span>
      </div>
      <p className="mt-3 min-h-5 text-sm text-mist">{subtext}</p>
    </div>
  );
}
