import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-navy-border bg-navy-medium shadow-panel ${className}`}
    >
      {children}
    </section>
  );
}
