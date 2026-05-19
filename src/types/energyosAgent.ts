export type AgentOverallStatus = "normal" | "attention_required" | "critical";

export type AgentRiskLevel = "low" | "medium" | "high" | "critical";

export type AgentConfidence = "low" | "medium" | "high";

export type AgentBaseRequest = {
  companyId: string;
  companyName?: string;
  nemo: string;
  period: string;
  includePrivateContext?: boolean;
};

export type AgentFile = {
  name: string;
  type: string;
  content: string;
};

export type AgentQuestionRequest = AgentBaseRequest & {
  question: string;
  conversationId?: string;
  files?: AgentFile[];
};

export type AgentFinding = {
  id?: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  title: string;
  type: string;
  evidence?: unknown;
  confidence?: AgentConfidence | number | string;
  missingData?: string[];
};

export type AgentRecommendation = {
  id?: string;
  priority: "low" | "medium" | "high" | "critical" | string;
  reason?: string;
  action: string;
  expectedImpact?: string;
  requiredData?: string[];
  status?: string;
};

export type AgentAdvisorMetrics = {
  totalConsumptionMwh?: number | null;
  spotMwh?: number | null;
  spotExposurePct?: number | null;
  contractCoveragePct?: number | null;
  invoiceTotalPesos?: number | null;
  costDtePesosMwh?: number | null;
  renewableYtdPct?: number | null;
  riskScore?: number | null;
};

export type AgentFileAnalysis = {
  name: string;
  type: string;
  kind: string;
  status: "extracted" | "requires_ai_extraction" | "failed" | string;
  textPreview?: string;
  limitations?: string[];
  aiExtraction?: {
    summary?: string;
    fields?: Record<string, unknown>;
    confidence?: string;
  };
};

export type AgentAdvisorRunOutput = {
  response: string;
  intent: string;
  companyId?: string;
  companyName?: string;
  nemo: string;
  period: string | null;
  conversationId?: string;
  messageId?: string;
  assistantMessageId?: string;
  metrics?: AgentAdvisorMetrics;
  findings?: AgentFinding[];
  recommendations?: AgentRecommendation[];
  missingData?: string[];
  limitations?: string[];
  dataUsed?: string[];
  evidence?: Record<string, unknown>[];
  filesReceived?: AgentFile[];
  fileAnalyses?: AgentFileAnalysis[];
  qa?: {
    passed: boolean;
    issues: string[];
  };
};

export type AgentPrivateContextSummary = {
  nemo: string;
  completenessPct: number;
  contractsCount: number;
  warningsCount: number;
  missingDataCount: number;
};

export type AgentAnalysisOutput = {
  companyId: string;
  period: string;
  executiveSummary: string;
  overallStatus: AgentOverallStatus;
  riskLevel: AgentRiskLevel;
  findings: AgentFinding[];
  recommendations: AgentRecommendation[];
  missingData: string[];
  dataUsed: string[];
  confidence: AgentConfidence;
  limitations: string[];
  privateContextUsed?: boolean;
  privateContextSummary?: AgentPrivateContextSummary;
  evidence?: Record<string, unknown>[];
};

export type AgentActionPlanTask = {
  id?: string;
  title?: string;
  task?: string;
  description?: string;
  priority?: string;
  suggestedOwner?: string | null;
  owner?: string | null;
  suggestedDate?: string | null;
  dueDate?: string | null;
  requiredData?: string[];
  status?: string;
};

export type AgentActionPlanOutput = {
  companyId?: string;
  period?: string;
  summary?: string;
  tasks?: AgentActionPlanTask[];
  proposedTasks?: AgentActionPlanTask[];
  limitations?: string[];
  missingData?: string[];
  [key: string]: unknown;
};

export type AgentReportSection = {
  title?: string;
  summary?: string;
  content?: string;
  evidence?: Record<string, unknown>[];
  limitations?: string[];
  [key: string]: unknown;
};

export type AgentReportOutput = {
  companyId?: string;
  period?: string;
  summary?: string;
  executiveSummary?: string;
  sections?: AgentReportSection[] | Record<string, unknown>;
  dataUsed?: string[];
  evidence?: Record<string, unknown>[];
  limitations?: string[];
  [key: string]: unknown;
};

export type AgentAskOutput = {
  answer?: string;
  response?: string;
  summary?: string;
  conversationId?: string;
  messageId?: string;
  assistantMessageId?: string;
  intent?: string;
  advisor?: AgentAdvisorRunOutput;
  findings?: AgentFinding[];
  recommendations?: AgentRecommendation[];
  missingData?: string[];
  limitations?: string[];
  evidence?: Record<string, unknown>[];
  [key: string]: unknown;
};

export type AgentConversationStatus = "active" | "archived" | "deleted";

export type AgentConversation = {
  id: string;
  companyId: string;
  nemo: string;
  title: string;
  status: AgentConversationStatus;
  summary: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentConversationCreateInput = {
  companyId: string;
  companyName?: string;
  nemo: string;
  title?: string;
};

export type AgentConversationUpdateInput = {
  conversationId: string;
  companyId: string;
  nemo: string;
  title?: string;
  status?: "active" | "archived";
};

export type AgentConversationScopeInput = {
  conversationId: string;
  companyId: string;
  nemo: string;
};

export type AgentMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent: string | null;
  metadata?: Record<string, unknown>;
  runId?: string | null;
  createdAt: string;
};

export type AgentConversationMessagesOutput = {
  conversation: AgentConversation;
  messages: AgentMessage[];
  summary: string | null;
};

export type AgentMemoryScope = "user" | "nemo" | "conversation";
export type AgentMemoryType = "preference" | "confirmed_fact" | "decision" | "open_issue" | "task_context";
export type AgentMemoryConfidence = "low" | "medium" | "high";
export type AgentMemoryStatus = "active" | "archived" | "deleted";

export type AgentMemoryItem = {
  id: string;
  scope: AgentMemoryScope;
  userId?: string;
  companyId?: string | null;
  nemo?: string | null;
  conversationId?: string | null;
  type: AgentMemoryType;
  content: string;
  confidence: AgentMemoryConfidence;
  sourceMessageId?: string | null;
  evidence?: Record<string, unknown>;
  status?: AgentMemoryStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type AgentApproveTaskInput = {
  nemo: string;
  recommendationId: string;
  title: string;
  reason?: string;
  ownerEmail?: string;
  dueDate?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

export type AgentApproveTaskOutput = {
  task: {
    id: string;
    nemo: string;
    title: string;
    status: string;
  };
};

export type AgentReconcileInvoiceOutput = {
  status?: string;
  summary?: string;
  discrepancies?: Record<string, unknown>[];
  missingData?: string[];
  limitations?: string[];
  evidence?: Record<string, unknown>[];
  [key: string]: unknown;
};
