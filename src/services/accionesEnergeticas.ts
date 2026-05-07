import { supabase } from "../lib/supabase";
import type { AccionEnergetica, AccionEstado, AccionesEnergeticasResponse } from "../types/accionesEnergeticas";

export type FetchAccionesEnergeticasOptions = {
  nemo?: string;
  meses?: number;
  estado?: "abiertas" | "todas" | AccionEstado;
};

export async function fetchAccionesEnergeticas(
  opts: FetchAccionesEnergeticasOptions = {},
): Promise<AccionesEnergeticasResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));
  if (opts.estado) params.set("estado", opts.estado);

  const { data, error } = await supabase.functions.invoke<AccionesEnergeticasResponse>(
    `gu-acciones-energeticas${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-acciones-energeticas no devolvio datos.");
  return data;
}

export async function updateAccionEnergetica(
  id: number,
  estado: AccionEstado,
  comentario?: string,
): Promise<AccionEnergetica> {
  const { data, error } = await supabase.functions.invoke<{ accion: AccionEnergetica }>(
    "gu-acciones-energeticas",
    {
      method: "PATCH",
      body: { id, estado, comentario },
    },
  );

  if (error) throw error;
  if (!data?.accion) throw new Error("No se pudo actualizar la accion.");
  return data.accion;
}
