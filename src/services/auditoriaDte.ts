import { supabase } from "../lib/supabase";
import type { AuditoriaDteResponse } from "../types/auditoriaDte";

export type FetchAuditoriaDteOptions = {
  nemo?: string;
  meses?: number;
};

export async function fetchAuditoriaDte(
  opts: FetchAuditoriaDteOptions = {},
): Promise<AuditoriaDteResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);
  if (opts.meses) params.set("meses", String(opts.meses));

  const { data, error } = await supabase.functions.invoke<AuditoriaDteResponse>(
    `gu-auditoria-dte${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("gu-auditoria-dte no devolvio datos.");
  return data;
}
