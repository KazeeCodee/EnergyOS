import {
  Building2,
  FileSpreadsheet,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { LoadingScreen } from "../components/ui/LoadingScreen";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  createEmpresaCliente,
  createProcesamiento,
  isCurrentUserAdmin,
  loadAdminDashboard,
  uploadCammesaFile,
} from "../services/adminData";
import type { AdminArchivo, AdminEmpresaRow, AdminProcesamiento, AdminStats, PlanId } from "../types";
import { number, percent } from "../utils/format";

const emptyStats: AdminStats = {
  empresas: 0,
  nemos: 0,
  contratos: 0,
  demanda_total_mwh: 0,
  mater_mwh: 0,
  promedio_renovable: 0,
  clientes_riesgo: 0,
  archivos: 0,
  procesamientos: 0,
};

const initialData = {
  stats: emptyStats,
  empresas: [] as AdminEmpresaRow[],
  archivos: [] as AdminArchivo[],
  procesamientos: [] as AdminProcesamiento[],
};

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type ClientForm = {
  email: string;
  password: string;
  razon_social: string;
  cuit: string;
  tipo_usuario: "GUMA" | "GUME" | "GUDI";
  comercializador: string;
  distribuidor: string;
  plan_activo: PlanId;
  acuerdo_mensual_mwh: string;
  nemos: string;
  numero_contrato: string;
  contrato_tipo: "RPB" | "RPE" | "BAS";
  generador_nemo: string;
  generador_nombre: string;
  precio_usd_mwh: string;
  volumen_mwh_mes: string;
  vigencia_inicio: string;
  vigencia_fin: string;
};

const initialClientForm: ClientForm = {
  email: "",
  password: "",
  razon_social: "",
  cuit: "",
  tipo_usuario: "GUME",
  comercializador: "",
  distribuidor: "",
  plan_activo: "compliance",
  acuerdo_mensual_mwh: "300",
  nemos: "",
  numero_contrato: "",
  contrato_tipo: "RPB",
  generador_nemo: "",
  generador_nombre: "",
  precio_usd_mwh: "",
  volumen_mwh_mes: "",
  vigencia_inicio: "",
  vigencia_fin: "",
};

function AdminAccessDenied() {
  return (
    <Panel className="p-8">
      <div className="flex items-start gap-4">
        <div className="rounded border border-alert/35 bg-alert/10 p-3 text-alert">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="font-fraunces text-2xl font-bold text-ivory">
            Acceso administrador requerido
          </h2>
          <p className="mt-2 text-sm leading-6 text-mist">
            Tu usuario existe, pero no tiene permisos para operar el backoffice.
          </p>
        </div>
      </div>
    </Panel>
  );
}

async function loadAdminPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { isAdmin, dashboard: initialData };
  return { isAdmin, dashboard: await loadAdminDashboard() };
}

function monthLabel(anio: number, mes: number) {
  return `${monthLabels[mes - 1] ?? mes} ${anio}`;
}

