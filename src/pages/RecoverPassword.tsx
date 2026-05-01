import { ArrowLeft, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { supabase } from "../lib/supabase";

export default function RecoverPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setError("Ingresá un correo electrónico válido.");
      return;
    }
    setError("");
    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
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
          Recuperar contraseña
        </h1>
        <p className="mt-2 text-sm text-mist">
          Ingresá tu correo y te enviaremos un enlace para definir una nueva contraseña.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded border border-forest/40 bg-forest/10 px-3 py-3 text-sm text-ivory">
              Si la cuenta existe, vas a recibir un correo con el enlace de recuperación.
              Revisá tu bandeja de entrada y la carpeta de spam.
            </div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-mist hover:text-ivory">
              <ArrowLeft size={14} />
              Volver al inicio
            </Link>
          </div>
        ) : (
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

            {error ? (
              <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ivory">
                {error}
              </p>
            ) : null}

            <Button className="w-full py-3" type="submit" disabled={sending}>
              <Mail size={16} />
              {sending ? "Enviando..." : "Enviar enlace"}
            </Button>

            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-mist hover:text-ivory"
            >
              <ArrowLeft size={14} />
              Volver al inicio
            </Link>
          </form>
        )}
      </section>
    </div>
  );
}
