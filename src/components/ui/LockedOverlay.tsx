import { Lock } from "lucide-react";
import { Button } from "./Button";

export function LockedOverlay({
  planName = "Gestion",
  title,
  description,
  onUpgradeClick,
}: {
  planName?: string;
  title?: string;
  description: string;
  onUpgradeClick: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/88 px-6 text-center backdrop-blur-sm">
      <div className="mb-4 rounded-full border border-forest/35 bg-forest/15 p-3 text-forest-light">
        <Lock size={28} />
      </div>
      <h3 className="font-fraunces text-2xl font-bold text-ivory">
        {title ?? `Disponible en Plan ${planName}`}
      </h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-mist">{description}</p>
      <Button className="mt-6" onClick={onUpgradeClick}>
        Ver planes
      </Button>
    </div>
  );
}
