import type {
  AgentActionPlanOutput,
  AgentAnalysisOutput,
  AgentAskOutput,
  AgentBaseRequest,
  AgentApproveTaskInput,
  AgentApproveTaskOutput,
  AgentConversation,
  AgentConversationCreateInput,
  AgentConversationMessagesOutput,
  AgentConversationScopeInput,
  AgentConversationUpdateInput,
  AgentMemoryItem,
  AgentQuestionRequest,
  AgentReconcileInvoiceOutput,
  AgentReportOutput,
} from "../types/energyosAgent";

type AgentEndpoint =
  | "/agent/analyze-period"
  | "/agent/ask"
  | "/agent/generate-report"
  | "/agent/generate-action-plan"
  | "/agent/reconcile-invoice"
  | "/advisor/chat"
  | "/advisor/conversations"
  | `/advisor/conversations/${string}`
  | `/advisor/conversations/${string}/messages`
  | "/advisor/memory"
  | `/advisor/memory/${string}`
  | "/advisor/tasks/approve";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type QueryParams = Record<string, string | number | boolean | null | undefined>;

type AgentImportMeta = ImportMeta & {
  env?: {
    VITE_ENERGYOS_AGENT_URL?: string;
  };
};

export class EnergyosAgentError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "EnergyosAgentError";
    this.code = code;
    this.status = status;
  }
}

export function getEnergyosAgentBaseUrl(): string {
  const value = (import.meta as AgentImportMeta).env?.VITE_ENERGYOS_AGENT_URL?.trim();
  return value ?? "";
}

export function hasEnergyosAgentConfig(baseUrl = getEnergyosAgentBaseUrl()): boolean {
  return baseUrl.trim().length > 0;
}

export function buildAgentEndpoint(baseUrl: string, endpoint: AgentEndpoint): string {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  return `${cleanBaseUrl}/${cleanEndpoint}`;
}

export function buildAgentUrl(baseUrl: string, endpoint: AgentEndpoint, query?: QueryParams): string {
  const url = buildAgentEndpoint(baseUrl, endpoint);
  if (!query) return url;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

export function buildAgentHeaders(accessToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getAgentHttpErrorMessage(status: number, payload?: unknown): string {
  const code = readPayloadCode(payload);

  if (code === "ai_provider_not_configured" || code === "provider_not_configured") {
    return "EnergyOS Advisor no tiene un proveedor IA configurado. La lectura local sigue disponible.";
  }

  if (status === 401) {
    return "Sesion expirada o token no valido. Volve a iniciar sesion para usar EnergyOS Advisor.";
  }

  if (status === 403) {
    return "No tenes permisos para consultar este Data Room con el agente.";
  }

  if (status === 404) {
    return "La API de EnergyOS Advisor no encontro este endpoint. Revisa la version desplegada del agente.";
  }

  if (status === 500) {
    return "La API de EnergyOS Advisor devolvio un error interno. Proba nuevamente en unos minutos.";
  }

  if (status === 502 || status === 503 || status === 504) {
    return "EnergyOS Advisor no esta disponible en este momento. La lectura local sigue disponible.";
  }

  return `EnergyOS Advisor devolvio un error HTTP ${status}.`;
}

function readPayloadCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const code = record.code ?? record.errorCode;
  return typeof code === "string" ? code : null;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: "non_json_response" };
  }
}

async function getSupabaseAccessToken(): Promise<string> {
  const { supabase } = await import("../lib/supabase");
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new EnergyosAgentError(
      "No se pudo obtener la sesion de Supabase para llamar a EnergyOS Advisor.",
      "token_unavailable",
    );
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new EnergyosAgentError(
      "Token de Supabase no disponible. Inicia sesion nuevamente para usar EnergyOS Advisor.",
      "token_unavailable",
    );
  }

  return token;
}

function withPrivateContext<T extends AgentBaseRequest>(input: T): T & { includePrivateContext: boolean } {
  return {
    ...input,
    includePrivateContext: input.includePrivateContext ?? true,
  };
}

