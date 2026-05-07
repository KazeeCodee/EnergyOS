import { supabase } from "../lib/supabase";
import type {
  CentroDocumentalResponse,
  ContratoEnergetico,
  CreateContratoInput,
  CreateDocumentoInput,
  DocumentoEnergetico,
} from "../types/centroDocumental";

const BUCKET = "energy-documents";

export async function fetchCentroDocumental(nemo?: string): Promise<CentroDocumentalResponse> {
  const params = new URLSearchParams();
  if (nemo) params.set("nemo", nemo);

  const { data, error } = await supabase.functions.invoke<CentroDocumentalResponse>(
    `gu-centro-documental${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-centro-documental no devolvio datos.");
  return data;
}

export async function uploadDocumentoEnergetico(
  nemo: string,
  userId: string,
  file: File,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140);
  const id = crypto.randomUUID();
  const path = `${nemo}/${userId}/${id}/${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export async function createDocumentoEnergetico(input: CreateDocumentoInput): Promise<DocumentoEnergetico> {
  const { data, error } = await supabase.functions.invoke<{ documento: DocumentoEnergetico }>(
    "gu-centro-documental?action=documento",
    { method: "POST", body: input },
  );

  if (error) throw error;
  if (!data?.documento) throw new Error("No se pudo crear el documento.");
  return data.documento;
}

export async function createContratoEnergetico(input: CreateContratoInput): Promise<ContratoEnergetico> {
  const { data, error } = await supabase.functions.invoke<{ contrato: ContratoEnergetico }>(
    "gu-centro-documental?action=contrato",
    { method: "POST", body: input },
  );

  if (error) throw error;
  if (!data?.contrato) throw new Error("No se pudo crear el contrato.");
  return data.contrato;
}

export async function getDocumentoEnergeticoSignedUrl(nemo: string, documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ signedUrl: string }>(
    "gu-centro-documental?action=signed-url",
    { method: "POST", body: { nemo, documentoId } },
  );

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No se pudo generar el enlace de descarga.");
  return data.signedUrl;
}
