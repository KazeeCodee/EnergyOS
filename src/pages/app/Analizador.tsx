import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BrainCircuit,
  ClipboardList,
  FileText,
  Loader2,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  ReceiptText,
  RefreshCw,
  SearchCheck,
  Send,
  Sparkles,
} from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import {
  EnergyosAgentError,
  analyzePeriodWithAgent,
  askEnergyAgent,
  generateAgentActionPlan,
  generateAgentReport,
  hasEnergyosAgentConfig,
  reconcileInvoice,
} from "../../services/energyosAgent";
import type {
  AgentActionPlanOutput,
  AgentAnalysisOutput,
  AgentAskOutput,
  AgentBaseRequest,
  AgentReconcileInvoiceOutput,
  AgentReportOutput,
} from "../../types/energyosAgent";

type AdvisorMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  meta?: unknown;
  status?: "error";
};

type AdvisorConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AdvisorMessage[];
};

type AgentAction = "analyze" | "plan" | "report" | "reconcile";

const STORAGE_PREFIX = "energyos:advisor:threads:v1";

const SUGGESTED_PROMPTS = [
  "Por que subio el costo este mes?",
  "El aumento viene por consumo o por precio?",
  "Que contrato deberia revisar primero?",
  "Que datos faltan para confirmar el diagnostico?",
  "Hay riesgo de incumplimiento renovable?",
  "Que accion deberia hacer esta semana?",
];

