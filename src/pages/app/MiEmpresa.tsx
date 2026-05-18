import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Edit3,
  Factory,
  FileSpreadsheet,
  FileText,
  Gauge,
  Landmark,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import { ModuleHeader } from "../../components/app/ModuleHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useAppContext } from "../../context/AppContext";
import {
  buildDataRoomCompleteness,
  buildMaterContractReadiness,
  validateMaterContractDraft,
} from "../../services/dataRoom.validation";
import { fetchDataRoom, saveMaterContract } from "../../services/dataRoom";
import type {
  DataRoomCompletenessBlock,
  EnergyCurrency,
  MaterContractDraft,
  MaterContractType,
  MaterPriceType,
  MaterTechnology,
  PrivateDataStatus,
  SavedMaterContract,
} from "../../types/dataRoom";

type FormSection = {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

const emptyMaterDraft: MaterContractDraft = {
  contractName: "",
  contractType: "RENOVABLE",
  status: "borrador",
  buyerNemo: "",
  sellerNemo: "",
  generatorGroup: "",
  marketerNemo: "",
  startDate: "",
  endDate: "",
  signedDate: "",
  monthlyEnergyMwh: null,
  annualEnergyMwh: null,
  contractedPowerMw: null,
  priceCurrency: "USD",
  basePrice: null,
  priceType: "fijo",
  renewable: true,
  technology: "",
  internalOwnerEmail: "",
  renewalDeadline: "",
  adjustmentIndex: "",
  adjustmentFrequency: "",
  sourceDocumentName: "",
};

const privateBlocks = [
  {
    key: "sites",
    title: "Sitios y suministro",
    description: "NEMO, planta, medidores, distribuidora y potencia contratada.",
    icon: Building2,
  },
  {
    key: "contracts",
    title: "Contratos",
    description: "MATER, PPA, distribuidora, precios, formulas y vencimientos.",
    icon: FileText,
  },
  {
    key: "invoices",
    title: "Facturas y liquidaciones",
    description: "Facturas privadas, DTE, liquidaciones CAMMESA y conceptos.",
    icon: FileSpreadsheet,
  },
  {
    key: "forecast",
    title: "Forecast y provisiones",
    description: "Presupuesto, demanda esperada, escenarios y provisiones.",
    icon: Gauge,
  },
  {
    key: "claims",
    title: "Reclamos",
    description: "Casos abiertos, estado, responsable y fecha limite.",
    icon: ClipboardList,
  },
  {
    key: "smec",
    title: "SMEC y auditorias",
    description: "Documentacion tecnica, auditorias y observaciones.",
    icon: Landmark,
  },
  {
    key: "responsibles",
    title: "Responsables",
    description: "Duenos internos por energia, finanzas, planta y asesores.",
    icon: Users,
  },
  {
    key: "documents",
    title: "Documentos",
    description: "PDF/Excel como evidencia vinculada a datos estructurados.",
    icon: Upload,
  },
] as const;

const errorCopy: Record<string, string> = {
  contract_name_required: "Completá el nombre del contrato.",
  buyer_nemo_invalid: "El NEMO comprador debe tener 8 caracteres alfanuméricos.",
  seller_nemo_invalid: "El NEMO generador debe tener 8 caracteres alfanuméricos.",
  marketer_nemo_invalid: "El NEMO comercializador debe tener 8 caracteres o quedar vacío.",
  date_range_invalid: "La vigencia debe tener fechas válidas y fin posterior al inicio.",
  monthly_energy_invalid: "La energía mensual contratada debe ser mayor a cero.",
  base_price_invalid: "El precio base debe ser mayor a cero.",
  price_currency_invalid: "La moneda debe ser ARS o USD.",
  adjustment_index_required: "Los contratos indexados o con fórmula necesitan índice.",
  adjustment_frequency_required: "Los contratos indexados o con fórmula necesitan frecuencia.",
  technology_required: "Un contrato renovable necesita tecnología declarada.",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function inputClass(hasError = false) {
  return `w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-slate-200 focus:border-[#15caca] focus:ring-[#15caca]/20"
  }`;
}

function blockTone(status: string): "success" | "warning" | "neutral" {
  if (status === "completo") return "success";
  if (status === "parcial") return "warning";
  return "neutral";
}

function formatMoney(contract: MaterContractDraft) {
  if (!contract.basePrice) return "Precio pendiente";
  return `${contract.priceCurrency} ${contract.basePrice}/MWh`;
}

function formatEnergy(value: number | null) {
  if (value == null) return "MWh pendiente";
  return `${value.toLocaleString("es-AR")} MWh/mes`;
}

function MissingBlock({ block }: { block: DataRoomCompletenessBlock }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[#163759]">{block.label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{block.detail}</p>
      </div>
      <Badge tone={blockTone(block.status)}>{block.status}</Badge>
    </div>
  );
}

export default function MiEmpresa() {
  const { agente } = useAppContext();
  const formRef = useRef<HTMLElement | null>(null);
  const [contracts, setContracts] = useState<SavedMaterContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MaterContractDraft>(() => ({
    ...emptyMaterDraft,
    buyerNemo: agente?.nemo ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);

  const validation = useMemo(() => validateMaterContractDraft(draft), [draft]);
  const readiness = useMemo(() => buildMaterContractReadiness(draft), [draft]);
  const errorSet = useMemo(() => new Set(validation.errors), [validation.errors]);

  useEffect(() => {
    if (!agente?.nemo) return;
    let active = true;
    setLoadingContracts(true);
    setLoadError("");
    fetchDataRoom({ nemo: agente.nemo })
      .then((data) => {
        if (active) setContracts(data.contratos);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar Mi empresa.");
        }
      })
      .finally(() => {
        if (active) setLoadingContracts(false);
      });
    return () => {
      active = false;
    };
  }, [agente?.nemo]);

  const completeness = useMemo(
    () =>
      buildDataRoomCompleteness({
        sitesCount: agente ? 1 : 0,
        activeContractsCount: contracts.filter((contract) => validateMaterContractDraft(contract).valid).length,
        invoicesLast12mCount: 0,
        forecastsCount: 0,
        openClaimsCount: 0,
        smecDocumentsCount: 0,
        responsiblesCount: new Set(contracts.map((contract) => contract.internalOwnerEmail).filter(Boolean)).size,
        evidenceDocumentsCount: contracts.filter((contract) => contract.sourceDocumentName.trim()).length,
      }),
    [agente, contracts],
  );

  const updateText =
    (key: keyof MaterContractDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((current) => ({ ...current, [key]: event.target.value }));
    };

  const updateNumber =
    (key: keyof MaterContractDraft) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
    };

  const startNewContract = () => {
    setDraft({ ...emptyMaterDraft, buyerNemo: agente?.nemo ?? "" });
    setEditingId(null);
    setSubmitted(false);
    setShowForm(true);
  };

  const editContract = (contract: SavedMaterContract) => {
    setDraft(contract);
    setEditingId(contract.id);
    setSubmitted(false);
    setShowForm(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError("");

    if (!draft.contractName.trim()) return;

    setSaving(true);
    try {
      const saved = await saveMaterContract({ ...draft, id: editingId });
      setContracts((current) =>
        current.some((contract) => contract.id === saved.id)
          ? current.map((contract) => (contract.id === saved.id ? saved : contract))
          : [saved, ...current],
      );
      setEditingId(saved.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el contrato.");
    } finally {
      setSaving(false);
    }
  };

  const blocks = Object.entries(completeness.blocks);
  const missingBlocks = blocks.filter(([, value]) => value.status !== "completo");

  useEffect(() => {
    if (!showForm) return;
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showForm, editingId]);

  const formSections: FormSection[] = [
    {
      id: "identificacion",
      title: "1. Identificación",
      description: "Nombre interno, tipo de contrato y estado de gestión.",
      children: (
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre del contrato">
            <input
              className={inputClass(errorSet.has("contract_name_required"))}
              onChange={updateText("contractName")}
              placeholder="Ej: MATER renovable 2026"
              value={draft.contractName}
            />
          </Field>
          <Field label="Tipo">
            <select
              className={inputClass()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  contractType: event.target.value as MaterContractType,
                  renewable: event.target.value === "RENOVABLE" ? true : current.renewable,
                }))
              }
              value={draft.contractType}
            >
              <option value="BASE">BASE</option>
              <option value="PLUS">PLUS</option>
              <option value="RENOVABLE">RENOVABLE</option>
              <option value="DELIVERY">DELIVERY</option>
              <option value="COMPROMISO">COMPROMISO</option>
              <option value="OTRO">OTRO</option>
            </select>
          </Field>
          <Field label="Estado">
            <select
              className={inputClass()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as PrivateDataStatus,
                }))
              }
              value={draft.status}
            >
              <option value="borrador">Borrador</option>
              <option value="activo">Activo</option>
              <option value="vencido">Vencido</option>
              <option value="rescindido">Rescindido</option>
              <option value="en_revision">En revisión</option>
            </select>
          </Field>
        </div>
      ),
    },
    {
      id: "partes",
      title: "2. Partes del contrato",
      description: "Quién compra, quién genera y si hay comercializador.",
      children: (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="NEMO comprador" hint="Debe coincidir con el agente vinculado cuando aplique.">
            <input
              className={inputClass(errorSet.has("buyer_nemo_invalid"))}
              maxLength={8}
              onChange={updateText("buyerNemo")}
              placeholder="8 caracteres"
              value={draft.buyerNemo}
            />
          </Field>
          <Field label="NEMO generador">
            <input
              className={inputClass(errorSet.has("seller_nemo_invalid"))}
              maxLength={8}
              onChange={updateText("sellerNemo")}
              placeholder="8 caracteres"
              value={draft.sellerNemo}
            />
          </Field>
          <Field label="Conjunto generador">
            <input
              className={inputClass()}
              onChange={updateText("generatorGroup")}
              placeholder="Parque / central / conjunto"
              value={draft.generatorGroup}
            />
          </Field>
          <Field label="Comercializador NEMO" hint="Opcional. Si se informa, debe tener 8 caracteres.">
            <input
              className={inputClass(errorSet.has("marketer_nemo_invalid"))}
              maxLength={8}
              onChange={updateText("marketerNemo")}
              placeholder="Opcional"
              value={draft.marketerNemo}
            />
          </Field>
        </div>
      ),
    },
    {
      id: "vigencia",
      title: "3. Vigencia y vencimientos",
      description: "Fechas que permiten alertas, renovaciones y análisis histórico.",
      children: (
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Fecha firma">
            <input className={inputClass()} onChange={updateText("signedDate")} type="date" value={draft.signedDate} />
          </Field>
          <Field label="Vigencia inicio">
            <input
              className={inputClass(errorSet.has("date_range_invalid"))}
              onChange={updateText("startDate")}
              type="date"
              value={draft.startDate}
            />
          </Field>
          <Field label="Vigencia fin">
            <input
              className={inputClass(errorSet.has("date_range_invalid"))}
              onChange={updateText("endDate")}
              type="date"
              value={draft.endDate}
            />
          </Field>
        </div>
      ),
    },
    {
      id: "energia",
      title: "4. Energía y potencia",
      description: "Volumen contratado para comparar contra demanda real y entrega CAMMESA.",
      children: (
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Energía mensual MWh">
            <input
              className={inputClass(errorSet.has("monthly_energy_invalid"))}
              min="0"
              onChange={updateNumber("monthlyEnergyMwh")}
              placeholder="1250"
              type="number"
              value={draft.monthlyEnergyMwh ?? ""}
            />
          </Field>
          <Field label="Energía anual MWh">
            <input
              className={inputClass()}
              min="0"
              onChange={updateNumber("annualEnergyMwh")}
              placeholder="15000"
              type="number"
              value={draft.annualEnergyMwh ?? ""}
            />
          </Field>
          <Field label="Potencia contratada MW">
            <input
              className={inputClass()}
              min="0"
              onChange={updateNumber("contractedPowerMw")}
              placeholder="6.4"
              step="0.1"
              type="number"
              value={draft.contractedPowerMw ?? ""}
            />
          </Field>
        </div>
      ),
    },
    {
      id: "precio",
      title: "5. Precio, moneda y fórmula",
      description: "Base del P&L contractual; internamente se normaliza por moneda y unidad.",
      children: (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Moneda precio">
            <select
              className={inputClass(errorSet.has("price_currency_invalid"))}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priceCurrency: event.target.value as EnergyCurrency,
                }))
              }
              value={draft.priceCurrency}
            >
              <option value="USD">USD/MWh</option>
              <option value="ARS">ARS/MWh</option>
            </select>
          </Field>
          <Field label="Precio base">
            <input
              className={inputClass(errorSet.has("base_price_invalid"))}
              min="0"
              onChange={updateNumber("basePrice")}
              placeholder="58"
              step="0.01"
              type="number"
              value={draft.basePrice ?? ""}
            />
          </Field>
          <Field label="Tipo de precio">
            <select
              className={inputClass()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priceType: event.target.value as MaterPriceType,
                }))
              }
              value={draft.priceType}
            >
              <option value="fijo">Fijo</option>
              <option value="indexado">Indexado</option>
              <option value="por_banda">Por banda horaria</option>
              <option value="escalonado">Escalonado</option>
              <option value="formula">Fórmula</option>
            </select>
          </Field>
          <Field label="Índice de ajuste">
            <input
              className={inputClass(errorSet.has("adjustment_index_required"))}
              onChange={updateText("adjustmentIndex")}
              placeholder="IPC / dólar / fórmula contractual"
              value={draft.adjustmentIndex}
            />
          </Field>
          <Field label="Frecuencia de ajuste">
            <input
              className={inputClass(errorSet.has("adjustment_frequency_required"))}
              onChange={updateText("adjustmentFrequency")}
              placeholder="Mensual / trimestral / anual"
              value={draft.adjustmentFrequency}
            />
          </Field>
        </div>
      ),
    },
    {
      id: "evidencia",
      title: "6. Renovable, responsable y evidencia",
      description: "Datos para cumplimiento, seguimiento interno y respaldo documental.",
      children: (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tecnología">
            <select
              className={inputClass(errorSet.has("technology_required"))}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  technology: event.target.value as MaterTechnology | "",
                }))
              }
              value={draft.technology}
            >
              <option value="">Sin declarar</option>
              <option value="solar">Solar</option>
              <option value="eolica">Eólica</option>
              <option value="hidro">Hidro</option>
              <option value="biomasa">Biomasa</option>
              <option value="termica">Térmica</option>
              <option value="mixta">Mixta</option>
              <option value="desconocida">Desconocida</option>
            </select>
          </Field>
          <Field label="Responsable interno">
            <input
              className={inputClass()}
              onChange={updateText("internalOwnerEmail")}
              placeholder="energia@empresa.com"
              type="email"
              value={draft.internalOwnerEmail}
            />
          </Field>
          <Field label="Fecha límite renovación">
            <input className={inputClass()} onChange={updateText("renewalDeadline")} type="date" value={draft.renewalDeadline} />
          </Field>
          <Field label="Documento respaldo" hint="El archivo real se vincula al repositorio documental y su metadata queda en Railway.">
            <input
              className={inputClass()}
              onChange={updateText("sourceDocumentName")}
              placeholder="contrato_mater.pdf"
              value={draft.sourceDocumentName}
            />
          </Field>
        </div>
      ),
    },
  ];

  return (
    <div>
      <ModuleHeader
        title="Mi empresa"
        subtitle="Inventario privado: contratos, facturas, forecast, reclamos, SMEC y evidencia"
        tooltip="Los documentos respaldan datos estructurados. EnergyOS no depende de interpretar PDFs con formatos distintos para calcular KPIs."
      />

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Factory className="text-[#0e8a8a]" size={19} />
              <h2 className="text-base font-bold text-[#163759]">Estado de información privada</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
              Primero se muestra qué información existe y qué falta. La carga se abre
              desde acciones concretas para evitar que el usuario caiga directo en un
              formulario largo sin contexto.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Badge tone={completeness.overallPct >= 60 ? "success" : "warning"}>
              {completeness.overallPct}% completo
            </Badge>
            <Button onClick={startNewContract} type="button">
              <Plus size={15} />
              Cargar información
            </Button>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#15caca]" style={{ width: `${completeness.overallPct}%` }} />
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#163759]">Contratos cargados</h2>
              <p className="mt-1 text-sm text-slate-500">
                Lista operativa de MATER/PPA/distribuidora. En este corte se carga MATER en sesión local.
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={startNewContract}
              type="button"
            >
              <Plus size={15} />
              Agregar contrato
            </button>
          </div>

          {loadError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          {loadingContracts ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              Cargando contratos privados desde Railway...
            </div>
          ) : contracts.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <FileText className="mx-auto text-slate-400" size={28} />
              <p className="mt-3 text-sm font-semibold text-slate-700">Todavía no hay contratos cargados</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
                Cargá el contrato principal para habilitar vencimientos, cobertura,
                precio pactado y comparación contra entrega CAMMESA.
              </p>
              <button
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#163759] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d2136]"
                onClick={startNewContract}
                type="button"
              >
                <Plus size={15} />
                Cargar contrato MATER
              </button>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_0.8fr_80px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                <span>Contrato</span>
                <span>Vigencia</span>
                <span>Precio</span>
                <span>Completitud</span>
                <span />
              </div>
              {contracts.map((contract) => {
                const contractReadiness = buildMaterContractReadiness(contract);
                const valid = validateMaterContractDraft(contract).valid;
                return (
                  <div
                    key={contract.id}
                    className="grid grid-cols-[1.3fr_0.8fr_0.9fr_0.8fr_80px] items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#163759]">{contract.contractName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {contract.contractType} · {contract.sellerNemo || "Generador pendiente"}
                      </p>
                    </div>
                    <span className="text-xs text-slate-600">
                      {contract.startDate || "Inicio"} → {contract.endDate || "Fin"}
                    </span>
                    <span className="font-mono text-xs text-slate-700">{formatMoney(contract)}</span>
                    <div>
                      <Badge tone={valid ? "success" : "warning"}>{contractReadiness.overallPct}%</Badge>
                    </div>
                    <button
                      className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#0e8a8a] hover:bg-[#15caca]/10"
                      onClick={() => editContract(contract)}
                      type="button"
                    >
                      <Edit3 size={13} />
                      Editar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-[#163759]">Resumen disponible</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-xs text-slate-500">Empresa</dt>
                <dd className="mt-1 truncate text-sm font-semibold text-[#163759]">
                  {agente?.descripcion ?? "Pendiente"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-xs text-slate-500">NEMO</dt>
                <dd className="mt-1 font-mono text-sm font-semibold text-[#163759]">
                  {agente?.nemo ?? "Pendiente"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-xs text-slate-500">Contratos</dt>
                <dd className="mt-1 text-sm font-semibold text-[#163759]">{contracts.length}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-xs text-slate-500">Documentos</dt>
                <dd className="mt-1 text-sm font-semibold text-[#163759]">
                  {contracts.filter((contract) => contract.sourceDocumentName.trim()).length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-base font-bold text-[#163759]">Información que falta</h2>
            <div className="mt-3 space-y-2">
              {missingBlocks.length === 0 ? (
                <p className="text-sm text-slate-500">La información privada mínima está completa.</p>
              ) : (
                missingBlocks.slice(0, 5).map(([key, value]) => <MissingBlock key={key} block={value} />)
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {privateBlocks.map((blockItem) => {
          const Icon = blockItem.icon;
          const state = completeness.blocks[blockItem.key];
          return (
            <div key={blockItem.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                  <Icon size={17} />
                </span>
                <Badge tone={blockTone(state.status)}>{state.status}</Badge>
              </div>
              <h3 className="mt-3 text-sm font-bold text-[#163759]">{blockItem.title}</h3>
              <p className="mt-1 min-h-10 text-xs leading-relaxed text-slate-500">{blockItem.description}</p>
              <p className="mt-3 text-xs font-semibold text-slate-600">{state.detail}</p>
            </div>
          );
        })}
      </section>

      {showForm ? (
        <section ref={formRef} className="scroll-mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#163759]">
                  {editingId ? "Editar contrato MATER" : "Nuevo contrato MATER"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Dividido por bloques para separar identificación, partes, vigencia,
                  energía, precio, fórmula y evidencia.
                </p>
              </div>
              <Badge tone={validation.valid ? "success" : "warning"}>
                {validation.valid ? "Listo para guardar" : `${readiness.overallPct}% completo`}
              </Badge>
            </div>

            <div className="space-y-4">
              {formSections.map((section) => (
                <details
                  key={section.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 open:bg-slate-50/40"
                  open
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#163759]">{section.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
                    </div>
                    <ChevronDown className="mt-1 shrink-0 text-slate-400" size={16} />
                  </summary>
                  <div className="mt-4">{section.children}</div>
                </details>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Precio normalizado:{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {validation.normalized.priceUsdMwh != null
                    ? `USD ${validation.normalized.priceUsdMwh}/MWh`
                    : validation.normalized.priceArsMwh != null
                      ? `ARS ${validation.normalized.priceArsMwh}/MWh`
                      : "pendiente"}
                </span>
                {" · "}
                <span className="font-mono font-semibold text-slate-700">{formatEnergy(draft.monthlyEnergyMwh)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  onClick={() => setShowForm(false)}
                  type="button"
                >
                  Cerrar
                </button>
                <Button disabled={saving} type="submit">
                  {saving ? "Guardando..." : editingId ? "Actualizar contrato" : "Agregar a lista"}
                </Button>
              </div>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                {validation.valid ? (
                  <CheckCircle2 className="text-emerald-500" size={18} />
                ) : (
                  <AlertTriangle className="text-amber-500" size={18} />
                )}
                <h2 className="text-sm font-bold text-[#163759]">Faltantes del contrato</h2>
              </div>

              {readiness.missingRequired.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  El contrato tiene los campos mínimos para alimentar cobertura,
                  vencimientos y P&L MATER cuando se conecte la persistencia.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {readiness.missingRequired.slice(0, 8).map((missing) => (
                    <li key={missing} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {missing}
                    </li>
                  ))}
                </ul>
              )}

              {submitted && validation.errors.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {validation.errors.map((error) => (
                    <p key={error} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {errorCopy[error]}
                    </p>
                  ))}
                </div>
              ) : null}

              {saveError ? (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {saveError}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[#163759]">Completitud por sección</h2>
              <div className="mt-3 space-y-2">
                {readiness.sections.map((section) => (
                  <div key={section.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500">{section.label}</span>
                    <Badge tone={blockTone(section.status)}>{section.pct}%</Badge>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
