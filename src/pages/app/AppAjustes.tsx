import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { useAppContext } from "../../context/AppContext";
import { supabase } from "../../lib/supabase";
import { clearSession } from "../../utils/session";

// ---------------------------------------------------------------------------
// Sección wrapper
// ---------------------------------------------------------------------------
function Seccion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">{title}</h2>
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

  // Feedback
  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Reset password
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  // Logout confirm
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
      const { error } = await supabase.from("feedback").insert({
        mensaje: feedback.trim(),
        nemo: agente?.nemo ?? null,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setFeedbackSent(true);
      setFeedback("");
    } catch {
      // Fallback: abrir mailto
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
      <ModuleHeader title="Ajustes" subtitle="Configuración de tu cuenta y empresa" />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Perfil */}
        <Seccion title="Tu perfil">
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
        <Seccion title="Empresa vinculada">
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
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#15caca]/10 px-3 py-1 text-xs font-semibold text-[#0e8a8a]">
                ✓ Empresa vinculada
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Sin empresa vinculada.</p>
          )}
        </Seccion>

        {/* Estado de datos */}
        <Seccion title="Estado de datos">
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
                <p className="text-sm font-semibold text-slate-700">Fuente de datos</p>
                <p className="text-xs text-slate-500">CAMMESA — Mercado Eléctrico Mayorista Argentina</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-xl">🔄</span>
              <div>
                <p className="text-sm font-semibold text-slate-700">Actualización</p>
                <p className="text-xs text-slate-500">Los datos se actualizan mensualmente con la publicación de CAMMESA.</p>
              </div>
            </div>
          </div>
        </Seccion>

        {/* Seguridad */}
        <Seccion title="Seguridad">
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
        <Seccion title="Feedback y contacto">
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
        <Seccion title="Sesión">
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
