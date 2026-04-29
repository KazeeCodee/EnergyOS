import { supabase } from "../lib/supabase";
import type { MercadoContextoResponse, MercadoFuente, MercadoSeccion } from "../types/mercadoContexto";

export type FetchMercadoContextoOptions = {
  fuente?: MercadoFuente;
  secciones?: MercadoSeccion[];
  dias?: number;
  meses?: number;
};

export async function fetchMercadoContexto(
  opts: FetchMercadoContextoOptions = {},
): Promise<MercadoContextoResponse> {
  const params = new URLSearchParams();
  if (opts.fuente) params.set("fuente", opts.fuente);
  if (opts.secciones?.length) params.set("secciones", opts.secciones.join(","));
  if (opts.dias) params.set("dias", String(opts.dias));
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<MercadoContextoResponse>(
    `gu-mercado-contexto${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-mercado-contexto no devolvió datos.");
  return data;
}
