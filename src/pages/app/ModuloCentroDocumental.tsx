import {
  CalendarClock,
  Download,
  FileArchive,
  FileText,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { AlertaBanner } from "../../components/app/AlertaBanner";
import { DataFooter } from "../../components/app/DataFooter";
import { EmptyState } from "../../components/app/EmptyState";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { StatCard } from "../../components/app/StatCard";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ModuleSkeleton } from "../../components/ui/Skeleton";
import { useAppContext } from "../../context/AppContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  createContratoEnergetico,
  createDocumentoEnergetico,
  fetchCentroDocumental,
  getDocumentoEnergeticoSignedUrl,
  uploadDocumentoEnergetico,
} from "../../services/centroDocumental";
import type {
  CentroDocumentalResponse,
  ContratoEnergetico,
  DocumentoEnergetico,
  TipoDocumentoEnergetico,
} from "../../types/centroDocumental";

const EMPTY: CentroDocumentalResponse = {
  nemo: "",
  autorizados: [],
  resumen: {
    documentos: 0,
    contratos: 0,
    contratosVigentes: 0,
    contratosVencen90Dias: 0,
    contratosIncompletos: 0,
    valorDesbloqueado: {
      auditoriaFacturaMater: false,
      forecastContractual: false,
      compliancePreciso: false,
    },
  },
  documentos: [],
  contratos: [],
  notas: { alcance: "" },
};

const TIPOS_DOCUMENTO: Array<{ value: TipoDocumentoEnergetico; label: string }> = [
  { value: "contrato_mater", label: "Contrato MATER" },
  { value: "contrato_proveedor", label: "Contrato proveedor" },
  { value: "anexo_comercial", label: "Anexo comercial" },
  { value: "factura_proveedor", label: "Factura proveedor" },
  { value: "factura_distribuidor", label: "Factura distribuidor" },
  { value: "certificado_renovable", label: "Certificado renovable" },
  { value: "comunicacion_cammesa", label: "Comunicacion CAMMESA" },
  { value: "cotizacion", label: "Cotizacion" },
  { value: "otro", label: "Otro" },
];

function fmtBytes(bytes: number | null | undefined) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function fmtMoney(value: number | null, currency: string | null) {
  if (value == null) return "-";
  return `${currency ?? ""} ${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}/MWh`;
}

function tipoLabel(value: string) {
  return TIPOS_DOCUMENTO.find((tipo) => tipo.value === value)?.label ?? value;
}

function expiraTone(fecha: string | null): "success" | "warning" | "danger" | "neutral" {
  if (!fecha) return "neutral";
  const today = new Date();
  const end = new Date(`${fecha}T00:00:00`);
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "danger";
  if (days <= 90) return "warning";
  return "success";
}

