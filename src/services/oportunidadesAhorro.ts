import { supabase } from "../lib/supabase";
import type { OportunidadesAhorroResponse } from "../types/oportunidadesAhorro";

export type FetchOportunidadesAhorroOptions = {
  nemo?: string;
  meses?: number;
};

export async function fetchOportunidadesAhorro(
  opts: FetchOportunidadesAhorroOptions = {},
): Promise<OportunidadesAhorroResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<OportunidadesAhorroResponse>(
    `gu-oportunidades-ahorro${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-oportunidades-ahorro no devolvio datos.");
  return data;
}
