import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, ".env"));

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Faltan SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
}

const dryRun = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyTables = new Set(
  onlyArg
    ? onlyArg
        .slice("--only=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [],
);

const batchSize = Number.parseInt(process.env.CAMMESA_IMPORT_BATCH_SIZE ?? "500", 10);
const csvDir = process.env.CAMMESA_CSV_DIR ?? "C:/Users/quime/Downloads";
const tempDir = "/tmp";

const URLS = {
  balance: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/863d7b10-4df9-4dad-8418-5e8a6cc730da/download/balance.csv",
  agentes_mem: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/ac27b401-3800-4a98-9535-3fc715228d84/download/agentes-mem.csv",
  demanda_ultimos: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/ae008cdf-ed5d-4a85-90ee-5f4c53704e79/download/demanda-ltimos-aos.csv",
  demanda_historica: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/30e1c42d-44a7-428f-a55a-12c81dc14186/download/demanda-histrica.csv",
  generacion_ultimos: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/7da95282-a903-47f0-b4bc-cd1387a62dd3/download/generacin-ltimos-aos.csv",
  potencia_instalada: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/b05fbb16-7278-463f-8895-087e2495bfee/download/potencia-instalada.csv",
};

const remoteSources = new Map([
  ["cammesa_balance_energia", { url: URLS.balance, fileName: "balance.csv" }],
  ["cammesa_agentes_mem", { url: URLS.agentes_mem, fileName: "agentes-mem.csv" }],
  ["cammesa_demanda_ultimos_anos", { url: URLS.demanda_ultimos, fileName: "demanda-ultimos-anos.csv" }],
  ["cammesa_demanda_historica", { url: URLS.demanda_historica, fileName: "demanda-historica.csv" }],
  ["cammesa_generacion", { url: URLS.generacion_ultimos, fileName: "generacion-ultimos-anos.csv" }],
  ["cammesa_potencia_instalada", { url: URLS.potencia_instalada, fileName: "potencia-instalada.csv" }],
]);

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const datasets = [
  {
    key: "cammesa_demanda_ultimos_anos",
    table: "cammesa_demanda_ultimos_anos",
    fileName: "demanda-ultimos-anos.csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      agente_nemo: parseText(row.agente_nemo),
      agente_descripcion: parseText(row.agente_descripcion),
      tipo_agente: parseText(row.tipo_agente),
      region: parseText(row.region),
      provincia: parseText(row.provincia),
      categoria_area: parseText(row.categoria_area),
      categoria_demanda: parseText(row.categoria_demanda),
      tarifa: parseText(row.tarifa),
      categoria_tarifa: parseText(row.categoria_tarifa),
      demanda_mwh: parseNumeric(row.demanda_MWh),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
  {
    key: "cammesa_combustibles",
    table: "cammesa_combustibles",
    fileName: "combustibles.csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      maquina: parseText(row.maquina),
      central: parseText(row.central),
      agente: parseText(row.agente),
      agente_descripcion: parseText(row.agente_descripcion),
      tipo_maquina: parseText(row.tipo_maquina),
      fuente_generacion: parseText(row.fuente_generacion),
      tecnologia: parseText(row.tecnologia),
      combustible: parseText(row.combustible),
      consumo: parseNumeric(row.consumo),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
  {
    key: "cammesa_agentes_mem",
    table: "cammesa_agentes_mem",
    fileName: "agentes-mem.csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      nemo: parseText(row.nemo),
      descripcion: parseText(row.descipcion),
      agrupacion: parseText(row.agrupacion),
      tipo_agente: parseText(row.tipo_agente),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
    }),
  },
  {
    key: "cammesa_balance_energia",
    table: "cammesa_balance_energia",
    fileName: "balance (2).csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      balance: parseText(row.balance),
      tipo: parseText(row.tipo),
      energia_mwh: parseNumeric(row.energia_mwh),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
  {
    key: "cammesa_potencia_instalada",
    table: "cammesa_potencia_instalada",
    fileName: "potencia-instalada.csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      periodo: parseText(row.periodo),
      central: parseText(row.central),
      agente: parseText(row.agente),
      agente_descripcion: parseText(row.agente_descripcion),
      region: parseText(row.region),
      categoria_region: parseText(row.categoria_region),
      tipo_maquina: parseText(row.tipo_maquina),
      fuente_generacion: parseText(row.fuente_generacion),
      tecnologia: parseText(row.tecnologia),
      potencia_instalada_mw: parseNumeric(row.potencia_instalada_mw),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      mes: parseInteger(row.mes),
      indice_tiempo: parseText(row.indice_tiempo),
      anio: parseInteger(row.anio),
    }),
  },
  {
    key: "cammesa_demanda_historica",
    table: "cammesa_demanda_historica",
    fileName: "demanda-historica.csv",
    onConflict: "anio,mes,agente_nemo,indice_tiempo",
    dedupeBy: (record) => `${record.anio}|${record.mes}|${record.agente_nemo}|${record.indice_tiempo}`,
    mapRow: (row) => ({
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      agente_nemo: parseText(row.agente_nemo),
      agente_descripcion: parseText(row.agente_descripcion),
      tipo_agente: parseText(row.tipo_agente),
      region: parseText(row.region),
      provincia: parseText(row.provincia),
      categoria_area: parseText(row.categoria_area),
      categoria_demanda: parseText(row.categoria_demanda),
      tarifa: parseText(row.tarifa),
      categoria_tarifa: parseText(row.categoria_tarifa),
      demanda_mwh: parseNumeric(row.demanda_MWh),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
  {
    key: "cammesa_importaciones_exportaciones",
    table: "cammesa_importaciones_exportaciones",
    fileName: "importaciones-exportaciones.csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      pais: parseText(row.pais),
      tipo: parseText(row.tipo),
      energia_mwh: parseNumeric(row.energia_mwh),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
  {
    key: "cammesa_demanda_temperatura",
    table: "cammesa_demanda_temperatura",
    fileName: "DemandaYTemperatura_23042026_7ed5cd79_15e4_4b48_ac07_78ed994d6 (1).csv",
    delimiter: ";",
    onConflict: "fecha",
    mapRow: (row) => ({
      fecha: parseText(row.fecha),
      prevista: parseNumeric(row.Prevista),
      semana_ant: parseNumeric(row["Semana Ant"]),
      ayer: parseNumeric(row.Ayer),
      hoy: parseNumeric(row.Hoy),
      tem_prevista: parseNumeric(row["Tem. Prevista"]),
      tem_semana_ant: parseNumeric(row["Tem. Semana Ant."]),
      tem_ayer: parseNumeric(row["Tem. Ayer"]),
      tem_hoy: parseNumeric(row["Tem. Hoy"]),
    }),
  },
  {
    key: "cammesa_porcentaje_generacion",
    table: "cammesa_porcentaje_generacion",
    fileName: "PorcentajeGeneración_23042026_d4f0c95e_f0bd_4ee8_a203_86aad01c (1).csv",
    delimiter: ";",
    onConflict: "fecha",
    mapRow: (row) => ({
      fecha: parseText(row.fecha),
      nuclear: parseNumeric(row.Nuclear),
      termico: parseNumeric(row["Térmico"]),
      renovable_hidro_50mw: parseNumeric(row["Renovable Hidro>50MW"]),
      renovable_ley_26190: parseNumeric(row["Renovable Ley 26.190"]),
      importacion: parseNumeric(row["Importación"]),
    }),
  },
  {
    key: "cammesa_generacion",
    table: "cammesa_generacion",
    fileName: "Generación_23042026---6ba3bb3f-c4b2-43ce-a5f9-c306b3129b30 (1).csv",
    onConflict: "id",
    mapRow: (row) => ({
      id: parseInteger(row.id),
      anio: parseInteger(row.anio),
      mes: parseInteger(row.mes),
      maquina: parseText(row.maquina),
      central: parseText(row.central),
      agente: parseText(row.agente),
      agente_descripcion: parseText(row.agente_descripcion),
      region: parseText(row.region),
      pais: parseText(row.pais),
      tipo_maquina: parseText(row.tipo_maquina),
      fuente_generacion: parseText(row.fuente_generacion),
      tecnologia: parseText(row.tecnologia),
      categoria_hidraulica: parseText(row.categoria_hidraulica),
      categoria_region: parseText(row.categoria_region),
      generacion_neta_mwh: parseNumeric(row.generacion_neta_MWh),
      fecha_proceso: parseText(row.fecha_proceso),
      lote_id_log: parseInteger(row.lote_id_log),
      indice_tiempo: parseText(row.indice_tiempo),
    }),
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const selectedDatasets = datasets.filter((dataset) => onlyTables.size === 0 || onlyTables.has(dataset.key));

  if (selectedDatasets.length === 0) {
    throw new Error("No hay datasets seleccionados para importar.");
  }

  await fs.mkdir(tempDir, { recursive: true });
  console.log(dryRun ? "Modo simulacion activado." : "Importacion a Supabase iniciada.");

  for (const dataset of selectedDatasets) {
    const csvPath = await resolveCsvPath(dataset);
    const contents = await fs.readFile(csvPath, "utf8");
    const rows = parseCsv(contents, dataset.delimiter ?? ",");

    if (rows.length < 2) {
      console.log(`[${dataset.key}] sin filas para importar.`);
      continue;
    }

    const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
    const rawDataRows = rows.slice(1).filter((row) => row.some((value) => value.trim() !== ""));
    const parsedRecords = rawDataRows
      .map((row) => dataset.mapRow(buildRowObject(headers, row)))
      .filter((record) => (dataset.filterRecord ? dataset.filterRecord(record) : true));
    const records = dataset.dedupeBy ? dedupeRecords(parsedRecords, dataset.dedupeBy) : parsedRecords;

    console.log(`[${dataset.key}] ${records.length} filas detectadas en ${csvPath}`);

    if (dryRun) {
      continue;
    }

    let imported = 0;
    for (let index = 0; index < records.length; index += batchSize) {
      const batch = records.slice(index, index + batchSize);
      const { error } = await supabase.from(dataset.table).upsert(batch, {
        onConflict: dataset.onConflict,
        defaultToNull: true,
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(`[${dataset.key}] fallo el lote ${index}-${index + batch.length - 1}: ${error.message}`);
      }

      imported += batch.length;
      console.log(`[${dataset.key}] ${imported}/${records.length} filas importadas`);
    }
  }

  console.log("Importacion finalizada.");
}

async function resolveCsvPath(dataset) {
  const remoteSource = remoteSources.get(dataset.key);
  if (!remoteSource) {
    return path.join(csvDir, dataset.fileName);
  }

  const targetPath = path.join(tempDir, remoteSource.fileName);
  const response = await fetch(remoteSource.url);
  if (!response.ok) {
    throw new Error(`[${dataset.key}] no se pudo descargar ${remoteSource.url}: ${response.status}`);
  }

  const text = await response.text();
  await fs.writeFile(targetPath, text, "utf8");
  console.log(`[${dataset.key}] descargado a ${targetPath}`);
  return targetPath;
}

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = stripMatchingQuotes(value);
      }
    }
  } catch {
    // El archivo de entorno es opcional.
  }
}

function stripMatchingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function buildRowObject(headers, row) {
  const output = {};
  for (let index = 0; index < headers.length; index += 1) {
    output[headers[index]] = row[index] ?? "";
  }
  return output;
}

function parseText(value) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseInteger(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNumeric(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(",", ".");
}

function dedupeRecords(records, buildKey) {
  const seen = new Set();
  const deduped = [];

  for (const record of records) {
    const key = buildKey(record);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}