export default function Admin() {
  const [reloadKey, setReloadKey] = useState(0);
  const [clientForm, setClientForm] = useState<ClientForm>(initialClientForm);
  const [clientStatus, setClientStatus] = useState("");
  const [fileStatus, setFileStatus] = useState("");
  const [period, setPeriod] = useState({ anio: 2025, mes: 10 });
  const [dteFile, setDteFile] = useState<File | null>(null);
  const [variablesFile, setVariablesFile] = useState<File | null>(null);
  const load = useCallback(() => loadAdminPage(), [reloadKey]);
  const { data, error, loading } = useAsyncData(
    load,
    { isAdmin: false, dashboard: initialData },
  );

  const refresh = () => setReloadKey((current) => current + 1);

  const updateClient = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => {
    setClientForm((current) => ({ ...current, [key]: value }));
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientStatus("Creando usuario y empresa...");
    try {
      const contratos = clientForm.numero_contrato
        ? [
            {
              numero_contrato: clientForm.numero_contrato,
              tipo: clientForm.contrato_tipo,
              generador_nemo: clientForm.generador_nemo,
              generador_nombre: clientForm.generador_nombre,
              precio_usd_mwh: Number(clientForm.precio_usd_mwh),
              volumen_mwh_mes: Number(clientForm.volumen_mwh_mes),
              vigencia_inicio: clientForm.vigencia_inicio,
              vigencia_fin: clientForm.vigencia_fin,
            },
          ]
        : [];
      await createEmpresaCliente({
        email: clientForm.email,
        password: clientForm.password,
        razon_social: clientForm.razon_social,
        cuit: clientForm.cuit || undefined,
        tipo_usuario: clientForm.tipo_usuario,
        comercializador: clientForm.comercializador || undefined,
        distribuidor: clientForm.distribuidor || undefined,
        plan_activo: clientForm.plan_activo,
        acuerdo_mensual_mwh: Number(clientForm.acuerdo_mensual_mwh),
        nemos: clientForm.nemos.split(",").map((nemo) => nemo.trim()).filter(Boolean),
        contratos,
      });
      setClientStatus("Usuario y empresa creados.");
      setClientForm(initialClientForm);
      refresh();
    } catch (caught) {
      setClientStatus(caught instanceof Error ? caught.message : "No se pudo crear el cliente.");
    }
  };

  const submitFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dteFile || !variablesFile) {
      setFileStatus("Cargá los dos archivos antes de crear la corrida.");
      return;
    }
    setFileStatus("Subiendo archivos...");
    try {
      const [dte, variables] = await Promise.all([
        uploadCammesaFile({ file: dteFile, tipo: "DTE", anio: period.anio, mes: period.mes }),
        uploadCammesaFile({ file: variablesFile, tipo: "VARIABLES_RELEVANTES", anio: period.anio, mes: period.mes }),
      ]);
      await createProcesamiento({
        anio: period.anio,
        mes: period.mes,
        dte_archivo_id: dte.id,
        variables_archivo_id: variables.id,
      });
      setFileStatus("Archivos cargados y corrida pendiente creada.");
      setDteFile(null);
      setVariablesFile(null);
      refresh();
    } catch (caught) {
      setFileStatus(caught instanceof Error ? caught.message : "No se pudieron cargar los archivos.");
    }
  };

  if (loading) return <LoadingScreen messages={["Validando permisos admin...", "Cargando backoffice..."]} />;

  if (!data.isAdmin) return <AdminAccessDenied />;

  const { stats, empresas, archivos, procesamientos } = data.dashboard;

  return (
    <div className="space-y-6">
      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-mist">Backoffice</p>
          <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
            Administración EnergyOS
          </h2>
        </div>
        <Button onClick={refresh} variant="outline">
          <RefreshCcw size={16} />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard borderColor="blue" label="Empresas" subtext={`${stats.nemos} Nemos activos`} value={number(stats.empresas)} />
        <StatCard borderColor="green" label="Demanda cartera" subtext={`${number(stats.mater_mwh)} MWh MATER`} value={`${number(stats.demanda_total_mwh)} MWh`} />
        <StatCard borderColor="green" label="Promedio renovable" subtext="Ultimo mes por empresa" value={percent(stats.promedio_renovable)} />
        <StatCard borderColor="yellow" label="Clientes en riesgo" subtext={`${stats.contratos} contratos activos`} value={number(stats.clientes_riesgo)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-navy-border p-5">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">Empresas</h3>
              <p className="mt-1 text-sm text-mist">Cartera administrada</p>
            </div>
            <Users className="text-forest" size={20} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-navy/55 text-xs uppercase text-mist">
                <tr>
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Nemos</th>
                  <th className="px-5 py-3">Ultimo dato</th>
                  <th className="px-5 py-3">Renovable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-border">
                {empresas.map((empresa) => (
                  <tr className="text-mist" key={empresa.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ivory">{empresa.razon_social}</p>
                      <p className="text-xs">{empresa.tipo_usuario} · {empresa.comercializador}</p>
                    </td>
                    <td className="px-5 py-3"><Badge tone="plan">{empresa.plan_activo}</Badge></td>
                    <td className="px-5 py-3">{empresa.nemos.join(", ")}</td>
                    <td className="px-5 py-3">{empresa.ultimo_mes}</td>
                    <td className="number px-5 py-3">{percent(empresa.porcentaje_renovable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">Crear cliente</h3>
              <p className="mt-1 text-sm text-mist">Auth, empresa, Nemos y contrato inicial</p>
            </div>
            <Plus className="text-forest" size={20} />
          </div>
          <form className="grid gap-3" onSubmit={submitClient}>
            <Input label="Email" onChange={(value) => updateClient("email", value)} required type="email" value={clientForm.email} />
            <Input label="Contraseña inicial" onChange={(value) => updateClient("password", value)} required type="password" value={clientForm.password} />
            <Input label="Razón social" onChange={(value) => updateClient("razon_social", value)} required value={clientForm.razon_social} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Tipo" onChange={(value) => updateClient("tipo_usuario", value as ClientForm["tipo_usuario"])} options={["GUMA", "GUME", "GUDI"]} value={clientForm.tipo_usuario} />
              <Select label="Plan" onChange={(value) => updateClient("plan_activo", value as PlanId)} options={["compliance", "gestion", "full", "white-label"]} value={clientForm.plan_activo} />
            </div>
            <Input label="Nemos separados por coma" onChange={(value) => updateClient("nemos", value)} required value={clientForm.nemos} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Comercializador" onChange={(value) => updateClient("comercializador", value)} value={clientForm.comercializador} />
              <Input label="Acuerdo mensual MWh" onChange={(value) => updateClient("acuerdo_mensual_mwh", value)} type="number" value={clientForm.acuerdo_mensual_mwh} />
            </div>
            <div className="mt-2 rounded border border-navy-border bg-navy/45 p-3">
              <p className="mb-3 text-xs font-semibold uppercase text-mist">Contrato opcional</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Número" onChange={(value) => updateClient("numero_contrato", value)} value={clientForm.numero_contrato} />
                <Select label="Tipo" onChange={(value) => updateClient("contrato_tipo", value as ClientForm["contrato_tipo"])} options={["RPB", "RPE", "BAS"]} value={clientForm.contrato_tipo} />
                <Input label="Generador Nemo" onChange={(value) => updateClient("generador_nemo", value)} value={clientForm.generador_nemo} />
                <Input label="Generador" onChange={(value) => updateClient("generador_nombre", value)} value={clientForm.generador_nombre} />
                <Input label="USD/MWh" onChange={(value) => updateClient("precio_usd_mwh", value)} type="number" value={clientForm.precio_usd_mwh} />
                <Input label="MWh/mes" onChange={(value) => updateClient("volumen_mwh_mes", value)} type="number" value={clientForm.volumen_mwh_mes} />
                <Input label="Inicio" onChange={(value) => updateClient("vigencia_inicio", value)} type="date" value={clientForm.vigencia_inicio} />
                <Input label="Fin" onChange={(value) => updateClient("vigencia_fin", value)} type="date" value={clientForm.vigencia_fin} />
              </div>
            </div>
            {clientStatus ? <p className="text-sm text-mist">{clientStatus}</p> : null}
            <Button className="w-full" type="submit">
              <Building2 size={16} />
              Crear cliente
            </Button>
          </form>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">Carga mensual CAMMESA</h3>
              <p className="mt-1 text-sm text-mist">Subí DTE y Variables Relevantes</p>
            </div>
            <Upload className="text-forest" size={20} />
          </div>
          <form className="grid gap-4" onSubmit={submitFiles}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Año" onChange={(value) => setPeriod((current) => ({ ...current, anio: Number(value) }))} type="number" value={String(period.anio)} />
              <Input label="Mes" onChange={(value) => setPeriod((current) => ({ ...current, mes: Number(value) }))} type="number" value={String(period.mes)} />
            </div>
            <FileInput file={dteFile} label="DTE .xlsx" onChange={setDteFile} />
            <FileInput file={variablesFile} label="Variables Relevantes .xlsx/.zip" onChange={setVariablesFile} />
            {fileStatus ? <p className="text-sm text-mist">{fileStatus}</p> : null}
            <Button className="w-full" type="submit">
              <Play size={16} />
              Crear corrida pendiente
            </Button>
          </form>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-navy-border p-5">
            <div>
              <h3 className="font-syne text-base font-bold text-ivory">Procesamientos</h3>
              <p className="mt-1 text-sm text-mist">Historial operativo</p>
            </div>
            <FileSpreadsheet className="text-forest" size={20} />
          </div>
          <div className="divide-y divide-navy-border">
            {procesamientos.map((item) => (
              <div className="flex flex-wrap items-center justify-between gap-3 p-5" key={item.id}>
                <div>
                  <p className="font-medium text-ivory">{monthLabel(item.anio, item.mes)}</p>
                  <p className="text-xs text-mist">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                <Badge tone={item.estado === "completo" ? "success" : item.estado === "error" ? "warning" : "neutral"}>
                  {item.estado}
                </Badge>
              </div>
            ))}
            {procesamientos.length === 0 ? <p className="p-5 text-sm text-mist">Sin corridas registradas.</p> : null}
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-navy-border p-5">
          <h3 className="font-syne text-base font-bold text-ivory">Archivos cargados</h3>
        </div>
        <div className="divide-y divide-navy-border">
          {archivos.map((archivo) => (
            <div className="flex flex-wrap items-center justify-between gap-3 p-5" key={archivo.id}>
              <div>
                <p className="font-medium text-ivory">{archivo.file_name}</p>
                <p className="text-xs text-mist">{archivo.tipo} · {monthLabel(archivo.anio, archivo.mes)}</p>
              </div>
              <p className="text-xs text-mist">{new Date(archivo.created_at).toLocaleString()}</p>
            </div>
          ))}
          {archivos.length === 0 ? <p className="p-5 text-sm text-mist">Sin archivos cargados.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-mist">{label}</span>
      <input
        className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-mist">{label}</span>
      <select
        className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FileInput({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block rounded border border-dashed border-navy-border bg-navy/45 p-4">
      <span className="text-sm font-medium text-ivory">{label}</span>
      <input
        className="mt-2 block w-full text-sm text-mist"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        type="file"
      />
      {file ? <span className="mt-2 block text-xs text-mist">{file.name}</span> : null}
    </label>
  );
}
