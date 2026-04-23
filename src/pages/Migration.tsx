import { useState } from "react";
import { LockedOverlay } from "../components/ui/LockedOverlay";
import { Panel } from "../components/ui/Panel";
import { PricingModal } from "../components/ui/PricingModal";

export default function Migration() {
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <div className="space-y-6">
      {pricingOpen ? <PricingModal onClose={() => setPricingOpen(false)} /> : null}
      <div>
        <p className="text-sm uppercase text-mist">Migración al MEM</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Evaluación de migración y comercializadores
        </h2>
      </div>
      <div className="relative overflow-hidden rounded">
        <div className="pointer-events-none grid gap-6 blur-[6px] xl:grid-cols-3">
          {["Ahorro potencial", "Riesgo contractual", "Comercializadores"].map((title) => (
            <Panel className="min-h-52 p-5" key={title}>
              <p className="text-sm text-mist">{title}</p>
              <p className="number mt-6 font-syne text-4xl font-bold text-ivory">
                {title === "Comercializadores" ? "12" : title === "Ahorro potencial" ? "14%" : "Bajo"}
              </p>
              <div className="mt-8 h-2 rounded bg-navy-border">
                <div className="h-2 w-2/3 rounded bg-forest" />
              </div>
            </Panel>
          ))}
        </div>
        <LockedOverlay
          description="El módulo Full suma calculadora de migración, escenarios de contrato y directorio de comercializadores."
          onUpgradeClick={() => setPricingOpen(true)}
          planName="Full"
        />
      </div>
    </div>
  );
}
