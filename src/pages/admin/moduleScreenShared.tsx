import { BarChart3 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { Panel } from "../../components/ui/Panel";

export type PickerOption = {
  value: string;
  label: string;
  meta?: string;
};

export function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMwh(value: number, digits = 0) {
  return `${formatNumber(value, digits)} MWh`;
}

export function formatUsd(value: number, digits = 0) {
  return `USD ${formatNumber(value, digits)}`;
}

export function formatPesos(value: number, digits = 0) {
  return `$ ${formatNumber(value, digits)}`;
}

export function formatPercent(value: number, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

export function formatMonthKey(value: string | null) {
  if (!value) return "Sin datos";
  const [anio, mes] = value.split("-").map(Number);
  const date = new Date(anio, (mes || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTimeLabel(value: string | null) {
  if (!value) return "Sin proceso registrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function readTooltipValue(value: number | string | ReadonlyArray<number | string> | undefined) {
  if (Array.isArray(value)) return Number(value[0] ?? 0);
  return Number(value ?? 0);
}

export function formatTooltipMwh(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatMwh(readTooltipValue(value), 1);
}

export function formatTooltipUsd(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatUsd(readTooltipValue(value), digits);
}

export function formatTooltipPesos(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatPesos(readTooltipValue(value), digits);
}

export function formatTooltipPercent(value: number | string | ReadonlyArray<number | string> | undefined, digits = 1) {
  return formatPercent(readTooltipValue(value), digits);
}

export function tooltipUsd(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipUsd(value, 1);
}

export function tooltipUsdWhole(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipUsd(value, 0);
}

export function tooltipPesos(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipPesos(value, 1);
}

export function tooltipPercent(value: number | string | ReadonlyArray<number | string> | undefined) {
  return formatTooltipPercent(value, 1);
}

export function SectionHeading({
  icon: Icon,
  index,
  title,
  description,
}: {
  icon: typeof BarChart3;
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-navy-border bg-white shadow-panel">
        <Icon size={18} className="text-forest" />
      </div>
      <div className="space-y-2">
        <Badge tone="plan">Modulo {index}</Badge>
        <div>
          <h2 className="font-syne text-2xl font-bold text-ivory">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-mist">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function FilterPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-mist">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-navy-border bg-white px-4 py-3 text-left shadow-panel transition hover:border-forest/30"
      >
        <div className="min-w-0">
          <p className="truncate font-syne text-sm font-bold text-ivory">{selected?.label ?? "Seleccionar"}</p>
          {selected?.meta ? <p className="mt-1 truncate text-xs text-mist">{selected.meta}</p> : null}
        </div>
        <span className="ml-4 text-xs uppercase tracking-[0.2em] text-mist">{open ? "Cerrar" : "Abrir"}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 overflow-auto rounded-2xl border border-navy-border bg-white p-2 shadow-panel scrollbar-thin">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-start justify-between rounded-xl px-3 py-3 text-left transition ${
                option.value === value ? "bg-forest/10 text-forest" : "text-ivory hover:bg-navy"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{option.label}</p>
                {option.meta ? <p className="mt-1 truncate text-xs text-mist">{option.meta}</p> : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Panel className="h-full p-5">
      <div className="mb-4">
        <h3 className="font-syne text-lg font-bold text-ivory">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-mist">{description}</p>
      </div>
      <div className="h-[320px]">{children}</div>
    </Panel>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Panel className="p-8">
      <div className="mx-auto max-w-2xl text-center">
        <Badge tone="warning">Sin datos en el rango</Badge>
        <h3 className="mt-4 font-syne text-2xl font-bold text-ivory">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-mist">{description}</p>
      </div>
    </Panel>
  );
}
