import type { ReactNode } from "react";

type Tone = "success" | "warning" | "neutral" | "plan" | "danger";

const tones: Record<Tone, string> = {
  success: "border-forest/20 bg-forest/10 text-forest",
  warning: "border-alert/45 bg-alert/10 text-alert",
  neutral: "border-mist/25 bg-navy text-mist",
  plan: "border-forest/20 bg-forest/10 text-forest",
  danger: "border-danger/40 bg-danger/10 text-ivory",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-syne text-[11px] font-bold uppercase leading-none tracking-normal ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
