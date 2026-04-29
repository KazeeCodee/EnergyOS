import { supabase } from "../lib/supabase";
import type { FactorCargaResponse } from "../types/factorCarga";

export type FetchFactorCargaOptions = {
  nemo?: string;
  meses?: number;
};

export async function fetchFactorCargaMensual(
  opts: FetchFactorCargaOptions = {},
): Promise<FactorCargaResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<FactorCargaResponse>(
    `gu-factor-carga${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-factor-carga no devolvió datos.");
  return data;
}

export async function fetchFactorCargaResumen(opts: FetchFactorCargaOptions = {}) {
  const response = await fetchFactorCargaMensual(opts);
  return response.resumen;
}
