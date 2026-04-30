import { CheckCircle, ChevronRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Logo } from "../../components/ui/Logo";
import { useAppContext } from "../../context/AppContext";
import {
  acceptTerms,
  searchAgentes,
  linkUserAgente,
  setUserRole,
} from "../../services/onboarding";
import {
  tiposForRole,
  type AgenteSearchResult,
  type UserRole,
} from "../../types/onboarding";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROL_OPTIONS: { value: UserRole; label: string; description: string; emoji: string }[] = [
  { value: "gran_consumidor", label: "Gran Consumidor", description: "GUMA o GUME con datos publicados", emoji: "🏭" },
];

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Paso 1 — Rol
// ---------------------------------------------------------------------------

function PasoRol({
  currentRole,
  onConfirm,
}: {
  currentRole: UserRole | null;
  onConfirm: (role: UserRole) => Promise<void>;
}) {
  const [selected, setSelected] = useState<UserRole | null>(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      await onConfirm(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el rol.");
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#163759]">¿Qué tipo de agente sos?</h2>
      <p className="mt-1 text-sm text-slate-500">
        Esto nos permite mostrarte la información relevante para tu categoría.
      </p>

      <div className="mt-6 grid gap-3">
        {ROL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
              selected === opt.value
                ? "border-[#15caca] bg-[#15caca]/5"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            onClick={() => setSelected(opt.value)}
            type="button"
          >
            <span className="text-2xl">{opt.emoji}</span>
            <div className="flex-1">
              <p className={`font-semibold ${selected === opt.value ? "text-[#0e8a8a]" : "text-slate-800"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
            </div>
            {selected === opt.value && (
              <CheckCircle className="shrink-0 text-[#15caca]" size={20} />
            )}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163759] py-3.5 font-semibold text-white hover:bg-[#0d2136] disabled:opacity-50 transition-colors"
        disabled={!selected || loading}
        onClick={confirm}
        type="button"
      >
        {loading ? "Guardando..." : "Continuar"}
        {!loading && <ChevronRight size={18} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 2 — Agente
// ---------------------------------------------------------------------------

function PasoAgente({
  role,
  onConfirm,
}: {
  role: UserRole;
  onConfirm: (nemo: string, descripcion: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AgenteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AgenteSearchResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 300);
  const tipos = tiposForRole(role);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    searchAgentes(debouncedQuery, { tipos })
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQuery, tipos]);

  const handleSelect = (agente: AgenteSearchResult) => {
    setSelected(agente);
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    setError("");
    try {
      await onConfirm(selected.nemo, selected.descripcion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al vincular el agente.");
      setConfirming(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#163759]">Buscá tu empresa en CAMMESA</h2>
      <p className="mt-1 text-sm text-slate-500">
        Ingresá NEMO o razón social. Solo se muestran agentes con dashboard publicado:{" "}
        <strong>{tipos ? tipos.slice(0, 3).join(", ") : "todos los agentes"}</strong>.
      </p>

      {/* Search input */}
      <div className="relative mt-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          ref={inputRef}
          autoFocus
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20 transition-colors"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: ARCOR, TENARIS, o código NEMO..."
          type="search"
          value={query}
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[#15caca]" />
        )}
      </div>

      {/* Resultados */}
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm">
          {results.map((r) => (
            <li key={r.nemo}>
              <button
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#15caca]/5 transition-colors"
                onClick={() => handleSelect(r)}
                type="button"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{r.descripcion}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-mono">{r.nemo}</span>
                    {r.agrupacion ? ` · ${r.agrupacion}` : ""}
                    {" · "}
                    <span className="text-[#0e8a8a]">{r.tipoAgente}</span>
                  </p>
                </div>
                <ChevronRight className="shrink-0 mt-0.5 text-slate-300" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {debouncedQuery.length >= 2 && !searching && results.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500">
          No encontramos agentes con ese criterio. Probá con otro nombre o NEMO.
        </p>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Modal de confirmación */}
      {showConfirmModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-[#163759]">Confirmar vínculo</h3>
              <button
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setShowConfirmModal(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-semibold text-slate-800 text-sm">{selected.descripcion}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{selected.nemo}</p>
              <p className="text-xs text-[#0e8a8a] mt-0.5">{selected.tipoAgente}</p>
            </div>

            <p className="mt-4 text-sm text-slate-600 leading-relaxed">
              Vas a vincular esta empresa a tu cuenta. Esta acción{" "}
              <strong className="text-slate-800">no se puede deshacer</strong> desde la app. Si
              cometiste un error, contactá al equipo de soporte.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                disabled={confirming}
                onClick={() => setShowConfirmModal(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="flex-1 rounded-xl bg-[#163759] py-2.5 text-sm font-semibold text-white hover:bg-[#0d2136] disabled:opacity-50 transition-colors"
                disabled={confirming}
                onClick={handleConfirm}
                type="button"
              >
                {confirming ? "Vinculando..." : "Sí, vincular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 3 — Términos
// ---------------------------------------------------------------------------

function PasoVerify({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (!accepted) return;
    setLoading(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al confirmar.");
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-[#163759]">Términos y condiciones</h2>
      <p className="mt-1 text-sm text-slate-500">
        Antes de continuar, revisá y aceptá los términos de uso de EnergyOS.
      </p>

      <div className="mt-5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-700 mb-2">Términos de uso de EnergyOS</p>
        <p>
          EnergyOS proporciona información energética derivada de datos públicos del Mercado Eléctrico
          Mayorista (MEM) publicados por CAMMESA. Los datos son de carácter informativo y no
          constituyen asesoramiento legal, financiero ni regulatorio.
        </p>
        <p className="mt-2">
          El usuario es responsable de verificar la información con las fuentes oficiales antes de
          tomar decisiones basadas en los datos presentados. EnergyOS no garantiza la exactitud,
          integridad o actualización en tiempo real de los datos.
        </p>
        <p className="mt-2">
          El uso de la plataforma implica la aceptación de estos términos y de la política de
          privacidad de EnergyOS.
        </p>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          checked={accepted}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[#15caca]"
          onChange={(e) => setAccepted(e.target.checked)}
          type="checkbox"
        />
        <span className="text-sm text-slate-700">
          Leí y acepto los términos de uso de EnergyOS.
        </span>
      </label>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163759] py-3.5 font-semibold text-white hover:bg-[#0d2136] disabled:opacity-50 transition-colors"
        disabled={!accepted || loading}
        onClick={confirm}
        type="button"
      >
        {loading ? "Confirmando..." : "Comenzar a usar EnergyOS"}
        {!loading && <ChevronRight size={18} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding shell
// ---------------------------------------------------------------------------

const STEP_LABELS = ["Tu rol", "Tu empresa", "Términos"];

export default function AppOnboarding() {
  const { profile, refresh } = useAppContext();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  // Derivar step activo desde el perfil
  const currentStep: 0 | 1 | 2 = (() => {
    if (!profile?.role) return 0;
    if ((profile.agentesCount ?? 0) === 0) return 1;
    if (!profile.acceptedTermsAt) return 2;
    return 2; // fallback
  })();

  const handleRolConfirm = useCallback(
    async (role: UserRole) => {
      await setUserRole(role);
      await refresh();
    },
    [refresh],
  );

  const handleAgenteConfirm = useCallback(
    async (nemo: string) => {
      await linkUserAgente(nemo);
      await refresh();
    },
    [refresh],
  );

  const handleVerifyConfirm = useCallback(async () => {
    await acceptTerms();
    setRefreshing(true);
    await refresh();
    navigate("/app", { replace: true });
  }, [refresh, navigate]);

  if (refreshing) {
    return <LoadingScreen messages={["Configurando tu cuenta...", "Casi listo..."]} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <Logo compact />
          </div>
          <h1 className="text-2xl font-bold text-[#163759]">Configurá tu cuenta</h1>
          <p className="mt-1 text-sm text-slate-500">Completá estos pasos una sola vez</p>
        </div>

        {/* Step indicators */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  i < currentStep
                    ? "bg-[#15caca] text-white"
                    : i === currentStep
                    ? "bg-[#163759] text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {i < currentStep ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  i === currentStep ? "text-[#163759]" : "text-slate-400"
                }`}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`h-px w-6 sm:w-10 ${i < currentStep ? "bg-[#15caca]" : "bg-slate-200"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {currentStep === 0 && (
            <PasoRol currentRole={profile?.role ?? null} onConfirm={handleRolConfirm} />
          )}
          {currentStep === 1 && profile?.role && (
            <PasoAgente role={profile.role} onConfirm={handleAgenteConfirm} />
          )}
          {currentStep === 2 && (
            <PasoVerify onConfirm={handleVerifyConfirm} />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Problemas para continuar?{" "}
          <a
            className="text-[#0e8a8a] underline hover:no-underline"
            href="mailto:soporte@energyos.com.ar"
          >
            Contactá a soporte
          </a>
        </p>
      </div>
    </div>
  );
}
