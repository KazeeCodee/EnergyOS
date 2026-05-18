import type {
  DataRoomBlockStatus,
  DataRoomCompleteness,
  DataRoomCompletenessBlock,
  DataRoomCompletenessInput,
  EnergyCurrency,
  MaterContractDraft,
  MaterContractReadiness,
  MaterContractReadinessSection,
  MaterValidationError,
  MaterValidationResult,
} from "../types/dataRoom";

function isValidNemo(value: string, allowEmpty = false): boolean {
  const trimmed = value.trim();
  if (allowEmpty && trimmed === "") return true;
  return /^[A-Za-z0-9]{8}$/.test(trimmed);
}

function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end >= start;
}

function isSupportedCurrency(value: string): value is EnergyCurrency {
  return value === "ARS" || value === "USD";
}

function positive(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateMaterContractDraft(draft: MaterContractDraft): MaterValidationResult {
  const errors: MaterValidationError[] = [];

  if (!draft.contractName.trim()) errors.push("contract_name_required");
  if (!isValidNemo(draft.buyerNemo)) errors.push("buyer_nemo_invalid");
  if (!isValidNemo(draft.sellerNemo)) errors.push("seller_nemo_invalid");
  if (!isValidNemo(draft.marketerNemo, true)) errors.push("marketer_nemo_invalid");
  if (!isValidDateRange(draft.startDate, draft.endDate)) errors.push("date_range_invalid");
  if (!positive(draft.monthlyEnergyMwh)) errors.push("monthly_energy_invalid");
  if (!positive(draft.basePrice)) errors.push("base_price_invalid");
  if (!isSupportedCurrency(draft.priceCurrency)) errors.push("price_currency_invalid");

  if (draft.priceType === "indexado" || draft.priceType === "formula") {
    if (!draft.adjustmentIndex.trim()) errors.push("adjustment_index_required");
    if (!draft.adjustmentFrequency.trim()) errors.push("adjustment_frequency_required");
  }

  if (draft.renewable && !draft.technology) {
    errors.push("technology_required");
  }

  const canNormalizePrice = positive(draft.basePrice) && isSupportedCurrency(draft.priceCurrency);

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      priceUsdMwh: canNormalizePrice && draft.priceCurrency === "USD" ? draft.basePrice : null,
      priceArsMwh: canNormalizePrice && draft.priceCurrency === "ARS" ? draft.basePrice : null,
      canonicalPriceUnit: canNormalizePrice
        ? draft.priceCurrency === "USD"
          ? "USD_MWH"
          : "ARS_MWH"
        : null,
      buyerNemo: draft.buyerNemo.trim().toUpperCase(),
      sellerNemo: draft.sellerNemo.trim().toUpperCase(),
    },
  };
}

function fieldPresent(value: string | number | null | boolean): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (value === null) return false;
  return value.trim().length > 0;
}

function readinessSection(
  id: MaterContractReadinessSection["id"],
  label: string,
  fields: Array<{ label: string; present: boolean }>,
): MaterContractReadinessSection {
  const missing = fields.filter((field) => !field.present).map((field) => field.label);
  const pct = Math.round(((fields.length - missing.length) / fields.length) * 100);

  return {
    id,
    label,
    status: pct >= 100 ? "completo" : pct > 0 ? "parcial" : "pendiente",
    pct,
    missing,
  };
}

