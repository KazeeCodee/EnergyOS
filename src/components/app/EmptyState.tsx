import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm text-2xl">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="font-semibold text-slate-700 text-base">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
            {description}
          </p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <button
          className="mt-2 rounded-lg bg-[#15caca] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e8a8a] transition-colors"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