const ACTIONS: Array<{
  id: AgentAction;
  label: string;
  prompt: string;
  icon: typeof RefreshCw;
}> = [
  {
    id: "analyze",
    label: "Analizar periodo",
    prompt: "Analiza el periodo actual con Data Room.",
    icon: SearchCheck,
  },
  {
    id: "plan",
    label: "Plan de accion",
    prompt: "Genera un plan de accion para este periodo.",
    icon: ClipboardList,
  },
  {
    id: "report",
    label: "Reporte",
    prompt: "Genera un reporte ejecutivo del periodo.",
    icon: FileText,
  },
  {
    id: "reconcile",
    label: "Conciliar",
    prompt: "Revisa conciliacion contrato vs factura/DTE si hay datos normalizados.",
    icon: ReceiptText,
  },
];

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageKey(companyId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${companyId ?? "sin-agente"}`;
}

function agentErrorMessage(error: unknown) {
  if (error instanceof EnergyosAgentError) return error.message;
  return "EnergyOS Advisor no pudo completar la solicitud.";
}

function createWelcomeMessage(company: string, nemo: string, period: string): AdvisorMessage {
  const context = company && nemo && period
    ? `${company} (${nemo}) - periodo ${period}`
    : "Selecciona una empresa y un periodo para empezar.";

  return {
    id: newId("msg"),
    role: "assistant",
    createdAt: nowIso(),
    content: `Soy EnergyOS Advisor. Puedo revisar costos, consumo, contratos, Data Room y acciones.\n\nContexto actual: ${context}`,
  };
}

function createConversation(company: string, nemo: string, period: string): AdvisorConversation {
  const createdAt = nowIso();
  return {
    id: newId("thread"),
    title: "Nueva conversacion",
    createdAt,
    updatedAt: createdAt,
    messages: [createWelcomeMessage(company, nemo, period)],
  };
}

function loadConversations(key: string): AdvisorConversation[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdvisorConversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(key: string, conversations: AdvisorConversation[]) {
  try {
    localStorage.setItem(key, JSON.stringify(conversations.slice(0, 30)));
  } catch {
    // Storage can be blocked. The chat still works in memory.
  }
}

function buildTitleFromMessage(message: string) {
  const clean = message.trim().replace(/\s+/g, " ");
  if (!clean) return "Nueva conversacion";
  return clean.length > 44 ? `${clean.slice(0, 44)}...` : clean;
}

function shortValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Dato no serializable";
  }
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Dato no serializable";
  }
}

function formatAnalysis(data: AgentAnalysisOutput) {
  const lines = [
    data.executiveSummary || "Analisis recibido.",
    "",
    `Estado: ${data.overallStatus} | Riesgo: ${data.riskLevel} | Confianza: ${data.confidence}`,
  ];

  if (data.privateContextUsed === false) {
    lines.push("Data Room: no usado en esta respuesta.");
  } else if (data.privateContextUsed === true) {
    lines.push("Data Room: usado.");
  }

  if (data.findings?.length) {
    lines.push("", "Hallazgos principales:");
    data.findings.slice(0, 4).forEach((finding) => {
      lines.push(`- ${finding.title} (${finding.severity})`);
    });
  }

  if (data.recommendations?.length) {
    lines.push("", "Acciones sugeridas:");
    data.recommendations.slice(0, 4).forEach((item) => {
      lines.push(`- ${item.action}`);
    });
  }

  if (data.missingData?.length) {
    lines.push("", `Datos faltantes: ${data.missingData.slice(0, 5).join(", ")}`);
  }

  return lines.join("\n");
}

function formatActionPlan(data: AgentActionPlanOutput) {
  const tasks = data.tasks ?? data.proposedTasks ?? [];
  const lines = [data.summary ?? "Plan de accion generado.", "", "No crea tareas automaticamente todavia."];

  if (tasks.length) {
    lines.push("", "Tareas propuestas:");
    tasks.slice(0, 6).forEach((task, index) => {
      const title = task.title ?? task.task ?? `Tarea ${index + 1}`;
      const owner = task.suggestedOwner ?? task.owner ?? "responsable faltante";
      const date = task.suggestedDate ?? task.dueDate ?? "fecha no informada";
      lines.push(`- ${title} | ${task.priority ?? "sin prioridad"} | ${owner} | ${date}`);
    });
  }

  return lines.join("\n");
}

function formatReport(data: AgentReportOutput) {
  const summary = data.summary ?? data.executiveSummary ?? "Reporte generado.";
  const lines = [summary];

  if (data.dataUsed?.length) {
    lines.push("", `Datos usados: ${data.dataUsed.join(", ")}`);
  }

  if (data.limitations?.length) {
    lines.push("", `Limitaciones: ${data.limitations.join(", ")}`);
  }

  return lines.join("\n");
}

function formatReconcile(data: AgentReconcileInvoiceOutput) {
  const lines = [
    data.summary ?? "Resultado de conciliacion recibido.",
    data.status ? `Estado: ${data.status}` : "",
  ].filter(Boolean);

  if (data.missingData?.length) {
    lines.push("", `Datos faltantes: ${data.missingData.join(", ")}`);
  }

  if (data.limitations?.length) {
    lines.push("", `Limitaciones: ${data.limitations.join(", ")}`);
  }

  return lines.join("\n");
}

function formatAsk(data: AgentAskOutput) {
  return data.answer ?? data.summary ?? shortValue(data) ?? "Respuesta recibida.";
}

function MessageBubble({ message }: { message: AdvisorMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(760px,92%)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-[#163759] text-white"
            : message.status === "error"
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <div className="whitespace-pre-line">{message.content}</div>
        {message.meta ? (
          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-500">Ver datos</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
              {prettyJson(message.meta)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default function Analizador() {
  const { agente, ultimoMesDisponible } = useAppContext();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [conversations, setConversations] = useState<AdvisorConversation[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const companyName = agente?.descripcion ?? "";
  const nemo = agente?.nemo ?? "";
  const agentConfigured = hasEnergyosAgentConfig();
  const key = useMemo(() => storageKey(agente?.id), [agente?.id]);

  const agentRequest = useMemo<AgentBaseRequest | null>(() => {
    if (!agente?.id || !agente.nemo || !ultimoMesDisponible) return null;
    return {
      companyId: agente.id,
      nemo: agente.nemo,
      period: ultimoMesDisponible,
      includePrivateContext: true,
    };
  }, [agente?.id, agente?.nemo, ultimoMesDisponible]);

  const canCallAgent = Boolean(agentRequest && agentConfigured);
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0] ?? null;

  useEffect(() => {
    const loaded = loadConversations(key);
    const initial = loaded.length ? loaded : [createConversation(companyName, nemo, ultimoMesDisponible)];
    setConversations(initial);
    setActiveConversationId(initial[0]?.id ?? "");
  }, [companyName, key, nemo, ultimoMesDisponible]);

  useEffect(() => {
    if (conversations.length) saveConversations(key, conversations);
  }, [conversations, key]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages.length, loadingLabel]);

  function updateConversation(conversationId: string, updater: (conversation: AdvisorConversation) => AdvisorConversation) {
    setConversations((current) =>
      current.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation)),
    );
  }

  function appendMessages(conversationId: string, messages: AdvisorMessage[], titleSeed?: string) {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.title === "Nueva conversacion" && titleSeed
        ? buildTitleFromMessage(titleSeed)
        : conversation.title,
      updatedAt: nowIso(),
      messages: [...conversation.messages, ...messages],
    }));
  }

  function startNewConversation() {
    const conversation = createConversation(companyName, nemo, ultimoMesDisponible);
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
  }

  function readinessMessage() {
    if (!agente) return "No hay agente seleccionado.";
    if (!ultimoMesDisponible) return "No hay periodo disponible.";
    if (!agentConfigured) return "El asistente no esta disponible en este momento.";
    return "El asistente no esta disponible en este momento.";
  }

  async function runRequest<T>({
    conversationId,
    loading,
    prompt,
    request,
    format,
  }: {
    conversationId: string;
    loading: string;
    prompt: string;
    request: () => Promise<T>;
    format: (data: T) => string;
  }) {
    const userMessage: AdvisorMessage = {
      id: newId("msg"),
      role: "user",
      content: prompt,
      createdAt: nowIso(),
    };

    appendMessages(conversationId, [userMessage], prompt);

    if (!canCallAgent) {
      appendMessages(conversationId, [
        {
          id: newId("msg"),
          role: "assistant",
          content: `${readinessMessage()} Proba de nuevo en unos minutos.`,
          createdAt: nowIso(),
          status: "error",
        },
      ]);
      return;
    }

    setLoadingLabel(loading);
    try {
      const response = await request();
      appendMessages(conversationId, [
        {
          id: newId("msg"),
          role: "assistant",
          content: format(response),
          createdAt: nowIso(),
          meta: response,
        },
      ]);
    } catch (error) {
      appendMessages(conversationId, [
        {
          id: newId("msg"),
          role: "assistant",
          content: agentErrorMessage(error),
          createdAt: nowIso(),
          status: "error",
        },
      ]);
    } finally {
      setLoadingLabel(null);
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || !activeConversation) return;
    setInput("");

    await runRequest({
      conversationId: activeConversation.id,
      loading: "Pensando...",
      prompt: question,
      request: () => askEnergyAgent({ ...agentRequest!, question }),
      format: formatAsk,
    });
  }

  async function runAction(action: AgentAction) {
    if (!activeConversation) return;
    const config = ACTIONS.find((item) => item.id === action);
    if (!config) return;

    if (action === "analyze") {
      await runRequest({
        conversationId: activeConversation.id,
        loading: "Analizando periodo...",
        prompt: config.prompt,
        request: () => analyzePeriodWithAgent(agentRequest!),
        format: formatAnalysis,
      });
      return;
    }

    if (action === "plan") {
      await runRequest({
        conversationId: activeConversation.id,
        loading: "Generando plan...",
        prompt: config.prompt,
        request: () => generateAgentActionPlan(agentRequest!),
        format: formatActionPlan,
      });
      return;
    }

    if (action === "report") {
      await runRequest({
        conversationId: activeConversation.id,
        loading: "Generando reporte...",
        prompt: config.prompt,
        request: () => generateAgentReport(agentRequest!),
        format: formatReport,
      });
      return;
    }

    await runRequest({
      conversationId: activeConversation.id,
      loading: "Conciliando...",
      prompt: config.prompt,
      request: () => reconcileInvoice(agentRequest!),
      format: formatReconcile,
    });
  }

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-full">
        <section className="flex min-w-0 flex-1 flex-col bg-[#f8fafc]">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#15caca]/10 text-[#0e8a8a]">
                <BrainCircuit size={19} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-[#163759]">EnergyOS Advisor</h1>
                <p className="truncate text-xs text-slate-500">
                  {companyName ? `${companyName} - ${nemo} - ${ultimoMesDisponible || "sin periodo"}` : "Sin agente seleccionado"}
                </p>
              </div>
            </div>
            <button
              aria-label={sidebarOpen ? "Ocultar historial" : "Mostrar historial"}
              className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-[#15caca] hover:text-[#163759] lg:inline-flex"
              onClick={() => setSidebarOpen((value) => !value)}
              type="button"
            >
              {sidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              Historial
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {activeConversation?.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {loadingLabel ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    <Loader2 className="animate-spin text-[#15caca]" size={16} />
                    {loadingLabel}
                  </div>
                </div>
              ) : null}

              <div ref={scrollRef} />
            </div>
          </div>

          <footer className="border-t border-slate-200 bg-white px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#15caca] hover:text-[#163759] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={Boolean(loadingLabel)}
                      key={action.id}
                      onClick={() => void runAction(action.id)}
                      type="button"
                    >
                      <Icon size={15} />
                      {action.label}
                    </button>
                  );
                })}
              </div>

              {activeConversation?.messages.length === 1 ? (
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-slate-600 transition hover:border-[#15caca] hover:bg-white hover:text-[#163759]"
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      type="button"
                    >
                      <Sparkles className="mr-1 inline text-[#15caca]" size={14} />
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              <form
                className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm focus-within:border-[#15caca] focus-within:ring-2 focus-within:ring-[#15caca]/15"
                onSubmit={submitQuestion}
              >
                <textarea
                  className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#163759] outline-none placeholder:text-slate-400"
                  disabled={Boolean(loadingLabel)}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Preguntale algo al Advisor..."
                  value={input}
                />
                <button
                  aria-label="Enviar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#15caca] text-white transition hover:bg-[#0e8a8a] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={Boolean(loadingLabel) || input.trim().length === 0}
                  type="submit"
                >
                  {loadingLabel ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                </button>
              </form>
            </div>
          </footer>
        </section>

        {sidebarOpen ? (
          <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-slate-50/80 p-3 lg:flex lg:flex-col">
            <div className="mb-3 flex gap-2">
              <button
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#15caca] hover:text-[#163759]"
                onClick={startNewConversation}
                type="button"
              >
                <MessageSquarePlus size={17} />
                Nueva conversacion
              </button>
              <button
                aria-label="Contraer historial"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-[#15caca] hover:text-[#163759]"
                onClick={() => setSidebarOpen(false)}
                type="button"
              >
                <PanelRightClose size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    conversation.id === activeConversation?.id
                      ? "bg-white font-semibold text-[#163759] shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                  key={conversation.id}
                  onClick={() => setActiveConversationId(conversation.id)}
                  type="button"
                >
                  <span className="line-clamp-2">{conversation.title}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