export function buildMaterContractReadiness(draft: MaterContractDraft): MaterContractReadiness {
  const indexedOrFormula = draft.priceType === "indexado" || draft.priceType === "formula";

  const sections: MaterContractReadinessSection[] = [
    readinessSection("identificacion", "Identificación", [
      { label: "Nombre del contrato", present: fieldPresent(draft.contractName) },
      { label: "Tipo de contrato", present: fieldPresent(draft.contractType) },
      { label: "Estado", present: fieldPresent(draft.status) },
    ]),
    readinessSection("partes", "Partes y agentes", [
      { label: "NEMO comprador", present: isValidNemo(draft.buyerNemo) },
      { label: "NEMO generador", present: isValidNemo(draft.sellerNemo) },
      { label: "Conjunto generador", present: fieldPresent(draft.generatorGroup) },
      { label: "NEMO comercializador válido", present: isValidNemo(draft.marketerNemo, true) },
    ]),
    readinessSection("vigencia", "Vigencia", [
      { label: "Inicio de vigencia", present: fieldPresent(draft.startDate) },
      { label: "Fin de vigencia", present: fieldPresent(draft.endDate) },
      { label: "Rango de fechas válido", present: isValidDateRange(draft.startDate, draft.endDate) },
    ]),
    readinessSection("energia_potencia", "Energía y potencia", [
      { label: "Energía mensual MWh", present: positive(draft.monthlyEnergyMwh) },
      { label: "Energía anual MWh", present: positive(draft.annualEnergyMwh) },
      { label: "Potencia contratada MW", present: positive(draft.contractedPowerMw) },
    ]),
    readinessSection("precio_formula", "Precio y fórmula", [
      { label: "Moneda ARS/USD", present: isSupportedCurrency(draft.priceCurrency) },
      { label: "Precio base", present: positive(draft.basePrice) },
      { label: "Tipo de precio", present: fieldPresent(draft.priceType) },
      { label: "Índice de ajuste", present: !indexedOrFormula || fieldPresent(draft.adjustmentIndex) },
      { label: "Frecuencia de ajuste", present: !indexedOrFormula || fieldPresent(draft.adjustmentFrequency) },
    ]),
    readinessSection("renovable", "Renovable y tecnología", [
      { label: "Declaración renovable", present: fieldPresent(draft.renewable) },
      { label: "Tecnología", present: !draft.renewable || fieldPresent(draft.technology) },
    ]),
    readinessSection("responsable_evidencia", "Responsable y evidencia", [
      { label: "Responsable interno", present: fieldPresent(draft.internalOwnerEmail) },
      { label: "Fecha límite de renovación", present: fieldPresent(draft.renewalDeadline) },
      { label: "Documento de respaldo", present: fieldPresent(draft.sourceDocumentName) },
    ]),
  ];

  const overallPct = Math.round(
    sections.reduce((sum, section) => sum + section.pct, 0) / sections.length,
  );

  return {
    overallPct,
    sections,
    missingRequired: sections.flatMap((section) => section.missing),
  };
}

function block(label: string, pct: number, detail: string): DataRoomCompletenessBlock {
  const status: DataRoomBlockStatus =
    pct >= 100 ? "completo" : pct > 0 ? "parcial" : "pendiente";

  return {
    label,
    status,
    pct,
    detail,
  };
}

export function buildDataRoomCompleteness(input: DataRoomCompletenessInput): DataRoomCompleteness {
  const blocks = {
    sites: block(
      "Sitios y puntos de suministro",
      input.sitesCount > 0 ? 100 : 0,
      `${input.sitesCount} sitio${input.sitesCount === 1 ? "" : "s"} cargado${input.sitesCount === 1 ? "" : "s"}`,
    ),
    contracts: block(
      "Contratos",
      input.activeContractsCount > 0 ? 100 : 0,
      `${input.activeContractsCount} contrato${input.activeContractsCount === 1 ? "" : "s"} activo${input.activeContractsCount === 1 ? "" : "s"}`,
    ),
    invoices: block(
      "Facturas y liquidaciones",
      Math.min(100, Math.round((input.invoicesLast12mCount / 12) * 100)),
      `${input.invoicesLast12mCount} de 12 meses con respaldo`,
    ),
    forecast: block(
      "Presupuesto y forecast",
      input.forecastsCount > 0 ? 100 : 0,
      `${input.forecastsCount} escenario${input.forecastsCount === 1 ? "" : "s"} cargado${input.forecastsCount === 1 ? "" : "s"}`,
    ),
    claims: block(
      "Reclamos",
      input.openClaimsCount > 0 ? 100 : 0,
      `${input.openClaimsCount} reclamo${input.openClaimsCount === 1 ? "" : "s"} abierto${input.openClaimsCount === 1 ? "" : "s"}`,
    ),
    smec: block(
      "SMEC y auditorias",
      input.smecDocumentsCount > 0 ? 100 : 0,
      `${input.smecDocumentsCount} documento${input.smecDocumentsCount === 1 ? "" : "s"} tecnico${input.smecDocumentsCount === 1 ? "" : "s"}`,
    ),
    responsibles: block(
      "Responsables",
      input.responsiblesCount > 0 ? 100 : 0,
      `${input.responsiblesCount} responsable${input.responsiblesCount === 1 ? "" : "s"} interno${input.responsiblesCount === 1 ? "" : "s"}`,
    ),
    documents: block(
      "Documentos",
      input.evidenceDocumentsCount > 0 ? 100 : 0,
      `${input.evidenceDocumentsCount} archivo${input.evidenceDocumentsCount === 1 ? "" : "s"} de evidencia`,
    ),
  };

  const values = Object.values(blocks).map((item) => item.pct);
  const overallPct = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  return {
    overallPct,
    blocks,
  };
}
