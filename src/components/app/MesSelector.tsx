/**
 * MesSelector — dropdown de mes reutilizable.
 * Cada módulo lo instancia con su propio useState.
 * Props: value (YYYY-MM), onChange, ultimoMesDisponible para generar la lista.
 */

function buildMesesDisponibles(ultimoMes: string, cantidad = 24): string[] {
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

function formatMesLabel(mesStr: string): string {
  if (!mesStr) return "";
  const [yearStr, monthStr] = mesStr.split("-");
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function MesSelector({
  value,
  onChange,
  ultimoMesDisponible,
  label = "Período",
}: {
  value: string;
  onChange: (mes: string) => void;
  ultimoMesDisponible: string;
  label?: string;
}) {
  const opciones = buildMesesDisponibles(ultimoMesDisponible);

  if (opciones.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="mes-selector">
        {label}
      </label>
      <select
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20 transition-colors"
        id="mes-selector"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {opciones.map((m) => (
          <option key={m} value={m}>
            {formatMesLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
