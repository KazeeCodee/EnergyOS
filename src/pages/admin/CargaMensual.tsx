import { AlertTriangle, Download, RefreshCcw, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingScreen } from "../../components/ui/LoadingScreen";
import { Panel } from "../../components/ui/Panel";
import { useAdminContext } from "../../context/AdminContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  downloadCammesaDte,
  loadAdminCargaMensual,
  triggerProcesamiento,
} from "../../services/adminData";
import type { AdminArchivo, AdminProcesamiento } from "../../types";

const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const initialData = {
  archivos: [] as AdminArchivo[],
  procesamientos: [] as AdminProcesamiento[],
};

type DownloadState = "idle" | "downloading" | "processing" | "success" | "error";

function monthLabel(anio: number, mes: number) {
  return `${monthLabels[mes - 1] ?? mes} ${anio}`;
}

function processingTone(estado: "pendiente" | "procesando" | "completo" | "error" | "sin_datos") {
  if (estado === "completo") return "success";
  if (estado === "error") return "danger";
  if (estado === "pendiente") return "warning";
  return "neutral";
}

function downloadTone(status: DownloadState) {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "downloading" || status === "processing") return "warning";
  return "neutral";
}

function empresasProcesadas(item: AdminProcesamiento) {
  return item.empresas.filter((empresa) => empresa.estado === "completo").length;
}

