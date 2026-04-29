import { supabase } from "../lib/supabase";
import type { Compliance27191Response } from "../types/compliance27191";

export type FetchCompliance27191Options = {
  nemo?: string;
  meses?: number;
};

export async function fetchCompliance27191(
  opts: FetchCompliance27191Options = {},
): Promise<Compliance27191Response> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<Compliance27191Response>(
    `gu-compliance-27191${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-compliance-27191 no devolvió datos.");
  return data;
}

export async function fetchCompliance27191Resumen(opts: FetchCompliance27191Options = {}) {
  const response = await fetchCompliance27191(opts);
  return response.resumen;
}
