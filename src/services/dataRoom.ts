import { supabase } from "../lib/supabase";
import type {
  DataRoomResponse,
  AiContextResponse,
  MaterContractDraft,
  MaterContractSaveInput,
  SaveMaterContractResponse,
  SavedMaterContract,
} from "../types/dataRoom";

export type FetchDataRoomOptions = {
  nemo?: string;
};

export async function fetchDataRoom(opts: FetchDataRoomOptions = {}): Promise<DataRoomResponse> {
  const params = new URLSearchParams();
  if (opts.nemo) params.set("nemo", opts.nemo);

  const { data, error } = await supabase.functions.invoke<DataRoomResponse>(
    `client-data-room${params.size > 0 ? `?${params.toString()}` : ""}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("client-data-room no devolvió datos.");
  return data;
}

export async function fetchAiContext(opts: FetchDataRoomOptions = {}): Promise<AiContextResponse> {
  const params = new URLSearchParams();
  params.set("mode", "ai-context");
  if (opts.nemo) params.set("nemo", opts.nemo);

  const { data, error } = await supabase.functions.invoke<AiContextResponse>(
    `client-data-room?${params.toString()}`,
    { method: "GET" },
  );

  if (error) throw error;
  if (!data) throw new Error("client-data-room ai-context no devolvio datos.");
  return data;
}

export async function saveMaterContract(
  contract: MaterContractDraft | MaterContractSaveInput | SavedMaterContract,
): Promise<SavedMaterContract> {
  const params = new URLSearchParams();
  if (contract.buyerNemo) params.set("nemo", contract.buyerNemo);

  const { data, error } = await supabase.functions.invoke<SaveMaterContractResponse>(
    `client-data-room${params.size > 0 ? `?${params.toString()}` : ""}`,
    {
      method: "POST",
      body: { contract },
    },
  );

  if (error) throw error;
  if (!data?.contract) throw new Error("client-data-room no devolvió el contrato guardado.");
  return data.contract;
}