function formatUploader(value: string | null | undefined) {
  if (!value) return "Sistema";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default function CargaMensual() {
  const { filters, setPeriodo } = useAdminContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [processingActionId, setProcessingActionId] = useState("");
  const [processingMessage, setProcessingMessage] = useState("");

  const load = useCallback(() => loadAdminCargaMensual(), [reloadKey]);
  const { data, error, loading } = useAsyncData(load, initialData);

  const refresh = () => setReloadKey((current) => current + 1);

  const handleDownload = async () => {
    setDownloadState("downloading");
    setDownloadMessage("Descargando ZIP desde CAMMESA...");

    try {
      const result = await downloadCammesaDte({ anio: filters.anio, mes: filters.mes });
      setDownloadState("processing");
      setDownloadMessage(result.message ?? "Corrida creada. Actualizando estado...");
      refresh();
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setDownloadState("success");
      setDownloadMessage(result.message ?? "Descarga completada.");
    } catch (caught) {
      setDownloadState("error");
      setDownloadMessage(
        caught instanceof Error ? caught.message : "No se pudo descargar el ZIP desde CAMMESA.",
      );
    }
  };

  const retryProcessing = async (item: AdminProcesamiento) => {
    setProcessingActionId(item.id);
    setProcessingMessage(`Reintentando corrida ${monthLabel(item.anio, item.mes)}...`);
    try {
      const result = await triggerProcesamiento(item.id);
      setProcessingMessage(result.message);
      refresh();
    } catch (caught) {
      setProcessingMessage(
        caught instanceof Error ? caught.message : "No se pudo reintentar la corrida.",
      );
    } finally {
      setProcessingActionId("");
    }
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <LoadingScreen messages={["Cargando operacion mensual...", "Leyendo corridas y archivos recientes..."]} />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-mist">Admin</p>
          <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">Carga mensual</h2>
        </div>
        <Button onClick={refresh} type="button" variant="outline">
          <RefreshCcw size={16} />
          Actualizar
        </Button>
      </div>

      {error ? (
        <section className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </section>
      ) : null}

      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-syne text-base font-bold text-ivory">Descarga mensual</h3>
            <p className="mt-1 text-sm text-mist">
              Descarga automatica del ZIP DTE para el periodo operativo seleccionado.
            </p>
          </div>
          <Badge tone={downloadTone(downloadState)}>
            {downloadState === "idle" ? "Listo para descargar" : downloadState}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[140px_140px_1fr] sm:items-end">
          <label>
            <span className="text-xs font-medium text-mist">Año</span>
            <select
              className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
              onChange={(event) => setPeriodo({ anio: Number(event.target.value), mes: filters.mes })}
              value={filters.anio}
            >
              {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 1 - index).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-xs font-medium text-mist">Mes</span>
            <select
              className="mt-1 w-full rounded border border-navy-border bg-navy px-3 py-2 text-sm text-ivory outline-none transition focus:border-forest"
              onChange={(event) => setPeriodo({ anio: filters.anio, mes: Number(event.target.value) })}
              value={filters.mes}
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:justify-self-start">
            <Button
              disabled={downloadState === "downloading" || downloadState === "processing"}
              onClick={handleDownload}
              type="button"
            >
              <Download size={16} />
              Descargar de CAMMESA
            </Button>
          </div>
        </div>

        {downloadMessage ? (
          <div className="mt-4 rounded border border-navy-border bg-navy/45 px-4 py-3 text-sm text-mist">
            {downloadMessage}
          </div>
        ) : null}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-navy-border p-5">
          <h3 className="font-syne text-base font-bold text-ivory">Corridas recientes</h3>
          <p className="mt-1 text-sm text-mist">Ultimas 20 ejecuciones registradas en procesamientos.</p>
        </div>

        {processingMessage ? (
          <div className="border-b border-navy-border bg-navy/45 px-5 py-3 text-sm text-mist">
            {processingMessage}
          </div>
        ) : null}

        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-navy/55 text-xs uppercase text-mist">
              <tr>
                <th className="px-5 py-3">Año</th>
                <th className="px-5 py-3">Mes</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Empresas procesadas</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Error</th>
                <th className="px-5 py-3 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-border">
              {data.procesamientos.map((item) => (
                <tr className="text-mist" key={item.id}>
                  <td className="px-5 py-4">{item.anio}</td>
                  <td className="px-5 py-4">{selectedMonthLabel(item.mes)}</td>
                  <td className="px-5 py-4">
                    <Badge tone={processingTone(item.estado)}>{item.estado}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    {empresasProcesadas(item)}
                    {item.empresas.length ? ` / ${item.empresas.length}` : ""}
                  </td>
                  <td className="px-5 py-4">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-5 py-4">
                    {item.error_message ? (
                      <span className="inline-flex items-center gap-2 text-danger">
                        <AlertTriangle size={14} />
                        {item.error_message}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {item.estado === "error" ? (
                      <Button
                        disabled={processingActionId === item.id}
                        onClick={() => retryProcessing(item)}
                        type="button"
                        variant="outline"
                      >
                        <RotateCcw size={16} />
                        Reintentar
                      </Button>
                    ) : (
                      <span className="text-xs text-mist">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.procesamientos.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-mist" colSpan={7}>
                    No hay corridas registradas todavia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-navy-border p-5">
          <h3 className="font-syne text-base font-bold text-ivory">Archivos subidos</h3>
          <p className="mt-1 text-sm text-mist">Ultimos 10 registros en cammesa_archivos.</p>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-navy/55 text-xs uppercase text-mist">
              <tr>
                <th className="px-5 py-3">Archivo</th>
                <th className="px-5 py-3">Año</th>
                <th className="px-5 py-3">Mes</th>
                <th className="px-5 py-3">Subido por</th>
                <th className="px-5 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-border">
              {data.archivos.map((archivo) => (
                <tr className="text-mist" key={archivo.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-ivory">{archivo.file_name}</p>
                    <p className="mt-1 text-xs">{archivo.tipo}</p>
                  </td>
                  <td className="px-5 py-4">{archivo.anio}</td>
                  <td className="px-5 py-4">{selectedMonthLabel(archivo.mes)}</td>
                  <td className="px-5 py-4">{formatUploader(archivo.uploaded_by)}</td>
                  <td className="px-5 py-4">{new Date(archivo.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {data.archivos.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-mist" colSpan={5}>
                    No hay archivos registrados todavia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function selectedMonthLabel(mes: number) {
  return monthLabels[mes - 1] ?? String(mes);
}
