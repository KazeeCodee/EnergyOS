import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type ContractPayload = {
  id?: string | null;
  contractName: string;
  contractType: string;
  status: string;
  buyerNemo: string;
  sellerNemo: string;
  generatorGroup: string;
  marketerNemo: string;
  startDate: string;
  endDate: string;
  signedDate: string;
  monthlyEnergyMwh: number | null;
  annualEnergyMwh: number | null;
  contractedPowerMw: number | null;
  priceCurrency: string;
  basePrice: number | null;
  priceType: string;
  renewable: boolean;
  technology: string;
  internalOwnerEmail: string;
  renewalDeadline: string;
  adjustmentIndex: string;
  adjustmentFrequency: string;
  sourceDocumentName: string;
};

type ContractRow = {
  id: string;
  buyer_nemo: string;
  contract_name: string;
  contract_type: string;
  status: string;
  seller_nemo: string | null;
  generator_group: string | null;
  marketer_nemo: string | null;
  version_id: string | null;
  version_number: number | null;
  valid_from: string | Date | null;
  valid_to: string | Date | null;
  signed_date: string | Date | null;
  monthly_energy_mwh: string | number | null;
  annual_energy_mwh: string | number | null;
  contracted_power_mw: string | number | null;
  price_currency: string | null;
  base_price: string | number | null;
  price_type: string | null;
  renewable: boolean | null;
  technology: string | null;
  internal_owner_email: string | null;
  renewal_deadline: string | Date | null;
  adjustment_index: string | null;
  adjustment_frequency: string | null;
  source_document_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type DataRoomBlockStatus = "completo" | "parcial" | "pendiente";
type ContextSeverity = "low" | "medium" | "high" | "critical";

type DataRoomCompletenessBlock = {
  label: string;
  status: DataRoomBlockStatus;
  pct: number;
  detail: string;
};

type AiContextWarning = {
  code: string;
  severity: ContextSeverity;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  field?: string;
  message: string;
};

type AiMissingData = {
  area: string;
  field: string;
  severity: ContextSeverity;
  entityType?: string;
  entityId?: string;
  message: string;
};

type AiDeadline = {
  type: "contract_expiration" | "contract_renewal" | "claim_due" | "audit_due";
  entityId: string;
  entityName: string;
  dueDate: string;
  severity: ContextSeverity;
  message: string;
};

type ClaimRow = {
  id: string;
  title: string;
  status: string;
  owner_email: string | null;
  due_date: string | Date | null;
  estimated_impact_amount: string | number | null;
  currency: string | null;
};

type AuditObservationRow = {
  id: string;
  title: string;
  observation_type: string;
  status: string;
  owner_email: string | null;
  due_date: string | Date | null;
};

type EvidenceRow = {
  id: string;
  document_type: string;
  file_name: string;
  uploaded_at: string | Date;
  entity_type: string | null;
  entity_id: string | null;
  evidence_note: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeNemo(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().slice(0, 8);
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIso(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function allowedNemo(value: string, autorizados: string[]): boolean {
  return Boolean(value) && autorizados.includes(value);
}

function validateContractPayload(payload: ContractPayload, autorizados: string[]) {
  const errors: string[] = [];
  const buyerNemo = normalizeNemo(payload.buyerNemo);
  const sellerNemo = normalizeNemo(payload.sellerNemo);
  const marketerNemo = normalizeNemo(payload.marketerNemo);

  if (!payload.contractName?.trim()) errors.push("contract_name_required");
  if (!allowedNemo(buyerNemo, autorizados)) errors.push("buyer_nemo_not_authorized");
  if (sellerNemo && sellerNemo.length !== 8) errors.push("seller_nemo_invalid");
  if (marketerNemo && marketerNemo.length !== 8) errors.push("marketer_nemo_invalid");
  if (!["ARS", "USD"].includes(payload.priceCurrency)) errors.push("price_currency_invalid");
  if (!["fijo", "indexado", "por_banda", "escalonado", "formula"].includes(payload.priceType)) {
    errors.push("price_type_invalid");
  }
  if (!["BASE", "PLUS", "RENOVABLE", "DELIVERY", "COMPROMISO", "OTRO", "PPA", "DISTRIBUIDORA"].includes(payload.contractType)) {
    errors.push("contract_type_invalid");
  }
  if (!["borrador", "activo", "vencido", "rescindido", "en_revision"].includes(payload.status)) {
    errors.push("status_invalid");
  }
  const isDraft = payload.status === "borrador" || payload.status === "en_revision";

  if (!isDraft && (payload.priceType === "indexado" || payload.priceType === "formula") && !payload.adjustmentIndex?.trim()) {
    errors.push("adjustment_index_required");
  }
  if (!isDraft && (payload.priceType === "indexado" || payload.priceType === "formula") && !payload.adjustmentFrequency?.trim()) {
    errors.push("adjustment_frequency_required");
  }
  if (!isDraft && payload.renewable && !payload.technology?.trim()) errors.push("technology_required");

  return { errors, buyerNemo, sellerNemo, marketerNemo };
}

function mapContract(row: ContractRow) {
  return {
    id: row.id,
    versionId: row.version_id,
    versionNumber: row.version_number,
    contractName: row.contract_name,
    contractType: row.contract_type,
    status: row.status,
    buyerNemo: row.buyer_nemo,
    sellerNemo: row.seller_nemo ?? "",
    generatorGroup: row.generator_group ?? "",
    marketerNemo: row.marketer_nemo ?? "",
    startDate: toDate(row.valid_from),
    endDate: toDate(row.valid_to),
    signedDate: toDate(row.signed_date),
    monthlyEnergyMwh: toNumber(row.monthly_energy_mwh),
    annualEnergyMwh: toNumber(row.annual_energy_mwh),
    contractedPowerMw: toNumber(row.contracted_power_mw),
    priceCurrency: row.price_currency ?? "USD",
    basePrice: toNumber(row.base_price),
    priceType: row.price_type ?? "fijo",
    renewable: Boolean(row.renewable),
    technology: row.technology ?? "",
    internalOwnerEmail: row.internal_owner_email ?? "",
    renewalDeadline: toDate(row.renewal_deadline),
    adjustmentIndex: row.adjustment_index ?? "",
    adjustmentFrequency: row.adjustment_frequency ?? "",
    sourceDocumentName: row.source_document_name ?? "",
    savedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

function completenessBlock(label: string, pct: number, detail: string): DataRoomCompletenessBlock {
  return {
    label,
    status: pct >= 100 ? "completo" : pct > 0 ? "parcial" : "pendiente",
    pct,
    detail,
  };
}

function countValue(rows: Array<{ count: string | number | null }>): number {
  return toNumber(rows[0]?.count ?? null) ?? 0;
}

function daysUntil(dateText: string, referenceDate: Date): number | null {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate());
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.ceil((end - start) / 86_400_000);
}

function warningToMissingData(warning: AiContextWarning): AiMissingData | null {
  if (!warning.field) return null;
  return {
    area: warning.entityType ?? "data_room",
    field: warning.field,
    severity: warning.severity,
    entityType: warning.entityType,
    entityId: warning.entityId,
    message: warning.message,
  };
}

function buildContractWarnings(
  contracts: ReturnType<typeof mapContract>[],
  referenceDate: Date,
): { warnings: AiContextWarning[]; deadlines: AiDeadline[]; missingData: AiMissingData[] } {
  const warnings: AiContextWarning[] = [];
  const deadlines: AiDeadline[] = [];

  for (const contract of contracts) {
    const entity = {
      entityType: "contract",
      entityId: contract.id,
      entityName: contract.contractName,
    };

    if (contract.status === "borrador") {
      warnings.push({
        code: "contract_status_draft",
        severity: "medium",
        field: "status",
        ...entity,
        message: `El contrato ${contract.contractName} esta en borrador; no debe tratarse como condicion confirmada.`,
      });
    }

    if (!contract.basePrice || contract.basePrice <= 0) {
      warnings.push({
        code: "contract_missing_price",
        severity: "high",
        field: "basePrice",
        ...entity,
        message: `Falta precio base del contrato ${contract.contractName}.`,
      });
    }

    if ((!contract.monthlyEnergyMwh || contract.monthlyEnergyMwh <= 0) && (!contract.annualEnergyMwh || contract.annualEnergyMwh <= 0)) {
      warnings.push({
        code: "contract_missing_energy",
        severity: "high",
        field: "monthlyEnergyMwh",
        ...entity,
        message: `Falta energia mensual o anual contratada para ${contract.contractName}.`,
      });
    }

    if (!contract.startDate || !contract.endDate) {
      warnings.push({
        code: "contract_missing_validity",
        severity: "high",
        field: contract.startDate ? "endDate" : "startDate",
        ...entity,
        message: `Falta vigencia completa del contrato ${contract.contractName}.`,
      });
    }

    if (!contract.sourceDocumentName) {
      warnings.push({
        code: "contract_missing_evidence",
        severity: "medium",
        field: "sourceDocumentName",
        ...entity,
        message: `Falta documento fuente vinculado al contrato ${contract.contractName}.`,
      });
    }

    if ((contract.priceType === "indexado" || contract.priceType === "formula") && (!contract.adjustmentIndex || !contract.adjustmentFrequency)) {
      warnings.push({
        code: "contract_indexation_incomplete",
        severity: "high",
        field: !contract.adjustmentIndex ? "adjustmentIndex" : "adjustmentFrequency",
        ...entity,
        message: `Falta indice o frecuencia de ajuste para el contrato ${contract.contractName}.`,
      });
    }

    if (contract.renewable && !contract.technology) {
      warnings.push({
        code: "renewable_contract_missing_technology",
        severity: "medium",
        field: "technology",
        ...entity,
        message: `El contrato ${contract.contractName} esta marcado como renovable pero no tiene tecnologia cargada.`,
      });
    }

    const daysToEnd = daysUntil(contract.endDate, referenceDate);
    if (daysToEnd !== null && daysToEnd < 0 && !["vencido", "rescindido"].includes(contract.status)) {
      warnings.push({
        code: "contract_expired",
        severity: "critical",
        field: "endDate",
        ...entity,
        message: `El contrato ${contract.contractName} vencio el ${contract.endDate} y no figura como vencido/rescindido.`,
      });
    } else if (daysToEnd !== null && daysToEnd <= 120) {
      const severity: ContextSeverity = daysToEnd <= 45 ? "high" : "medium";
      warnings.push({
        code: "contract_expiring_soon",
        severity,
        field: "endDate",
        ...entity,
        message: `El contrato ${contract.contractName} vence el ${contract.endDate}.`,
      });
      deadlines.push({
        type: "contract_expiration",
        entityId: contract.id,
        entityName: contract.contractName,
        dueDate: contract.endDate,
        severity,
        message: `Vencimiento de contrato ${contract.contractName}.`,
      });
    }

    const daysToRenewal = daysUntil(contract.renewalDeadline, referenceDate);
    if (daysToRenewal !== null && daysToRenewal <= 90) {
      const severity: ContextSeverity = contract.internalOwnerEmail ? "medium" : "high";
      warnings.push({
        code: "contract_renewal_due_soon",
        severity,
        field: "renewalDeadline",
        ...entity,
        message: `La fecha limite de renovacion de ${contract.contractName} es ${contract.renewalDeadline}.`,
      });
      deadlines.push({
        type: "contract_renewal",
        entityId: contract.id,
        entityName: contract.contractName,
        dueDate: contract.renewalDeadline,
        severity,
        message: `Fecha limite de renovacion de ${contract.contractName}.`,
      });
    }

    if (!contract.internalOwnerEmail) {
      warnings.push({
        code: "contract_missing_owner",
        severity: "medium",
        field: "internalOwnerEmail",
        ...entity,
        message: `Falta responsable interno del contrato ${contract.contractName}.`,
      });
    }
  }

  return {
    warnings,
    deadlines,
    missingData: warnings.map(warningToMissingData).filter((item): item is AiMissingData => item !== null),
  };
}

async function getAuthorizedContext(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_PUBLISHABLE_KEY");
  const railwayDatabaseUrl = Deno.env.get("RAILWAY_DATABASE_URL");
  if (!supabaseUrl || !supabaseAnonKey || !railwayDatabaseUrl) {
    return { response: json({ error: "Missing server configuration" }, 500) };
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: json({ error: "Missing bearer token" }, 401) };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) {
    return { response: json({ error: "Invalid JWT" }, 401) };
  }

  const { data: nemosData, error: nemosError } = await supabase.rpc("current_user_nemos");
  if (nemosError) return { response: json({ error: nemosError.message }, 500) };

  const autorizados = ((nemosData ?? []) as string[]).map(normalizeNemo).filter(Boolean);
  if (autorizados.length === 0) {
    return { response: json({ error: "El usuario no tiene agentes vinculados" }, 403) };
  }

  return {
    userId: userResult.user.id,
    autorizados,
    railwayDatabaseUrl,
  };
}

async function buildAiContext(
  sql: ReturnType<typeof postgres>,
  nemo: string,
) {
  const contractRows = await sql<ContractRow[]>`
    select *
    from client_private.v_contracts_latest
    where buyer_nemo = ${nemo}
    order by updated_at desc, created_at desc
  `;
  const contracts = contractRows.map(mapContract);

  const [siteCountRows, invoiceCountRows, forecastCountRows, claimCountRows, smecOpenRows, responsibleRows, documentRows] = await Promise.all([
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.sites
      where nemo = ${nemo}
        and active = true
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.invoice_imports
      where nemo = ${nemo}
        and status = 'validado'
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.forecasts
      where nemo = ${nemo}
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.claims
      where nemo = ${nemo}
        and status in ('abierto', 'en_revision', 'presentado')
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.audit_observations
      where nemo = ${nemo}
        and status in ('abierta', 'en_revision')
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.responsibles
      where nemo = ${nemo}
        and active = true
    `,
    sql<Array<{ count: string | number | null }>>`
      select count(*)::int as count
      from client_private.documents
      where nemo = ${nemo}
    `,
  ]);

  const openClaims = await sql<ClaimRow[]>`
    select id, title, status, owner_email, due_date, estimated_impact_amount, currency
    from client_private.claims
    where nemo = ${nemo}
      and status in ('abierto', 'en_revision', 'presentado')
    order by due_date nulls last, updated_at desc
    limit 20
  `;

  const auditObservations = await sql<AuditObservationRow[]>`
    select id, title, observation_type, status, owner_email, due_date
    from client_private.audit_observations
    where nemo = ${nemo}
      and status in ('abierta', 'en_revision')
    order by due_date nulls last, created_at desc
    limit 20
  `;

  const evidenceRows = await sql<EvidenceRow[]>`
    select
      d.id,
      d.document_type,
      d.file_name,
      d.uploaded_at,
      dl.entity_type,
      dl.entity_id::text as entity_id,
      dl.evidence_note
    from client_private.documents d
    left join client_private.document_links dl on dl.document_id = d.id
    where d.nemo = ${nemo}
    order by d.uploaded_at desc
    limit 30
  `;

  const sitesCount = countValue(siteCountRows);
  const invoicesCount = countValue(invoiceCountRows);
  const forecastsCount = countValue(forecastCountRows);
  const claimsCount = countValue(claimCountRows);
  const smecOpenCount = countValue(smecOpenRows);
  const responsiblesCount = countValue(responsibleRows);
  const documentsCount = countValue(documentRows);
  const activeCompleteContracts = contracts.filter((contract) =>
    contract.status === "activo" &&
    Boolean(contract.startDate) &&
    Boolean(contract.endDate) &&
    Boolean(contract.basePrice && contract.basePrice > 0) &&
    Boolean((contract.monthlyEnergyMwh && contract.monthlyEnergyMwh > 0) || (contract.annualEnergyMwh && contract.annualEnergyMwh > 0)) &&
    Boolean(contract.sourceDocumentName)
  ).length;

  const completeness = {
    overallPct: 0,
    blocks: {
      sites: completenessBlock(
        "Sitios y puntos de suministro",
        sitesCount > 0 ? 100 : 0,
        sitesCount > 0 ? `${sitesCount} sitio(s) activo(s) cargado(s).` : "No hay sitios cargados.",
      ),
      contracts: completenessBlock(
        "Contratos",
        activeCompleteContracts > 0 ? 100 : contracts.length > 0 ? 50 : 0,
        contracts.length > 0 ? `${contracts.length} contrato(s), ${activeCompleteContracts} completo(s).` : "No hay contratos cargados.",
      ),
      invoices: completenessBlock(
        "Facturas y liquidaciones",
        Math.min(100, Math.round((invoicesCount / 12) * 100)),
        `${invoicesCount} factura(s) o liquidacion(es) validada(s).`,
      ),
      forecast: completenessBlock(
        "Presupuesto y forecast",
        forecastsCount > 0 ? 100 : 0,
        forecastsCount > 0 ? `${forecastsCount} escenario(s) cargado(s).` : "No hay forecast/provision cargado.",
      ),
      claims: completenessBlock(
        "Reclamos",
        claimsCount > 0 ? 100 : 0,
        claimsCount > 0 ? `${claimsCount} reclamo(s) abierto(s) en seguimiento.` : "No hay reclamos cargados.",
      ),
      smec: completenessBlock(
        "SMEC y auditorias",
        smecOpenCount > 0 ? 50 : 0,
        smecOpenCount > 0 ? `${smecOpenCount} observacion(es) abierta(s).` : "No hay observaciones SMEC/auditoria cargadas.",
      ),
      responsibles: completenessBlock(
        "Responsables",
        responsiblesCount >= 2 ? 100 : responsiblesCount > 0 ? 50 : 0,
        responsiblesCount > 0 ? `${responsiblesCount} responsable(s) activo(s).` : "No hay responsables cargados.",
      ),
      documents: completenessBlock(
        "Documentos",
        documentsCount > 0 ? 50 : 0,
        documentsCount > 0 ? `${documentsCount} documento(s) cargado(s).` : "No hay documentos de evidencia cargados.",
      ),
    },
  };
  const blockValues = Object.values(completeness.blocks).map((block) => block.pct);
  completeness.overallPct = Math.round(blockValues.reduce((sum, pct) => sum + pct, 0) / blockValues.length);

  const contractRisk = buildContractWarnings(contracts, new Date());
  const activeDeadlines: AiDeadline[] = [...contractRisk.deadlines];

  for (const claim of openClaims) {
    const dueDate = toDate(claim.due_date);
    if (dueDate) {
      activeDeadlines.push({
        type: "claim_due",
        entityId: claim.id,
        entityName: claim.title,
        dueDate,
        severity: "medium",
        message: `Vencimiento de reclamo: ${claim.title}.`,
      });
    }
  }

  for (const observation of auditObservations) {
    const dueDate = toDate(observation.due_date);
    if (dueDate) {
      activeDeadlines.push({
        type: "audit_due",
        entityId: observation.id,
        entityName: observation.title,
        dueDate,
        severity: "high",
        message: `Vencimiento de observacion tecnica/SMEC: ${observation.title}.`,
      });
    }
  }

  const missingData = [...contractRisk.missingData];
  if (sitesCount === 0) missingData.push({ area: "sites", field: "sites", severity: "medium", message: "Faltan sitios o puntos de suministro para atribuir desvios por planta." });
  if (invoicesCount === 0) missingData.push({ area: "invoices", field: "invoice_imports", severity: "high", message: "Faltan facturas/DTE validadas para reconciliar costos reales." });
  if (responsiblesCount === 0) missingData.push({ area: "responsibles", field: "responsibles", severity: "medium", message: "Faltan responsables internos para asignar acciones." });

  return {
    nemo,
    generatedAt: new Date().toISOString(),
    completeness,
    contracts,
    activeDeadlines,
    openClaims: openClaims.map((claim) => ({
      id: claim.id,
      title: claim.title,
      status: claim.status,
      ownerEmail: claim.owner_email ?? "",
      dueDate: toDate(claim.due_date),
      estimatedImpactAmount: toNumber(claim.estimated_impact_amount),
      currency: claim.currency ?? "",
    })),
    auditObservations: auditObservations.map((observation) => ({
      id: observation.id,
      title: observation.title,
      observationType: observation.observation_type,
      status: observation.status,
      ownerEmail: observation.owner_email ?? "",
      dueDate: toDate(observation.due_date),
    })),
    missingData,
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      documentType: row.document_type,
      fileName: row.file_name,
      uploadedAt: toIso(row.uploaded_at),
      entityType: row.entity_type ?? "",
      entityId: row.entity_id ?? "",
      evidenceNote: row.evidence_note ?? "",
    })),
    warnings: contractRisk.warnings,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  const context = await getAuthorizedContext(req);
  if ("response" in context) return context.response;

  const url = new URL(req.url);
  const requestedNemo = normalizeNemo(url.searchParams.get("nemo"));
  const nemo = requestedNemo || (context.autorizados.length === 1 ? context.autorizados[0] : "");
  if (!nemo) return json({ error: "Parametro nemo requerido para usuarios multi-agente", nemos: context.autorizados }, 400);
  if (!allowedNemo(nemo, context.autorizados)) return json({ error: "NEMO no autorizado para este usuario" }, 403);

  const sql = postgres(context.railwayDatabaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    ssl: false,
  });

  try {
    if (req.method === "GET") {
      const isAiContext = url.pathname.endsWith("/ai-context") || url.searchParams.get("mode") === "ai-context";
      if (isAiContext) {
        return json(await buildAiContext(sql, nemo));
      }

      const rows = await sql<ContractRow[]>`
        select *
        from client_private.v_contracts_latest
        where buyer_nemo = ${nemo}
        order by updated_at desc, created_at desc
      `;

      return json({
        nemo,
        contratos: rows.map(mapContract),
      });
    }

    const body = (await req.json()) as { contract?: ContractPayload };
    const contract = body.contract;
    if (!contract) return json({ error: "contract payload required" }, 400);

    const { errors, buyerNemo, sellerNemo, marketerNemo } = validateContractPayload(contract, context.autorizados);
    if (buyerNemo !== nemo) errors.push("buyer_nemo_mismatch");
    if (errors.length > 0) return json({ error: "invalid_contract", errors }, 400);

    const savedRows = await sql.begin(async (trx) => {
      let contractId = contract.id ?? null;

      if (contractId) {
        const existing = await trx<{ id: string }[]>`
          select id
          from client_private.contracts
          where id = ${contractId}
            and buyer_nemo = ${buyerNemo}
          limit 1
        `;
        if (existing.length === 0) throw new Error("contract_not_found");

        await trx`
          update client_private.contracts
          set
            contract_name = ${body.contract.contractName.trim()},
            contract_type = ${contract.contractType},
            status = ${contract.status},
            seller_nemo = ${sellerNemo || null},
            generator_group = ${nullableText(contract.generatorGroup)},
            marketer_nemo = ${marketerNemo || null},
            updated_at = now()
          where id = ${contractId}
        `;
      } else {
        const inserted = await trx<{ id: string }[]>`
          insert into client_private.contracts (
            buyer_nemo, contract_name, contract_type, status,
            seller_nemo, generator_group, marketer_nemo, created_by_user_id
          )
          values (
            ${buyerNemo},
            ${contract.contractName.trim()},
            ${contract.contractType},
            ${contract.status},
            ${sellerNemo || null},
            ${nullableText(contract.generatorGroup)},
            ${marketerNemo || null},
            ${context.userId}
          )
          returning id
        `;
        contractId = inserted[0].id;
      }

      const latestVersion = await trx<{ version_number: number | null }[]>`
        select max(version_number)::int as version_number
        from client_private.contract_versions
        where contract_id = ${contractId}
      `;
      const nextVersion = (latestVersion[0]?.version_number ?? 0) + 1;

      const insertedVersion = await trx<{ id: string }[]>`
        insert into client_private.contract_versions (
          contract_id, version_number, valid_from, valid_to, signed_date,
          monthly_energy_mwh, annual_energy_mwh, contracted_power_mw,
          price_currency, base_price, price_type, renewable, technology,
          internal_owner_email, renewal_deadline, adjustment_index,
          adjustment_frequency, source_document_name, source_payload,
          created_by_user_id
        )
        values (
          ${contractId},
          ${nextVersion},
          ${dateOrNull(contract.startDate)},
          ${dateOrNull(contract.endDate)},
          ${dateOrNull(contract.signedDate)},
          ${contract.monthlyEnergyMwh},
          ${contract.annualEnergyMwh},
          ${contract.contractedPowerMw},
          ${contract.priceCurrency},
          ${contract.basePrice},
          ${contract.priceType},
          ${contract.renewable},
          ${nullableText(contract.technology)},
          ${nullableText(contract.internalOwnerEmail)},
          ${dateOrNull(contract.renewalDeadline)},
          ${nullableText(contract.adjustmentIndex)},
          ${nullableText(contract.adjustmentFrequency)},
          ${nullableText(contract.sourceDocumentName)},
          ${trx.json(contract)},
          ${context.userId}
        )
        returning id
      `;

      await trx`
        update client_private.contracts
        set current_version_id = ${insertedVersion[0].id},
            updated_at = now()
        where id = ${contractId}
      `;

      return trx<ContractRow[]>`
        select *
        from client_private.v_contracts_latest
        where id = ${contractId}
        limit 1
      `;
    });

    return json({ contract: mapContract(savedRows[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Railway query failed";
    const status = message === "contract_not_found" ? 404 : 500;
    return json({ error: message }, status);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