function Input({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#15caca] focus:ring-2 focus:ring-[#15caca]/15";

function DocumentoRow({ doc, onDownload }: { doc: DocumentoEnergetico; onDownload: (doc: DocumentoEnergetico) => void }) {
  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-700">{doc.titulo}</div>
        <div className="text-xs text-slate-400">{doc.fileName} · {fmtBytes(doc.fileSizeBytes)}</div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{tipoLabel(doc.tipoDocumento)}</td>
      <td className="px-4 py-3 text-sm text-slate-500">{doc.proveedorNombre ?? "-"}</td>
      <td className="px-4 py-3">
        <Badge tone={expiraTone(doc.fechaVencimiento)}>{doc.fechaVencimiento ?? "Sin venc."}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[#15caca] hover:text-[#163759]"
          onClick={() => onDownload(doc)}
          type="button"
        >
          <Download size={14} />
          Abrir
        </button>
      </td>
    </tr>
  );
}

function ContratoCard({ contrato }: { contrato: ContratoEnergetico }) {
  const completo = Boolean(contrato.precioEnergia && contrato.moneda && contrato.fechaFin && (contrato.volumenMwhMes || contrato.porcentajeCobertura));

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={contrato.estado === "vigente" ? "success" : "neutral"}>{contrato.estado}</Badge>
            <Badge tone={completo ? "success" : "warning"}>{completo ? "Ficha completa" : "Faltan datos"}</Badge>
          </div>
          <h3 className="font-bold text-[#163759]">{contrato.proveedorNombre}</h3>
          <p className="mt-1 text-sm text-slate-500">{contrato.tipoContrato} · {contrato.fechaInicio ?? "sin inicio"} a {contrato.fechaFin ?? "sin fin"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Precio</p>
          <p className="font-mono text-sm font-bold text-[#163759]">{fmtMoney(contrato.precioEnergia, contrato.moneda)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <div><span className="font-semibold text-slate-700">Volumen:</span> {contrato.volumenMwhMes ?? "-"} MWh/mes</div>
        <div><span className="font-semibold text-slate-700">Cobertura:</span> {contrato.porcentajeCobertura != null ? `${(contrato.porcentajeCobertura * 100).toFixed(1)}%` : "-"}</div>
        <div><span className="font-semibold text-slate-700">Take-or-pay:</span> {contrato.takeOrPay == null ? "-" : contrato.takeOrPay ? "Si" : "No"}</div>
        <div><span className="font-semibold text-slate-700">Ajuste:</span> {contrato.ajusteDescripcion ? "Definido" : "-"}</div>
      </div>
    </article>
  );
}

export default function ModuloCentroDocumental() {
  const { agente, profile, ultimoMesDisponible } = useAppContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoEnergetico>("contrato_mater");
  const [titulo, setTitulo] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [notas, setNotas] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [crearFicha, setCrearFicha] = useState(true);
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState<"USD" | "ARS" | "EUR">("USD");
  const [volumen, setVolumen] = useState("");
  const [cobertura, setCobertura] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [takeOrPay, setTakeOrPay] = useState(false);
  const [ajuste, setAjuste] = useState("");

  const loader = useCallback(() => fetchCentroDocumental(agente?.nemo), [agente?.nemo, reloadKey]);
  const { data, loading, error } = useAsyncData<CentroDocumentalResponse>(loader, EMPTY);

  const userId = profile?.userId ?? "";
  const valueUnlocked = useMemo(() => Object.values(data.resumen.valorDesbloqueado).filter(Boolean).length, [data.resumen.valorDesbloqueado]);

  const resetForm = () => {
    setTitulo("");
    setProveedor("");
    setFechaVencimiento("");
    setNotas("");
    setFile(null);
    setPrecio("");
    setVolumen("");
    setCobertura("");
    setFechaInicio("");
    setTakeOrPay(false);
    setAjuste("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    setMessage("");
    if (!agente?.nemo || !userId) {
      setLocalError("No hay agente o usuario activo.");
      return;
    }
    if (!file) {
      setLocalError("Selecciona un archivo para subir.");
      return;
    }
    if (!titulo.trim()) {
      setLocalError("Ingresa un titulo para el documento.");
      return;
    }

    setSaving(true);
    try {
      const storagePath = await uploadDocumentoEnergetico(agente.nemo, userId, file);
      const documento = await createDocumentoEnergetico({
        nemo: agente.nemo,
        tipoDocumento,
        titulo,
        proveedorNombre: proveedor || undefined,
        fechaVencimiento: fechaVencimiento || undefined,
        confidencial: true,
        storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        notas,
      });

      if (crearFicha && proveedor.trim()) {
        await createContratoEnergetico({
          nemo: agente.nemo,
          documentoId: documento.id,
          tipoContrato: tipoDocumento === "contrato_mater" ? "mater" : "otro",
          proveedorNombre: proveedor,
          fechaInicio: fechaInicio || undefined,
          fechaFin: fechaVencimiento || undefined,
          precioEnergia: precio ? Number(precio) : null,
          moneda,
          volumenMwhMes: volumen ? Number(volumen) : null,
          porcentajeCobertura: cobertura ? Number(cobertura) / 100 : null,
          takeOrPay,
          ajusteDescripcion: ajuste,
          estado: "vigente",
          notas,
        });
      }

      setMessage("Documento cargado y registrado correctamente.");
      resetForm();
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "No se pudo cargar el documento.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (doc: DocumentoEnergetico) => {
    if (!agente?.nemo) return;
    setLocalError("");
    try {
      const url = await getDocumentoEnergeticoSignedUrl(agente.nemo, doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "No se pudo abrir el documento.");
    }
  };

  if (loading) return <ModuleSkeleton />;

  return (
    <div>
      <ModuleHeader
        title="Centro Documental Energetico"
        subtitle="Contratos, facturas y documentos privados para activar analisis contractuales"
        tooltip="Los documentos se guardan en un bucket privado. La ficha contractual permite mejorar compliance, forecast y futuras auditorias de factura MATER."
      />

      {(error || localError) && <AlertaBanner type="warning" message={error || localError} />}
      {message && <div className="mb-5"><AlertaBanner type="success" message={message} /></div>}
      {data.notas.alcance && <div className="mb-5"><AlertaBanner type="info" message={data.notas.alcance} /></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Documentos" value={data.resumen.documentos.toLocaleString("es-AR")} sub="Biblioteca privada" />
        <StatCard label="Contratos" value={data.resumen.contratosVigentes.toLocaleString("es-AR")} sub={`${data.resumen.contratos} fichas totales`} />
        <StatCard label="Vencen 90 dias" value={data.resumen.contratosVencen90Dias.toLocaleString("es-AR")} sub="Alertas contractuales" tone={data.resumen.contratosVencen90Dias > 0 ? "amber" : "emerald"} />
        <StatCard label="Analisis activos" value={`${valueUnlocked}/3`} sub="Factura, forecast, compliance" tone={valueUnlocked >= 2 ? "emerald" : "amber"} />
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#15caca]/10 text-[#0e8a8a]">
            <UploadCloud size={20} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#163759]">Cargar documento energetico</h2>
            <p className="text-xs text-slate-500">Subi el documento y, si aplica, completa la ficha contractual que desbloquea analisis.</p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input label="Tipo">
              <select className={inputClass} value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumentoEnergetico)}>
                {TIPOS_DOCUMENTO.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
              </select>
            </Input>
            <Input label="Titulo">
              <input className={inputClass} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Contrato renovable 2026" />
            </Input>
            <Input label="Proveedor">
              <input className={inputClass} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Generador / comercializador" />
            </Input>
            <Input label="Vencimiento">
              <input className={inputClass} type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
            </Input>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <Input label="Archivo">
              <input className={`${inputClass} pt-2`} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Input>
            <Input label="Notas">
              <input className={inputClass} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Condiciones especiales, referencia interna, observaciones" />
            </Input>
          </div>

          <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
            <input checked={crearFicha} onChange={(e) => setCrearFicha(e.target.checked)} type="checkbox" />
            Crear ficha contractual con este documento
          </label>

          {crearFicha && (
            <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 md:grid-cols-2 lg:grid-cols-6">
              <Input label="Inicio">
                <input className={inputClass} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </Input>
              <Input label="Precio">
                <input className={inputClass} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="65" />
              </Input>
              <Input label="Moneda">
                <select className={inputClass} value={moneda} onChange={(e) => setMoneda(e.target.value as "USD" | "ARS" | "EUR")}>
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                  <option value="EUR">EUR</option>
                </select>
              </Input>
              <Input label="MWh/mes">
                <input className={inputClass} inputMode="decimal" value={volumen} onChange={(e) => setVolumen(e.target.value)} placeholder="1200" />
              </Input>
              <Input label="% cobertura">
                <input className={inputClass} inputMode="decimal" value={cobertura} onChange={(e) => setCobertura(e.target.value)} placeholder="20" />
              </Input>
              <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-600">
                <input checked={takeOrPay} onChange={(e) => setTakeOrPay(e.target.checked)} type="checkbox" />
                Take-or-pay
              </label>
              <div className="md:col-span-2 lg:col-span-6">
                <Input label="Ajuste / indexacion">
                  <input className={inputClass} value={ajuste} onChange={(e) => setAjuste(e.target.value)} placeholder="Ej. ajuste anual, dolar linked, IPC, condicion especial" />
                </Input>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={saving} type="submit">
              <Plus size={15} />
              {saving ? "Cargando..." : "Guardar documento"}
            </Button>
          </div>
        </form>
      </section>

      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[#163759]"><FileArchive size={18} /></span>
            <div>
              <h3 className="text-sm font-bold text-[#163759]">Biblioteca documental</h3>
              <p className="text-xs text-slate-500">Documentos privados del agente seleccionado.</p>
            </div>
          </div>
          {data.documentos.length === 0 ? (
            <EmptyState icon={<FileText size={26} className="text-slate-400" />} title="Sin documentos cargados" description="Carga un contrato, factura o anexo para empezar a desbloquear analisis contractuales." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-bold">Documento</th>
                    <th className="px-4 py-3 font-bold">Tipo</th>
                    <th className="px-4 py-3 font-bold">Proveedor</th>
                    <th className="px-4 py-3 font-bold">Vencimiento</th>
                    <th className="px-4 py-3 font-bold text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documentos.map((doc) => <DocumentoRow doc={doc} key={doc.id} onDownload={download} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <LockKeyhole size={18} className="text-[#0e8a8a]" />
              <h3 className="text-sm font-bold text-[#163759]">Valor desbloqueado</h3>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Auditoria factura MATER", data.resumen.valorDesbloqueado.auditoriaFacturaMater],
                ["Forecast contractual", data.resumen.valorDesbloqueado.forecastContractual],
                ["Compliance mas preciso", data.resumen.valorDesbloqueado.compliancePreciso],
              ].map(([label, active]) => (
                <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2" key={String(label)}>
                  <span className="text-slate-600">{label}</span>
                  <Badge tone={active ? "success" : "warning"}>{active ? "Activo" : "Faltan datos"}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={18} className="text-[#0e8a8a]" />
              <h3 className="text-sm font-bold text-[#163759]">Fichas contractuales</h3>
            </div>
            <div className="space-y-3">
              {data.contratos.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">Todavia no hay contratos estructurados.</p>
              ) : data.contratos.map((contrato) => <ContratoCard contrato={contrato} key={contrato.id} />)}
            </div>
          </div>
        </section>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <p>Los documentos son privados por agente. Las descargas usan enlaces firmados temporales y quedan registradas como evento.</p>
      </div>

      <DataFooter ultimoMesDisponible={ultimoMesDisponible} />
    </div>
  );
}
