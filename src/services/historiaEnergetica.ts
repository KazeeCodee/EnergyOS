import { supabase } from "../lib/supabase";
import type { HistoriaEnergeticaResponse } from "../types/historiaEnergetica";

export type FetchHistoriaEnergeticaOptions = {
  nemo?: string;
  meses?: number;
};

export async function fetchHistoriaEnergetica(
  opts: FetchHistoriaEnergeticaOptions = {},
): Promise<HistoriaEnergeticaResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<HistoriaEnergeticaResponse>(
    `gu-historia-energetica${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-historia-energetica no devolvió datos.");
  return data;
}

export async function fetchHistoriaEnergeticaResumen(opts: FetchHistoriaEnergeticaOptions = {}) {
  const response = await fetchHistoriaEnergetica(opts);
  return response.resumen;
}
