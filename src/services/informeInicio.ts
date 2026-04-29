import { supabase } from "../lib/supabase";
import type { InformeInicioResponse } from "../types/informeInicio";

export type FetchInformeInicioOptions = {
  nemo?: string;
  mes?: string; // YYYY-MM
};

export async function fetchInformeInicio(
  opts: FetchInformeInicioOptions = {},
): Promise<InformeInicioResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.mes) params.set("mes", opts.mes);

  const { data, error } = await supabase.functions.invoke<InformeInicioResponse>(
    `gu-informe-inicio${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-informe-inicio no devolvió datos.");
  return data;
}
