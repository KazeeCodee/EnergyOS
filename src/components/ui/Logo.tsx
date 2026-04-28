export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      alt="EnergyOS"
      className={`${compact ? "h-7" : "h-10"} w-auto object-contain select-none`}
      draggable={false}
      src="/logo.png"
    />
  );
}
