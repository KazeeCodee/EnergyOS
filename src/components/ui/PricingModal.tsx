import { Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import planes from "../../data/planes.json";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getEmpresaData } from "../../services/energyData";
import type { EmpresaData, Plan } from "../../types";
import { Button } from "./Button";
import { Badge } from "./Badge";

const planList = planes as Plan[];
const initialEmpresa: EmpresaData = {
  id: "",
  razon_social: "",
  nemo: "",
  tipo_usuario: "GUME",
  comercializador: "",
  plan_activo: "compliance",
  miembro_desde: "",
  acuerdo_mensual_mwh: 0,
};

export function PricingModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: empresa } = useAsyncData(getEmpresaData, initialEmpresa);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-h-[92vh] w-full max-w-[920px] overflow-y-auto rounded-xl border border-navy-border bg-navy-medium p-6 shadow-panel md:p-10">
        <button
          className="absolute right-4 top-4 rounded px-3 py-2 text-2xl leading-none text-mist transition hover:text-ivory"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-fraunces text-3xl font-bold text-ivory">
            Elegí el plan que mejor se adapta a tu empresa
          </h2>
          <p className="mt-3 text-sm text-mist">
            Sin contratos de permanencia. Cancelá cuando quieras.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {planList
            .filter((plan) => plan.id !== "white-label")
            .map((plan) => {
              const active = plan.id === empresa.plan_activo;
              return (
                <article
                  className={`relative rounded border bg-navy p-5 ${
                    plan.recomendado
                      ? "border-2 border-forest"
                      : "border-navy-border"
                  }`}
                  key={plan.id}
                >
                  {plan.recomendado ? (
                    <Badge
                      tone="plan"
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-forest text-white"
                    >
                      Más popular
                    </Badge>
                  ) : null}
                  <h3 className="font-syne text-xl font-extrabold text-ivory">
                    {plan.nombre}
                  </h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-syne text-lg font-bold text-mist">
                      USD
                    </span>
                    <span className="number font-syne text-5xl font-extrabold text-ivory">
                      {plan.precio_usd}
                    </span>
                    <span className="text-sm text-mist">/mes</span>
                  </div>
                  <p className="mt-4 min-h-14 text-sm leading-6 text-mist">
                    {plan.descripcion}
                  </p>
                  <ul className="mt-5 space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        className="flex gap-2 text-sm leading-5 text-ivory"
                        key={feature}
                      >
                        <Check
                          className="mt-0.5 shrink-0 text-forest-light"
                          size={16}
                        />
                        {feature}
                      </li>
                    ))}
                    {plan.id === "compliance" ? (
                      <>
                        <li className="flex gap-2 text-sm text-mist">
                          <X className="mt-0.5 shrink-0" size={16} />
                          Benchmark de contratos
                        </li>
                        <li className="flex gap-2 text-sm text-mist">
                          <X className="mt-0.5 shrink-0" size={16} />
                          Proyección de costos
                        </li>
                      </>
                    ) : null}
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    disabled={active}
                    onClick={() => navigate(`/contratacion?plan=${plan.id}`)}
                    variant={active ? "muted" : plan.recomendado ? "primary" : "outline"}
                  >
                    {active ? "Plan actual" : `Contratar ${plan.nombre}`}
                  </Button>
                </article>
              );
            })}
        </div>

        <div className="mt-8 text-center text-sm text-mist">
          <p>
            ✓ Sin contratos de permanencia · ✓ Cancelá en cualquier momento · ✓
            Soporte incluido
          </p>
          <button
            className="mt-3 text-forest transition hover:text-forest-light"
            onClick={() => navigate("/contratacion?plan=white-label")}
          >
            ¿Necesitás un plan para comercializador? Consultá acá
          </button>
        </div>
      </div>
    </div>
  );
}