async function requestAgentJson<T>(
  method: HttpMethod,
  endpoint: AgentEndpoint,
  payload?: unknown,
  query?: QueryParams,
): Promise<T> {
  const baseUrl = getEnergyosAgentBaseUrl();

  if (!hasEnergyosAgentConfig(baseUrl)) {
    throw new EnergyosAgentError(
      "VITE_ENERGYOS_AGENT_URL no esta configurada. Configura la URL publica de EnergyOS Advisor para usar el agente.",
      "missing_agent_url",
    );
  }

  const accessToken = await getSupabaseAccessToken();
  let response: Response;

  try {
    response = await fetch(buildAgentUrl(baseUrl, endpoint, query), {
      method,
      headers: buildAgentHeaders(accessToken),
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new EnergyosAgentError(
      "No se pudo conectar con EnergyOS Advisor. Revisa que la API este disponible.",
      "network_error",
    );
  }

  const body = await readResponsePayload(response);

  if (!response.ok) {
    throw new EnergyosAgentError(
      getAgentHttpErrorMessage(response.status, body),
      "http_error",
      response.status,
    );
  }

  return body as T;
}

async function requestAgent<T>(endpoint: AgentEndpoint, payload: unknown): Promise<T> {
  return requestAgentJson<T>("POST", endpoint, payload);
}

export function analyzePeriodWithAgent(input: AgentBaseRequest): Promise<AgentAnalysisOutput> {
  return requestAgent<AgentAnalysisOutput>("/agent/analyze-period", withPrivateContext(input));
}

export function askEnergyAgent(input: AgentQuestionRequest): Promise<AgentAskOutput> {
  return requestAgent<AgentAskOutput>("/advisor/chat", withPrivateContext(input));
}

export function generateAgentReport(input: AgentBaseRequest): Promise<AgentReportOutput> {
  return requestAgent<AgentReportOutput>("/agent/generate-report", withPrivateContext(input));
}

export function generateAgentActionPlan(input: AgentBaseRequest): Promise<AgentActionPlanOutput> {
  return requestAgent<AgentActionPlanOutput>("/agent/generate-action-plan", withPrivateContext(input));
}

export function reconcileInvoice(input: AgentBaseRequest): Promise<AgentReconcileInvoiceOutput> {
  return requestAgent<AgentReconcileInvoiceOutput>("/agent/reconcile-invoice", withPrivateContext(input));
}

export function approveAdvisorTask(input: AgentApproveTaskInput): Promise<AgentApproveTaskOutput> {
  return requestAgent<AgentApproveTaskOutput>("/advisor/tasks/approve", input);
}

export async function listAdvisorConversations(input: { nemo: string }): Promise<AgentConversation[]> {
  const output = await requestAgentJson<{ conversations: AgentConversation[] }>(
    "GET",
    "/advisor/conversations",
    undefined,
    { nemo: input.nemo },
  );
  return output.conversations;
}

export async function createAdvisorConversation(input: AgentConversationCreateInput): Promise<AgentConversation> {
  const output = await requestAgentJson<{ conversation: AgentConversation }>(
    "POST",
    "/advisor/conversations",
    input,
  );
  return output.conversation;
}

export function getAdvisorConversationMessages(
  input: AgentConversationScopeInput,
): Promise<AgentConversationMessagesOutput> {
  return requestAgentJson<AgentConversationMessagesOutput>(
    "GET",
    `/advisor/conversations/${input.conversationId}/messages`,
    undefined,
    {
      companyId: input.companyId,
      nemo: input.nemo,
    },
  );
}

export function updateAdvisorConversation(input: AgentConversationUpdateInput): Promise<{ ok: boolean }> {
  const { conversationId, ...payload } = input;
  return requestAgentJson<{ ok: boolean }>("PATCH", `/advisor/conversations/${conversationId}`, payload);
}

export function deleteAdvisorConversation(input: AgentConversationScopeInput): Promise<{ ok: boolean }> {
  return requestAgentJson<{ ok: boolean }>(
    "DELETE",
    `/advisor/conversations/${input.conversationId}`,
    undefined,
    {
      companyId: input.companyId,
      nemo: input.nemo,
    },
  );
}

export async function listAdvisorMemory(input: { nemo: string }): Promise<AgentMemoryItem[]> {
  const output = await requestAgentJson<{ memory: AgentMemoryItem[] }>(
    "GET",
    "/advisor/memory",
    undefined,
    { nemo: input.nemo },
  );
  return output.memory;
}

export function archiveAdvisorMemory(input: { memoryId: string; nemo: string }): Promise<{ ok: boolean }> {
  return requestAgentJson<{ ok: boolean }>(
    "PATCH",
    `/advisor/memory/${input.memoryId}`,
    {
      nemo: input.nemo,
      status: "archived",
    },
  );
}

export function deleteAdvisorMemory(input: { memoryId: string; nemo: string }): Promise<{ ok: boolean }> {
  return requestAgentJson<{ ok: boolean }>(
    "DELETE",
    `/advisor/memory/${input.memoryId}`,
    undefined,
    { nemo: input.nemo },
  );
}
