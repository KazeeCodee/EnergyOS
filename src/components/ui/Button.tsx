import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "muted";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-forest text-white hover:bg-forest-dark focus-visible:ring-forest",
  outline:
    "border border-forest/70 text-forest hover:bg-forest/10 focus-visible:ring-forest",
  ghost:
    "text-mist hover:bg-navy-border/45 hover:text-ivory focus-visible:ring-mist",
  muted:
    "bg-navy-border/70 text-mist hover:bg-navy-border focus-visible:ring-mist",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 font-syne text-xs font-bold uppercase tracking-normal transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
