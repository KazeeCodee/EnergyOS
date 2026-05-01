import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { useToast } from "../components/ui/Toast";
import { useAppContext } from "../context/AppContext";
import { isCurrentUserAdmin } from "../services/adminData";
import { setSession } from "../utils/session";

export default function Access() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAppContext();
  const toast = useToast();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    const validEmail = trimmedEmail.includes("@") && trimmedEmail.includes(".");
    const validPassword = trimmedPassword.length >= 6;

    if (!validEmail || !validPassword) {
      toast.error({
        title: "Datos inválidos",
        description: "Revisá el correo y la contraseña antes de continuar.",
      });
      return;
    }

    setLoading(true);
    try {
      await setSession(trimmedEmail, trimmedPassword);
      const [, isAdmin] = await Promise.all([refresh(), isCurrentUserAdmin()]);
      if (isAdmin) {
        navigate("/admin", { replace: true });
        return;
      }
      navigate("/app", { replace: true });
    } catch (caught) {
      const description =
        caught instanceof Error
          ? caught.message
          : "Verificá los datos ingresados y volvé a intentar.";
      toast.error({ title: "No pudimos iniciar sesión", description });
      setLoading(false);
    }
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
          Acceder a tu cuenta
        </h1>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="text-sm font-medium text-ivory">Correo electrónico</span>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded border border-navy-border bg-navy px-4 py-3 text-ivory outline-none transition placeholder:text-mist/60 focus:border-forest disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@empresa.com.ar"
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ivory">Contraseña</span>
            <span className="mt-2 flex rounded border border-navy-border bg-navy focus-within:border-forest">
              <input
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-ivory outline-none placeholder:text-mist/60 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={loading}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                className="px-3 text-mist transition hover:text-ivory disabled:opacity-60"
                disabled={loading}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <Button className="w-full py-3" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Ingresar
              </>
            )}
          </Button>

          <div className="text-center">
            <Link
              to="/recuperar"
              className="text-sm text-mist transition hover:text-ivory"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>

      </section>
    </div>
  );
}
