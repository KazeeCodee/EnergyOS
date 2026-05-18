export type EnergyCurrency = "ARS" | "USD";

export type MaterContractType =
  | "BASE"
  | "PLUS"
  | "RENOVABLE"
  | "DELIVERY"
  | "COMPROMISO"
  | "OTRO"
  | "PPA"
  | "DISTRIBUIDORA";

export type PrivateDataStatus =
  | "borrador"
  | "activo"
  | "vencido"
  | "rescindido"
  | "en_revision";

export type MaterPriceType =
  | "fijo"
  | "indexado"
  | "por_banda"
  | "escalonado"
  | "formula";

export type MaterTechnology =
  | "solar"
  | "eolica"
  | "hidro"
  | "biomasa"
  | "termica"
  | "mixta"
  | "desconocida";

export type MaterContractDraft = {
  contractName: string;
  contractType: MaterContractType;
  status: PrivateDataStatus;
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
  priceCurrency: EnergyCurrency | string;
  basePrice: number | null;
  priceType: MaterPriceType;
  renewable: boolean;
  technology: MaterTechnology | "";
  internalOwnerEmail: string;
  renewalDeadline: string;
  adjustmentIndex: string;
  adjustmentFrequency: string;
  sourceDocumentName: string;
};

export type SavedMaterContract = MaterContractDraft & {
  id: string;
  versionId?: string | null;
  versionNumber?: number | null;
  savedAt: string;
};

export type MaterContractSaveInput = MaterContractDraft & {
  id?: string | null;
};

export type DataRoomResponse = {
  nemo: string;
  contratos: SavedMaterContract[];
};

export type SaveMaterContractResponse = {
  contract: SavedMaterContract;
};

export type MaterContractNormalized = {
  priceUsdMwh: number | null;
  priceArsMwh: number | null;
  canonicalPriceUnit: "USD_MWH" | "ARS_MWH" | null;
  buyerNemo: string;
  sellerNemo: string;
};

export type MaterValidationError =
  | "contract_name_required"
  | "buyer_nemo_invalid"
  | "seller_nemo_invalid"
  | "marketer_nemo_invalid"
  | "date_range_invalid"
  | "monthly_energy_invalid"
  | "base_price_invalid"
  | "price_currency_invalid"
  | "adjustment_index_required"
  | "adjustment_frequency_required"
  | "technology_required";

export type MaterValidationResult = {
  valid: boolean;
  errors: MaterValidationError[];
  normalized: MaterContractNormalized;
};

export type MaterContractSectionId =
  | "identificacion"
  | "partes"
  | "vigencia"
  | "energia_potencia"
  | "precio_formula"
  | "renovable"
  | "responsable_evidencia";

export type MaterContractReadinessSection = {
  id: MaterContractSectionId;
  label: string;
  status: DataRoomBlockStatus;
  pct: number;
  missing: string[];
};

export type MaterContractReadiness = {
  overallPct: number;
  sections: MaterContractReadinessSection[];
  missingRequired: string[];
};

export type DataRoomCompletenessInput = {
  sitesCount: number;
  activeContractsCount: number;
  invoicesLast12mCount: number;
  forecastsCount: number;
  openClaimsCount: number;
  smecDocumentsCount: number;
  responsiblesCount: number;
  evidenceDocumentsCount: number;
};

export type DataRoomBlockStatus = "completo" | "parcial" | "pendiente";

export type DataRoomCompletenessBlock = {
  label: string;
  status: DataRoomBlockStatus;
  pct: number;
  detail: string;
};

export type DataRoomCompleteness = {
  overallPct: number;
  blocks: {
    sites: DataRoomCompletenessBlock;
    contracts: DataRoomCompletenessBlock;
    invoices: DataRoomCompletenessBlock;
    forecast: DataRoomCompletenessBlock;
    claims: DataRoomCompletenessBlock;
    smec: DataRoomCompletenessBlock;
    responsibles: DataRoomCompletenessBlock;
    documents: DataRoomCompletenessBlock;
  };
};

export type AiContextSeverity = "low" | "medium" | "high" | "critical";

export type AiContextWarning = {
  code: string;
  severity: AiContextSeverity;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  field?: string;
  message: string;
};

export type AiMissingData = {
  area: string;
  field: string;
  severity: AiContextSeverity;
  entityType?: string;
  entityId?: string;
  message: string;
};

export type AiDeadline = {
  type: "contract_expiration" | "contract_renewal" | "claim_due" | "audit_due";
  entityId: string;
  entityName: string;
  dueDate: string;
  severity: AiContextSeverity;
  message: string;
};

export type AiClaimSummary = {
  id: string;
  title: string;
  status: string;
  ownerEmail: string;
  dueDate: string;
  estimatedImpactAmount: number | null;
  currency: string;
};

export type AiAuditObservationSummary = {
  id: string;
  title: string;
  observationType: string;
  status: string;
  ownerEmail: string;
  dueDate: string;
};

export type AiEvidenceSummary = {
  id: string;
  documentType: string;
  fileName: string;
  uploadedAt: string;
  entityType: string;
  entityId: string;
  evidenceNote: string;
};

export type AiContextResponse = {
  nemo: string;
  generatedAt: string;
  completeness: DataRoomCompleteness;
  contracts: SavedMaterContract[];
  activeDeadlines: AiDeadline[];
  openClaims: AiClaimSummary[];
  auditObservations: AiAuditObservationSummary[];
  missingData: AiMissingData[];
  evidence: AiEvidenceSummary[];
  warnings: AiContextWarning[];
};
