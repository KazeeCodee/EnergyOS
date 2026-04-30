import { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMesLabel(mesStr: string): string {
  if (!mesStr) return "";
  const [yearStr, monthStr] = mesStr.split("-");
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return date.toLocaleDateString("es-AR", { month: "short", year: "numeric" }).replace(".", "");
}

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

// ---------------------------------------------------------------------------
// RangeSelector
// ---------------------------------------------------------------------------

export type RangeSelectorProps = {
  /** Cantidad de meses seleccionada. */
  meses: number;
  /** Callback al cambiar la cantidad (ya viene debounceado). */
  onMesesChange: (n: number) => void;
  /** Mes ancla "hasta" (YYYY-MM). Por defecto: último disponible. */
  anchorMes?: string;
  /** Callback al cambiar el ancla. Si se omite, no se muestra el selector "hasta". */
  onAnchorChange?: (mes: string) => void;
  /** Último mes con datos (YYYY-MM). Define el techo del selector "hasta". */
  ultimoMesDisponible: string;
  /** Tope de meses disponibles. Default: 60. */
  maxMeses?: number;
  /** Lista personalizada de presets. Default: [3, 6, 12, 24, 36]. */
  presets?: number[];
  /** Etiqueta opcional para el bloque. */
  label?: string;
  /** Milisegundos de debounce para slider / input numérico. Default: 250. */
  debounceMs?: number;
};

export function RangeSelector({
  meses,
  onMesesChange,
  anchorMes,
  onAnchorChange,
  ultimoMesDisponible,
  maxMeses = 60,
  presets = [3, 6, 12, 24, 36],
  label = "Período",
  debounceMs = 250,
}: RangeSelectorProps) {
  const cap = Math.max(1, maxMeses);
  const valorComprometido = Math.min(Math.max(1, meses), cap);

  // Estado visual local para que el slider responda inmediatamente.
  const [draft, setDraft] = useState(valorComprometido);

  // Sync cuando cambia el valor desde afuera (ej: cap nuevo).
  useEffect(() => {
    setDraft(valorComprometido);
  }, [valorComprometido]);

  // Debounce del commit hacia el padre.
  const timerRef = useRef<number | null>(null);
  const commitDebounced = (n: number) => {
    setDraft(n);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onMesesChange(Math.min(Math.max(1, n), cap));
    }, debounceMs);
  };
  const commitNow = (n: number) => {
    setDraft(n);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    onMesesChange(Math.min(Math.max(1, n), cap));
  };
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const opcionesAncla = useMemo(
    () => buildMesesAtras(ultimoMesDisponible, cap),
    [ultimoMesDisponible, cap],
  );

  const presetsValidos = presets.filter((p) => p <= cap);
  const incluyeTodo = cap > 1;
  const showAncla = Boolean(onAnchorChange) && opcionesAncla.length > 0;

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Presets + label */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </span>
          {presetsValidos.map((p) => {
            const active = draft === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => commitNow(p)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#163759] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p}M
              </button>
            );
          })}
          {incluyeTodo && (
            <button
              type="button"
              onClick={() => commitNow(cap)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                draft === cap
                  ? "bg-[#163759] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todo ({cap}M)
            </button>
          )}
        </div>

        {/* Ancla "hasta" */}
        {showAncla && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="range-anchor"
              className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
            >
              Hasta
            </label>
            <select
              id="range-anchor"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
              value={anchorMes ?? ultimoMesDisponible}
              onChange={(e) => onAnchorChange?.(e.target.value)}
            >
              {opcionesAncla.map((m) => (
                <option key={m} value={m}>
                  {formatMesLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Slider personalizado */}
      <div className="mt-3 flex items-center gap-3">
        <input
          aria-label="Cantidad de meses"
          className="flex-1 accent-[#15caca]"
          max={cap}
          min={1}
          onChange={(e) => commitDebounced(parseInt(e.target.value, 10))}
          step={1}
          type="range"
          value={draft}
        />
        <div className="flex items-center gap-1.5 text-xs">
          <input
            aria-label="Cantidad exacta de meses"
            className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-xs font-semibold text-slate-700 focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20"
            max={cap}
            min={1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) commitDebounced(n);
            }}
            type="number"
            value={draft}
          />
          <span className="text-slate-500">de {cap} meses</span>
        </div>
      </div>
    </div>
  );
}
