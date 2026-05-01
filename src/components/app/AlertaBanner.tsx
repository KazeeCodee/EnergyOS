import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type AlertaType = "danger" | "warning" | "info" | "success";

const styles: Record<
  AlertaType,
  { bg: string; border: string; text: string; iconColor: string; Icon: LucideIcon }
> = {
  danger:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-800",     iconColor: "text-red-600",     Icon: AlertCircle },
  warning: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   iconColor: "text-amber-600",   Icon: AlertTriangle },
  info:    { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-800",     iconColor: "text-sky-600",     Icon: Info },
  success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", iconColor: "text-emerald-600", Icon: CheckCircle2 },
};

export function AlertaBanner({
  type = "info",
  message,
  action,
  onAction,
}: {
  type?: AlertaType;
  message: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  const s = styles[type];
  const Icon = s.Icon;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${s.bg} ${s.border} ${s.text}`}
      role="alert"
    >
      <Icon aria-hidden className={`mt-0.5 shrink-0 ${s.iconColor}`} size={18} />
      <span className="flex-1 leading-relaxed">{message}</span>
      {action && onAction ? (
        <button
          className={`shrink-0 font-semibold underline underline-offset-2 hover:no-underline ${s.text}`}
          onClick={onAction}
          type="button"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}
