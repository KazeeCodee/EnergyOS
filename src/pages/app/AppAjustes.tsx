import { useState } from "react";
import { Building2, Calendar, KeyRound, LogOut, MessageSquare, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { useAppContext } from "../../context/AppContext";
import { supabase } from "../../lib/supabase";
import { clearSession } from "../../utils/session";

// ---------------------------------------------------------------------------
// Sección wrapper con icono
// ---------------------------------------------------------------------------
function Seccion({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#15caca]/10 text-[#0e8a8a]">
          <Icon size={15} />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajustes page
// ---------------------------------------------------------------------------
export default function AppAjustes() {
  const { agente, profile, ultimoMesDisponible } = useAppContext();
  const navigate = useNavigate();

  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleResetPassword = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userEmail = authData.user?.email;
    if (!userEmail) return;
    setSendingReset(true);
    setResetError("");
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      setResetError(error.message);
    } else {
      setResetSent(true);
    }
    setSendingReset(false);
  };

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setSendingFeedback(true);
    setFeedbackError("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.from("contact_messages").insert({
        name: profile?.displayName ?? profile?.fullName ?? "Usuario EnergyOS",
        company: agente?.descripcion ?? agente?.nemo ?? null,
        email: authData.user?.email ?? "sin-email@energyos.local",
        message: `[Feedback app${agente?.nemo ? ` · ${agente.nemo}` : ""}]\n\n${feedback.trim()}`,
      });
      if (error) throw error;
      setFeedbackSent(true);
      setFeedback("");
    } catch {
      window.location.href = `mailto:soporte@energyos.com.ar?subject=Feedback EnergyOS&body=${encodeURIComponent(feedback)}`;
    }
    setSendingFeedback(false);
  };

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <div>
      <ModuleHeader title="Ajustes" subtitle="Tu cuenta, empresa vinculada y preferencias" />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Perfil */}
        <Seccion title="Tu perfil" icon={User}>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-slate-400">Nombre</dt>
              <dd className="mt-0.5 font-semibold text-[#163759]">
                {profile?.displayName ?? profile?.fullName ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Rol en el sistema</dt>
              <dd className="mt-0.5 font-semibold text-[#163759] capitalize">
                {profile?.role?.replace("_", " ") ?? "—"}
              </dd>
            </div>
          </dl>
        </Seccion>

        {/* Empresa vinculada */}
        <Seccion title="Empresa vinculada" icon={Building2}>
          {agente ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-slate-400">Razón social</dt>
                <dd className="mt-0.5 font-semibold text-[#163759]">{agente.descripcion}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">NEMO CAMMESA</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-[#163759]">{agente.nemo}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Tipo de agente</dt>
                <dd className="mt-0.5 text-sm text-slate-700">{agente.tipoAgente}</dd>
              </div>
              {agente.agrupacion && (
                <div>
                  <dt className="text-xs text-slate-400">Agrupación</dt>
                  <dd className="mt-0.5 text-sm text-slate-700">{agente.agrupacion}</dd>
                </div>
              )}
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                ✓ Empresa vinculada
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Sin empresa vinculada.</p>
          )}
        </Seccion>

        {/* Estado de datos */}
        <Seccion title="Estado de datos" icon={Calendar}>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-sm font-semibold text-slate-700">Datos disponibles</p>
                <p className="text-xs text-slate-500">
                  {ultimoMesDisponible
                    ? `Hasta ${new Date(parseInt(ultimoMesDisponible.split("-")[0]), parseInt(ultimoMesDisponible.split("-")[1]) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}`
                    : "Cargando..."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-xl">🔌</span>
              <div>
                <p className="text-sm font-semibold text-slate-700">Fuente</p>
                <p className="text-xs text-slate-500">CAMMESA · Mercado Eléctrico Mayorista Argentina</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-xl">🔄</span>
              <div>
                <p className="text-sm font-semibold text-slate-700">Frecuencia de actualización</p>
                <p className="text-xs text-slate-500">Mensual, junto con la publicación oficial de CAMMESA.</p>
              </div>
            </div>
          </div>
        </Seccion>

        {/* Seguridad */}
        <Seccion title="Seguridad" icon={KeyRound}>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Restablecer contraseña</p>
              <p className="text-xs text-slate-500 mb-3">Te enviaremos un email con el enlace para cambiarla.</p>
              {resetSent ? (
                <AlertaBanner type="success" message="Email de restablecimiento enviado. Revisá tu bandeja." />
              ) : (
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  disabled={sendingReset}
                  onClick={handleResetPassword}
                  type="button"
                >
                  {sendingReset ? "Enviando..." : "Enviar email de restablecimiento"}
                </button>
              )}
              {resetError && <p className="mt-2 text-xs text-red-600">{resetError}</p>}
            </div>
          </div>
        </Seccion>

        {/* Feedback */}
        <Seccion title="Feedback y contacto" icon={MessageSquare}>
          {feedbackSent ? (
            <AlertaBanner type="success" message="¡Gracias por tu feedback! Lo revisaremos pronto." />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">¿Encontraste algo raro? ¿Falta algo? Escribinos.</p>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20 transition-colors resize-none"
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tu mensaje o consulta..."
                rows={4}
                value={feedback}
              />
              {feedbackError && <p className="text-xs text-red-600">{feedbackError}</p>}
              <button
                className="rounded-xl bg-[#163759] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0d2136] disabled:opacity-50 transition-colors"
                disabled={!feedback.trim() || sendingFeedback}
                onClick={handleSendFeedback}
                type="button"
              >
                {sendingFeedback ? "Enviando..." : "Enviar mensaje"}
              </button>
            </div>
          )}
        </Seccion>

        {/* Cerrar sesión */}
        <Seccion title="Sesión" icon={LogOut}>
          {!confirmLogout ? (
            <div>
              <p className="text-sm text-slate-500 mb-4">Al cerrar sesión necesitarás volver a ingresar tus credenciales.</p>
              <button
                className="rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                onClick={() => setConfirmLogout(true)}
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">¿Confirmás que querés cerrar sesión?</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  onClick={() => setConfirmLogout(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                  onClick={handleLogout}
                  type="button"
                >
                  Sí, cerrar sesión
                </button>
              </div>
            </div>
          )}
        </Seccion>
      </div>

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
