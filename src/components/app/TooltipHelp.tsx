import { useState } from "react";

export function TooltipHelp({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        aria-label="Más información"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500 hover:border-[#15caca] hover:text-[#15caca] transition-colors focus:outline-none"
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        ?
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-lg leading-relaxed">
          {content}
          {/* pequeño triángulo */}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
        </span>
      )}
    </span>
  );
}
