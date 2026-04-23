import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Logo } from "../components/ui/Logo";
import { setSession } from "../utils/session";

const accessMessages = [
  "Validando acceso...",
  "Preparando información energética...",
  "Organizando indicadores...",
  "Listo",
];

export default function Access() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validEmail = email.includes("@") && email.includes(".");
    const validPassword = password.length >= 6;

    if (!validEmail || !validPassword) {
      setError("El correo o la contraseña no son válidos. Verificá los datos ingresados.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await setSession(email, password);
      navigate("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos validar tu acceso. Verificá los datos ingresados.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      {loading ? (
        <LoadingScreen messages={accessMessages} />
      ) : null}

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
              className="mt-2 w-full rounded border border-navy-border bg-navy px-4 py-3 text-ivory outline-none transition placeholder:text-mist/60 focus:border-forest"
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

          {error ? (
            <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ivory">
              {error}
            </p>
          ) : null}

          <Button className="w-full py-3" type="submit">
            <LogIn size={16} />
            Ingresar
          </Button>
        </form>

        <Link
          className="mt-6 block text-center text-sm text-forest transition hover:text-forest-light"
          to="/contratacion"
        >
          ¿Aún no tenés acceso? Solicitá una cuenta
        </Link>
      </section>
    </div>
  );
}
