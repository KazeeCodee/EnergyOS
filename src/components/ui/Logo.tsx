export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-baseline gap-1 font-syne font-extrabold tracking-normal">
      <span className={compact ? "text-lg" : "text-3xl"}>Energy</span>
      <span className={`text-forest ${compact ? "text-lg" : "text-3xl"}`}>
        OS
      </span>
    </div>
  );
}
