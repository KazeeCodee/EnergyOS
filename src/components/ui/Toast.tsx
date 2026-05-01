import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = "success" | "error" | "info";

type ToastInput = {
  title?: string;
  description?: string;
  duration?: number;
};

type Toast = ToastInput & {
  id: number;
  type: ToastType;
  exiting?: boolean;
};

type ToastApi = {
  success: (input: string | ToastInput) => number;
  error: (input: string | ToastInput) => number;
  info: (input: string | ToastInput) => number;
  dismiss: (id: number) => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DEFAULT_DURATION = 4000;
const EXIT_MS = 200;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type: ToastType, input: string | ToastInput): number => {
      const id = nextId++;
      const normalized: ToastInput = typeof input === "string" ? { title: input } : input;
      const toast: Toast = { id, type, ...normalized };
      setToasts((prev) => [...prev, toast]);

      const duration = normalized.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        const handle = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (input) => push("success", input),
      error: (input) => push("error", input),
      info: (input) => push("info", input),
      dismiss,
    }),
    [push, dismiss],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((h) => window.clearTimeout(h));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

const ICON_MAP: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLE_MAP: Record<ToastType, { ring: string; iconBg: string; iconText: string }> = {
  success: { ring: "ring-emerald-200", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  error:   { ring: "ring-red-200",     iconBg: "bg-red-50",     iconText: "text-red-600" },
  info:    { ring: "ring-sky-200",     iconBg: "bg-sky-50",     iconText: "text-sky-600" },
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:top-6 sm:right-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const Icon = ICON_MAP[toast.type];
  const style = STYLE_MAP[toast.type];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)] ring-1 ring-inset ${style.ring} transition-all duration-200 ${
        toast.exiting
          ? "-translate-y-1 opacity-0"
          : "translate-y-0 opacity-100"
      }`}
      style={{
        animation: toast.exiting ? undefined : "toastIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}>
        <Icon size={16} className={style.iconText} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {toast.title ? (
          <p className="text-sm font-semibold leading-tight text-[#163759]">{toast.title}</p>
        ) : null}
        {toast.description ? (
          <p className={`text-xs leading-relaxed text-slate-500 ${toast.title ? "mt-1" : ""}`}>
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={14} />
      </button>
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(-8px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0)    scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
