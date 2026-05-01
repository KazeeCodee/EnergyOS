import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
};

const ROUNDED_CLASS: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

export function Skeleton({ className = "", width, height, rounded = "md" }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      aria-hidden
      className={`animate-pulse bg-slate-200/70 ${ROUNDED_CLASS[rounded]} ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton height={11} width={90} className="mb-3" />
      <Skeleton height={28} width="60%" className="mb-2" />
      <Skeleton height={11} width="40%" />
    </div>
  );
}

export function SkeletonChartCard({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton height={14} width={140} className="mb-4" />
      <Skeleton height={height} rounded="lg" />
    </div>
  );
}

/** Skeleton genérico para módulos: header + 4 stat cards + 2 charts. */
export function ModuleSkeleton({ stats = 4, charts = 2 }: { stats?: number; charts?: number }) {
  return (
    <div>
      <div className="mb-6">
        <Skeleton height={11} width={140} className="mb-2" />
        <Skeleton height={28} width="55%" className="mb-2" />
        <Skeleton height={12} width="35%" />
      </div>
      {stats > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      )}
      {charts > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: charts }).map((_, i) => (
            <SkeletonChartCard key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
