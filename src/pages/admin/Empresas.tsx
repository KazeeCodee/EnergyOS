import { ArrowRight, Building2, LayoutGrid } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAdminContext } from "../../context/AdminContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { loadAdminEmpresas } from "../../services/adminData";
import type { AdminEmpresaRow } from "../../types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";

const initialEmpresas: AdminEmpresaRow[] = [];

const planLabels: Record<AdminEmpresaRow["plan_activo"], string> = {
  compliance: "Compliance",
  gestion: "Gestion",
  full: "Full",
  "white-label": "White label",
};

function getEstado(empresa: AdminEmpresaRow) {
  if (empresa.ultimo_mes === "Sin datos") {
    return { label: "Sin datos", tone: "neutral" as const };
  }
  if (empresa.porcentaje_renovable < 20) {
    return { label: "Riesgo", tone: "warning" as const };
  }
  return { label: "OK", tone: "success" as const };
}

export default function Empresas() {
  const navigate = useNavigate();
  const { selectEmpresa } = useAdminContext();
  const { data: empresas, error, loading } = useAsyncData(loadAdminEmpresas, initialEmpresas);

  const openDashboard = (empresa: AdminEmpresaRow) => {
    selectEmpresa({ id: empresa.id, nombre: empresa.razon_social });
    navigate("/admin/dashboard");
  };

  const openConsolidado = (empresa: AdminEmpresaRow) => {
    selectEmpresa({ id: empresa.id, nombre: empresa.razon_social });
    navigate("/admin/consolidado");
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <LoadingScreen messages={["Cargando empresas...", "Leyendo cartera desde Supabase..."]} />
      ) : null}

      <div>
        <p className="text-sm uppercase text-mist">Admin</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">Empresas registradas</h2>
      </div>

      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      {empresas.length === 0 ? (
        <Panel className="p-8">
          <div className="flex items-start gap-4">
            <div className="rounded border border-navy-border bg-navy/50 p-3 text-forest">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="font-syne text-lg font-bold text-ivory">Todavia no hay empresas cargadas</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">
                Cuando registres la primera empresa en EnergyOS, va a aparecer aca con su plan, NEMOs
                activos, ultimo mes procesado y acceso directo al dashboard admin.
              </p>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="border-b border-navy-border px-5 py-4">
            <h3 className="font-syne text-base font-bold text-ivory">Cartera completa</h3>
            <p className="mt-1 text-sm text-mist">
              Selecciona una empresa para abrir su dashboard admin sin cambiar el flujo cliente.
            </p>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-navy/55 text-xs uppercase text-mist">
                <tr>
                  <th className="px-5 py-3">Razon social</th>
                  <th className="px-5 py-3">Nemo</th>
                  <th className="px-5 py-3">Plan activo</th>
                  <th className="px-5 py-3">Ultimo mes procesado</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-border">
                {empresas.map((empresa) => {
                  const estado = getEstado(empresa);
                  return (
                    <tr className="text-mist" key={empresa.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ivory">{empresa.razon_social}</p>
                        <p className="mt-1 text-xs">
                          {empresa.tipo_usuario}
                          {empresa.comercializador ? ` · ${empresa.comercializador}` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {empresa.nemos.length ? empresa.nemos.join(", ") : "Sin NEMO activo"}
                      </td>
                      <td className="px-5 py-4">{planLabels[empresa.plan_activo]}</td>
                      <td className="px-5 py-4">{empresa.ultimo_mes}</td>
                      <td className="px-5 py-4">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button onClick={() => openConsolidado(empresa)} type="button" variant="primary">
                            <LayoutGrid size={16} />
                            Consolidado
                          </Button>
                          <Button onClick={() => openDashboard(empresa)} type="button" variant="outline">
                            Dashboard
                            <ArrowRight size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
