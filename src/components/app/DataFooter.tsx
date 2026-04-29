export function DataFooter({
  ultimoMesDisponible,
  fuente = "CAMMESA",
}: {
  ultimoMesDisponible: string;
  fuente?: string;
}) {
  if (!ultimoMesDisponible) return null;

  const [yearStr, monthStr] = ultimoMesDisponible.split("-");
  const label = new Date(
    parseInt(yearStr, 10),
    parseInt(monthStr, 10) - 1,
    1,
  ).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
        📅 Datos hasta {label}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
        🔌 Fuente {fuente}
      </span>
    </div>
  );
}
