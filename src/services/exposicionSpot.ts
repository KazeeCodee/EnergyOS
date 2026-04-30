import { supabase } from "../lib/supabase";
import type { ExposicionSpotResponse } from "../types/exposicionSpot";

export type FetchExposicionOptions = {
  nemo?: string;
  meses?: number;
  /** Mes ancla "hasta" (YYYY-MM). Si se omite, usa el último disponible. */
  hasta?: string | null;
};

export async function fetchExposicionSpotMensual(
  opts: FetchExposicionOptions = {},
): Promise<ExposicionSpotResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));
  if (opts.hasta) params.set("hasta", opts.hasta);

  const { data, error } = await supabase.functions.invoke<ExposicionSpotResponse>(
    `gu-exposicion${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-exposicion no devolvió datos.");
  return data;
}

export async function fetchExposicionSpotResumen(opts: FetchExposicionOptions = {}) {
  const response = await fetchExposicionSpotMensual(opts);
  return response.resumen;
}
