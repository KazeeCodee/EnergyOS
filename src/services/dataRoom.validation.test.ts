import {
  buildMaterContractReadiness,
  buildDataRoomCompleteness,
  validateMaterContractDraft,
} from "./dataRoom.validation.ts";
import type { MaterContractDraft } from "../types/dataRoom.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(actual: string[], expected: string, message: string) {
  if (!actual.includes(expected)) {
    throw new Error(`${message}. Expected ${actual.join(", ")} to include ${expected}`);
  }
}

const validMater: MaterContractDraft = {
  contractName: "MATER renovable 2026",
  contractType: "RENOVABLE",
  status: "activo",
  buyerNemo: "CLIE1234",
  sellerNemo: "GENE5678",
  generatorGroup: "Parque Solar Norte",
  marketerNemo: "",
  startDate: "2026-01-01",
  endDate: "2028-12-31",
  signedDate: "2025-11-15",
  monthlyEnergyMwh: 1250,
  annualEnergyMwh: 15000,
  contractedPowerMw: 6.4,
  priceCurrency: "USD",
  basePrice: 58,
  priceType: "fijo",
  renewable: true,
  technology: "solar",
  internalOwnerEmail: "energia@cliente.com",
  renewalDeadline: "2028-06-30",
  adjustmentIndex: "",
  adjustmentFrequency: "",
  sourceDocumentName: "contrato_mater_2026.pdf",
};

const validResult = validateMaterContractDraft(validMater);
assertEqual(validResult.valid, true, "valid MATER draft should pass");
assertEqual(validResult.errors.length, 0, "valid MATER draft should not emit errors");
assertEqual(validResult.normalized.priceUsdMwh, 58, "USD contract should normalize USD/MWh");
assertEqual(validResult.normalized.priceArsMwh, null, "USD contract should not invent ARS/MWh");

const validReadiness = buildMaterContractReadiness(validMater);
assertEqual(validReadiness.overallPct, 100, "complete MATER draft should have full readiness");
assertEqual(validReadiness.missingRequired.length, 0, "complete MATER draft should not have missing required fields");

const invalidResult = validateMaterContractDraft({
  ...validMater,
  buyerNemo: "BAD",
  endDate: "2025-01-01",
  monthlyEnergyMwh: -10,
  basePrice: 0,
  priceCurrency: "EUR",
});

assertEqual(invalidResult.valid, false, "invalid MATER draft should fail");
assertIncludes(invalidResult.errors, "buyer_nemo_invalid", "invalid buyer NEMO should be detected");
assertIncludes(invalidResult.errors, "date_range_invalid", "invalid date range should be detected");
assertIncludes(invalidResult.errors, "monthly_energy_invalid", "negative monthly energy should be detected");
assertIncludes(invalidResult.errors, "base_price_invalid", "zero price should be detected");
assertIncludes(invalidResult.errors, "price_currency_invalid", "unsupported currency should be detected");

const indexedResult = validateMaterContractDraft({
  ...validMater,
  priceType: "indexado",
  adjustmentIndex: "",
  adjustmentFrequency: "",
});

assertIncludes(indexedResult.errors, "adjustment_index_required", "indexed contract should require adjustment index");
assertIncludes(indexedResult.errors, "adjustment_frequency_required", "indexed contract should require adjustment frequency");

const renewableResult = validateMaterContractDraft({
  ...validMater,
  technology: "",
});

assertIncludes(renewableResult.errors, "technology_required", "renewable contract should require technology");

const incompleteReadiness = buildMaterContractReadiness({
  ...validMater,
  sellerNemo: "",
  generatorGroup: "",
  basePrice: null,
  sourceDocumentName: "",
});

assertEqual(incompleteReadiness.overallPct < 100, true, "incomplete MATER draft should expose partial readiness");
assertEqual(
  incompleteReadiness.sections.some((section) => section.id === "partes" && section.status === "parcial"),
  true,
  "contract parties section should show partial state when seller/generator data is missing",
);
assertEqual(
  incompleteReadiness.missingRequired.includes("Precio base"),
  true,
  "contract readiness should list missing price base",
);

const completeness = buildDataRoomCompleteness({
  sitesCount: 1,
  activeContractsCount: 1,
  invoicesLast12mCount: 4,
  forecastsCount: 0,
  openClaimsCount: 2,
  smecDocumentsCount: 0,
  responsiblesCount: 1,
  evidenceDocumentsCount: 3,
});

assertEqual(completeness.overallPct, 67, "completeness should average the eight private data blocks");
assertEqual(completeness.blocks.contracts.status, "completo", "active contracts should complete contracts block");
assertEqual(completeness.blocks.forecast.status, "pendiente", "missing forecast should be pending");
