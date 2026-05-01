import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { supabase } from "../lib/supabase";
import { clearSession } from "../utils/session";

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let recoveryDetected = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryDetected = true;
        setPhase("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (recoveryDetected) return;
      if (data.session) {
        setPhase("ready");
      } else {
        setPhase("invalid");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError("");
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    clearSession();
    await supabase.auth.signOut();
    setPhase("done");
    setSaving(false);
    setTimeout(() => navigate("/", { replace: true }), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      <section className="w-full max-w-md rounded border border-navy-border bg-navy-medium p-6 shadow-panel md:p-8">
        <div className="mb-8 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <p className="mt-2 text-sm text-mist">
            Inteligencia Energética · MEM Argentina
          </p>
        </div>

        <h1 className="font-fraunces text-2xl font-bold text-ivory">
          Definir nueva contraseña
        </h1>

        {phase === "checking" ? (
          <p className="mt-6 text-sm text-mist">Validando enlace...</p>
        ) : null}

        {phase === "invalid" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-ivory">
              El enlace de recuperación no es válido o ya expiró. Solicitá uno nuevo.
            </div>
            <Button
              className="w-full py-3"
              type="button"
              onClick={() => navigate("/recuperar", { replace: true })}
            >
              Pedir nuevo enlace
            </Button>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="mt-6 rounded border border-forest/40 bg-forest/10 px-3 py-3 text-sm text-ivory">
            Contraseña actualizada. Redirigiendo al inicio de sesión...
          </div>
        ) : null}

        {phase === "ready" ? (
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="text-sm font-medium text-ivory">Nueva contraseña</span>
              <span className="mt-2 flex rounded border border-navy-border bg-navy focus-within:border-forest">
                <input
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-ivory outline-none placeholder:text-mist/60"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  className="px-3 text-mist transition hover:text-ivory"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ivory">Repetir contraseña</span>
              <input
                autoComplete="new-password"
                className="mt-2 w-full rounded border border-navy-border bg-navy px-4 py-3 text-ivory outline-none transition placeholder:text-mist/60 focus:border-forest"
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={confirm}
              />
            </label>

            {error ? (
              <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ivory">
                {error}
              </p>
            ) : null}

            <Button className="w-full py-3" type="submit" disabled={saving}>
              <KeyRound size={16} />
              {saving ? "Guardando..." : "Guardar contraseña"}
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
