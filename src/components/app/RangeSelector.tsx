import { useMemo } from "react";

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

function buildMesesAtras(ultimoMes: string, cantidad: number): string[] {
  if (!ultimoMes) return [];
  const [yearStr, monthStr] = ultimoMes.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  const meses: string[] = [];

  for (let i = 0; i < cantidad; i++) {
    meses.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return meses;
}

function monthToIndex(mesStr: string): number {
  const [yearStr, monthStr] = mesStr.split("-");
  return parseInt(yearStr, 10) * 12 + parseInt(monthStr, 10) - 1;
}

function indexToMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthsInclusive(desde: string, hasta: string): number {
  return Math.max(1, monthToIndex(hasta) - monthToIndex(desde) + 1);
}

function subtractMonths(mesStr: string, cantidad: number): string {
  return indexToMonth(monthToIndex(mesStr) - cantidad);
}

function parseMonthKey(mesStr: string): { year: number; month: number } {
  const [yearStr, monthStr] = mesStr.split("-");
  return { year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) };
}

function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type RangeSelectorProps = {
  meses: number;
  onMesesChange: (n: number) => void;
  anchorMes?: string;
  onAnchorChange?: (mes: string) => void;
  allowStartSelect?: boolean;
  ultimoMesDisponible: string;
  maxMeses?: number;
  presets?: number[];
  label?: string;
  debounceMs?: number;
};

export function RangeSelector({
  meses,
  onMesesChange,
  anchorMes,
  onAnchorChange,
  allowStartSelect = false,
  ultimoMesDisponible,
  maxMeses = 60,
  label = "Periodo",
}: RangeSelectorProps) {
  const cap = Math.max(1, maxMeses);
  const opcionesDesc = useMemo(
    () => buildMesesAtras(ultimoMesDisponible, cap),
    [ultimoMesDisponible, cap],
  );
  const opcionesAsc = useMemo(() => [...opcionesDesc].reverse(), [opcionesDesc]);
  const activeAnchor = anchorMes ?? ultimoMesDisponible;
  const startMes = useMemo(() => {
    if (!activeAnchor) return opcionesAsc[0] ?? "";
    const candidate = subtractMonths(activeAnchor, Math.max(1, meses) - 1);
    const min = opcionesAsc[0] ?? candidate;
    return candidate < min ? min : candidate;
  }, [activeAnchor, meses, opcionesAsc]);

  const years = useMemo(
    () => [...new Set(opcionesAsc.map((mes) => parseMonthKey(mes).year))],
    [opcionesAsc],
  );

  const monthsForYear = (year: number) =>
    MONTHS.filter((month) => opcionesAsc.includes(buildMonthKey(year, month.value)));

  const commitRange = (desde: string, hasta: string) => {
    if (!desde || !hasta) return;
    const normalizedDesde = desde > hasta ? hasta : desde;
    onAnchorChange?.(hasta);
    onMesesChange(Math.min(monthsInclusive(normalizedDesde, hasta), cap));
  };

  const changeStart = (nextStart: string) => {
    if (nextStart > activeAnchor) {
      commitRange(nextStart, nextStart);
      return;
    }
    commitRange(nextStart, activeAnchor);
  };

  const changeEnd = (nextEnd: string) => {
    if (nextEnd < startMes) {
      commitRange(nextEnd, nextEnd);
      return;
    }
    commitRange(startMes, nextEnd);
  };

  if (!allowStartSelect || !onAnchorChange || opcionesAsc.length === 0) {
    return (
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          <span className="text-sm font-semibold text-slate-700">
            Ultimos {Math.min(Math.max(1, meses), cap)} meses
          </span>
        </div>
      </div>
    );
  }

  const start = parseMonthKey(startMes || opcionesAsc[0]);
  const end = parseMonthKey(activeAnchor || opcionesAsc[opcionesAsc.length - 1]);

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Desde
            </span>
            <select
              className="h-10 min-w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
              value={start.month}
              onChange={(event) => changeStart(buildMonthKey(start.year, Number(event.target.value)))}
            >
              {monthsForYear(start.year).map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
            <select
              className="h-10 min-w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
              value={start.year}
              onChange={(event) => {
                const year = Number(event.target.value);
                const months = monthsForYear(year);
                const month = months.some((item) => item.value === start.month) ? start.month : months[0]?.value;
                if (month) changeStart(buildMonthKey(year, month));
              }}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Hasta
            </span>
            <select
              className="h-10 min-w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
              value={end.month}
              onChange={(event) => changeEnd(buildMonthKey(end.year, Number(event.target.value)))}
            >
              {monthsForYear(end.year).map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
            <select
              className="h-10 min-w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
              value={end.year}
              onChange={(event) => {
                const year = Number(event.target.value);
                const months = monthsForYear(year);
                const month = months.some((item) => item.value === end.month) ? end.month : months.at(-1)?.value;
                if (month) changeEnd(buildMonthKey(year, month));
              }}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
