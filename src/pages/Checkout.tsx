import { Check, ChevronLeft, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { Panel } from "../components/ui/Panel";
import planes from "../data/planes.json";
import type { Plan, PlanId } from "../types";
import { usd } from "../utils/format";
import { getSession } from "../utils/session";

type FormState = {
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  rol: string;
  plan: PlanId;
  fuente: string;
  nemo: string;
  comunicaciones: boolean;
};

const planList = planes as Plan[];
const roles = [
  "CEO",
  "CFO / Director Financiero",
  "Gerente de Operaciones",
  "Área de Energía",
  "Otro",
];
const sources = ["Email", "LinkedIn", "Búsqueda en Google", "Referido", "Otro"];

function planFromParam(value: string | null): PlanId {
  if (value === "gestion" || value === "full" || value === "white-label") {
    return value;
  }
  return "compliance";
}

function getSelectedPlan(id: PlanId) {
  return planList.find((plan) => plan.id === id) ?? planList[0];
}

export default function Checkout() {
  const [params] = useSearchParams();
  const session = getSession();
  const navigate = useNavigate();
  const initialPlan = planFromParam(params.get("plan"));
  const [form, setForm] = useState<FormState>({
    nombre: "",
    email: session?.email ?? "",
    empresa: session?.empresa ?? "COTA S.A.",
    telefono: "",
    rol: "",
    plan: initialPlan,
    fuente: "",
    nemo: session ? "COTANADN" : "",
    comunicaciones: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successEmail, setSuccessEmail] = useState("");

  const selectedPlan = useMemo(() => getSelectedPlan(form.plan), [form.plan]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.nombre.trim()) next.nombre = "Este campo es obligatorio";
    if (!form.email.trim()) next.email = "Este campo es obligatorio";
    if (form.email && (!form.email.includes("@") || !form.email.includes("."))) {
      next.email = "Ingresá un correo válido";
    }
    if (!form.empresa.trim()) next.empresa = "Este campo es obligatorio";
    if (!form.rol) next.rol = "Este campo es obligatorio";
    if (!form.plan) next.plan = "Este campo es obligatorio";
    if (!form.comunicaciones) {
      next.comunicaciones = "Este campo es obligatorio";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError("");

    const payload = {
      ...form,
      plan_nombre: selectedPlan.nombre,
      plan_precio_usd: selectedPlan.precio_usd,
      timestamp: new Date().toISOString(),
      origen: window.location.href,
    };

    try {
      const endpoint = import.meta.env.VITE_LEADS_ENDPOINT as string | undefined;
      if (endpoint) {
        const response = await fetch(endpoint, {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) throw new Error("request failed");
      } else {
        const current = JSON.parse(localStorage.getItem("energyos_leads") ?? "[]");
        localStorage.setItem("energyos_leads", JSON.stringify([...current, payload]));
        await new Promise((resolve) => window.setTimeout(resolve, 650));
      }
      setSuccessEmail(form.email);
    } catch {
      setSubmitError(
        "Hubo un problema al enviar. Por favor escribinos directamente a hola@energyos.ar",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (successEmail) {
    return (
      <div className="min-h-screen bg-navy px-4 py-8 text-ivory">
        <div className="mx-auto max-w-3xl">
          <Logo />
          <Panel className="mt-10 p-8 text-center md:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-forest/35 bg-forest/15 text-forest-light">
              <Check size={32} />
            </div>
            <h1 className="mt-6 font-fraunces text-3xl font-bold">
              Tu solicitud fue recibida
            </h1>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-mist">
              Recibimos tu solicitud para el Plan {selectedPlan.nombre}. Un
              especialista de EnergyOS se va a contactar con vos en las próximas
              24 horas hábiles al correo {successEmail} para completar la
              configuración de tu cuenta.
            </p>
            <p className="mt-4 text-sm text-mist">
              Mientras esperamos, podés seguir explorando el sistema con tu
              acceso actual.
            </p>
            <Button className="mt-8" onClick={() => navigate("/dashboard")}>
              Volver al dashboard
            </Button>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy px-4 py-8 text-ivory">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo compact />
          <Link className="inline-flex items-center gap-2 text-sm text-mist hover:text-ivory" to="/">
            <ChevronLeft size={16} />
            Contratar EnergyOS
          </Link>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <section>
            <p className="text-sm uppercase text-mist">Activación de cuenta</p>
            <h1 className="mt-2 font-fraunces text-4xl font-bold text-ivory">
              Completá tus datos para comenzar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-mist">
              Un especialista de EnergyOS te contacta en menos de 24 horas para
              activar tu cuenta.
            </p>

            <form className="mt-8 grid gap-5" onSubmit={submit}>
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  error={errors.nombre}
                  label="Nombre completo *"
                  onChange={(value) => update("nombre", value)}
                  placeholder="Tu nombre y apellido"
                  value={form.nombre}
                />
                <Field
                  error={errors.email}
                  label="Correo electrónico corporativo *"
                  onChange={(value) => update("email", value)}
                  placeholder="tu@empresa.com.ar"
                  type="email"
                  value={form.email}
                />
                <Field
                  error={errors.empresa}
                  label="Empresa *"
                  onChange={(value) => update("empresa", value)}
                  placeholder="COTA S.A."
                  value={form.empresa}
                />
                <Field
                  label="Teléfono de contacto"
                  onChange={(value) => update("telefono", value)}
                  placeholder="+54 9 11 0000-0000"
                  value={form.telefono}
                />
                <SelectField
                  error={errors.rol}
                  label="Rol en la empresa *"
                  onChange={(value) => update("rol", value)}
                  options={roles}
                  placeholder="Seleccioná un rol"
                  value={form.rol}
                />
                <label className="block">
                  <span className="text-sm font-medium text-ivory">
                    Plan seleccionado *
                  </span>
                  <select
                    className={`mt-2 w-full rounded border bg-navy px-4 py-3 text-ivory outline-none transition focus:border-forest ${
                      errors.plan ? "border-danger" : "border-navy-border"
                    }`}
                    onChange={(event) => update("plan", event.target.value as PlanId)}
                    value={form.plan}
                  >
                    {planList
                      .filter((plan) => plan.id !== "white-label")
                      .map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.nombre}{" "}
                          {plan.precio_usd ? `USD ${plan.precio_usd}` : ""}
                        </option>
                      ))}
                    <option value="white-label">Comercializador</option>
                  </select>
                  {errors.plan ? (
                    <p className="mt-1 text-xs text-danger">{errors.plan}</p>
                  ) : null}
                </label>
                <SelectField
                  label="¿Cómo nos encontraste?"
                  onChange={(value) => update("fuente", value)}
                  options={sources}
                  placeholder="Seleccioná una opción"
                  value={form.fuente}
                />
                <Field
                  label="Nemo CAMMESA"
                  onChange={(value) => update("nemo", value)}
                  placeholder="Ej: COTANADN"
                  value={form.nemo}
                />
              </div>

              <label className="flex items-start gap-3 rounded border border-navy-border bg-navy/45 p-4">
                <input
                  checked={form.comunicaciones}
                  className="mt-1 h-4 w-4 accent-forest"
                  onChange={(event) => update("comunicaciones", event.target.checked)}
                  type="checkbox"
                />
                <span className="text-sm leading-6 text-mist">
                  Acepto recibir comunicaciones de EnergyOS sobre mi cuenta y
                  novedades del mercado.
                  {errors.comunicaciones ? (
                    <span className="block text-danger">{errors.comunicaciones}</span>
                  ) : null}
                </span>
              </label>

              {submitError ? (
                <p className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
                  {submitError}
                </p>
              ) : null}

              <Button className="w-full py-4" disabled={submitting} type="submit">
                <Send size={16} />
                {submitting ? "Enviando..." : "Solicitar activación de cuenta"}
              </Button>
              <p className="text-center text-xs leading-5 text-mist">
                Al hacer click no se procesa ningún cobro. Un especialista te
                contacta para completar la configuración de tu cuenta.
              </p>
            </form>
          </section>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <PlanSummary plan={selectedPlan} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ivory">{label}</span>
      <input
        className={`mt-2 w-full rounded border bg-navy px-4 py-3 text-ivory outline-none transition placeholder:text-mist/60 focus:border-forest ${
          error ? "border-danger" : "border-navy-border"
        }`}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ivory">{label}</span>
      <select
        className={`mt-2 w-full rounded border bg-navy px-4 py-3 text-ivory outline-none transition focus:border-forest ${
          error ? "border-danger" : "border-navy-border"
        }`}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-syne text-base font-bold text-ivory">
          Resumen de tu selección
        </h2>
        {plan.recomendado ? <Badge tone="plan">Más popular</Badge> : null}
      </div>
      <h3 className="mt-6 font-fraunces text-3xl font-bold text-ivory">
        {plan.nombre}
      </h3>
      <div className="mt-3">
        {plan.precio_usd ? (
          <p className="number font-syne text-4xl font-extrabold text-ivory">
            {usd(plan.precio_usd)}
            <span className="text-base font-semibold text-mist">/mes</span>
          </p>
        ) : (
          <p className="font-syne text-2xl font-bold text-ivory">A medida</p>
        )}
      </div>
      <p className="mt-4 text-sm leading-6 text-mist">{plan.descripcion}</p>
      <ul className="mt-6 space-y-3">
        {plan.features.map((feature) => (
          <li className="flex gap-2 text-sm text-ivory" key={feature}>
            <Check className="mt-0.5 shrink-0 text-forest-light" size={16} />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-2 border-t border-navy-border pt-5 text-sm text-mist">
        <p>✓ Sin permanencia</p>
        <p>✓ Cancelá cuando quieras</p>
        <p>✓ Soporte incluido</p>
      </div>
      <a
        className="mt-5 block text-sm font-medium text-forest hover:text-forest-light"
        href="mailto:hola@energyos.ar"
      >
        O escribinos directo: hola@energyos.ar
      </a>
    </Panel>
  );
}
