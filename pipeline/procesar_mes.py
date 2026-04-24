from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import zipfile
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
from supabase import Client, create_client


DTE_COL_NEMO = 0
DTE_COL_TIPO = 14
DTE_COL_NUMERO_CONTRATO = 15
DTE_COL_DEM_ABASTECIDA_TOTAL = 23
DTE_COL_SALDO_TOTAL = 25

ACTIVE_PLANS = ("compliance", "gestion", "full", "white-label")
MATER_TYPES = ("RPB", "RPE")


@dataclass(frozen=True)
class MercadoMes:
    generacion_total_gwh: float | None = None
    generacion_mater_gwh: float | None = None
    mix_termica_pct: float | None = None
    mix_hidraulica_pct: float | None = None
    mix_nuclear_pct: float | None = None
    mix_renovable_pct: float | None = None
    precio_spot_usd_mwh: float | None = None
    costo_renovable_usd_mwh: float | None = None
    costo_cammesa_usd_mwh: float | None = None
    precio_potencia_usd_mw_mes: float | None = None
    cargo_transporte_usd_mwh: float | None = None
    precio_gasoil_importado_usd_mwh: float | None = None
    precio_spot_pico_pesos_mwh: float | None = None
    precio_spot_valle_pesos_mwh: float | None = None
    precio_spot_resto_pesos_mwh: float | None = None
    cargo_transporte_pesos_mwh: float | None = None


@dataclass(frozen=True)
class EmpresaCammesaData:
    nemo: str
    demanda_total_mwh: float
    mater_mwh: float
    spot_mwh: float
    importe_mater_pesos: float


@dataclass(frozen=True)
class ParsedCammesaZip:
    empresas: dict[str, EmpresaCammesaData]
    total_mater_mwh: float
    total_importe_mater_pesos: float
    precio_spot_pico_pesos_mwh: float | None
    precio_spot_valle_pesos_mwh: float | None
    precio_spot_resto_pesos_mwh: float | None
    cargo_transporte_pesos_mwh: float | None


def normalize(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
        "Ã¡": "a",
        "Ã©": "e",
        "Ã­": "i",
        "Ã³": "o",
        "Ãº": "u",
        "Ã±": "n",
        "\n": " ",
        "\r": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text)


def to_float(value: Any, default: float = 0.0) -> float:
    if value is None or pd.isna(value):
        return default
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return default

    text = (
        text.replace("%", "")
        .replace("USD", "")
        .replace("usd", "")
        .replace("$", "")
        .replace("(", "")
        .replace(")", "")
        .strip()
    )
    text = re.sub(r"\s+", "", text)
    if not text:
        return default

    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")

    try:
        return float(text)
    except ValueError:
        return default


def average(*values: float | None) -> float:
    valid = [float(value) for value in values if value is not None]
    return sum(valid) / len(valid) if valid else 0.0


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Falta la variable de entorno obligatoria {name}")
    return value


def setup_logging(anio: int, mes: int) -> None:
    logs_dir = Path(__file__).resolve().parent / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"procesar_mes_{anio}_{mes:02d}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(log_path, encoding="utf-8")],
        force=True,
    )


def infer_period_from_filename(path: Path) -> tuple[int | None, int | None]:
    name = path.stem.upper()

    yymm_match = re.search(r"(?:DTE|AMAT|AGUM|ATRA)?(\d{2})(\d{2})", name)
    if yymm_match:
        return 2000 + int(yymm_match.group(1)), int(yymm_match.group(2))

    year_match = re.search(r"(20\d{2})", name)
    month_match = re.search(r"(?:^|[_\-\s])(0?[1-9]|1[0-2])(?:[_\-\s]|$)", name)
    if year_match and month_match:
        return int(year_match.group(1)), int(month_match.group(1))

    return None, None


def decode_text(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "latin-1", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def find_cammesa_members(zip_path: Path) -> dict[str, str]:
    members: dict[str, str] = {}
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            base = Path(name).name.upper()
            if base.startswith("AMAT") and base.endswith(".TXT"):
                members["AMAT"] = name
            elif base.startswith("AGUM") and base.endswith(".TXT"):
                members["AGUM"] = name
            elif base.startswith("ATRA") and base.endswith(".TXT"):
                members["ATRA"] = name
    return members


def is_cammesa_txt_zip(path: Path) -> bool:
    if path.suffix.lower() != ".zip":
        return False
    members = find_cammesa_members(path)
    return all(key in members for key in ("AMAT", "AGUM", "ATRA"))


def read_cammesa_member(zip_path: Path, member: str) -> str:
    members = find_cammesa_members(zip_path)
    if member not in members:
        raise ValueError(f"No encontré {member} dentro de {zip_path.name}")
    with zipfile.ZipFile(zip_path) as archive:
        return decode_text(archive.read(members[member]))


def parse_amat_text(text: str) -> tuple[dict[str, tuple[float, float]], float, float]:
    by_nemo: dict[str, tuple[float, float]] = {}
    total_mwh = 0.0
    total_importe = 0.0

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) < 6:
            continue

        demandante = parts[2].strip().upper()
        mater_mwh = to_float(parts[-2], default=float("nan"))
        importe_pesos = to_float(parts[-1], default=float("nan"))
        if pd.isna(mater_mwh) or pd.isna(importe_pesos) or not re.fullmatch(r"[A-Z0-9]{8}", demandante):
            continue

        current_mwh, current_importe = by_nemo.get(demandante, (0.0, 0.0))
        by_nemo[demandante] = (current_mwh + float(mater_mwh), current_importe + float(importe_pesos))
        total_mwh += float(mater_mwh)
        total_importe += float(importe_pesos)

    return by_nemo, total_mwh, total_importe


def parse_agum_text(text: str) -> tuple[dict[str, float], dict[str, float], dict[str, float | None]]:
    demanda_by_nemo: dict[str, float] = {}
    spot_by_nemo: dict[str, float] = {}
    precios: dict[str, float | None] = {"pico": None, "valle": None, "resto": None}
    reading_spot_header = False
    current_section: str | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        section_match = re.search(r"\b(A4(?:\.\d+)+)\b", raw_line.upper())
        if section_match:
            current_section = section_match.group(1)

        normalized = normalize(line)
        if "precio energia spot" in normalized:
            reading_spot_header = True
            continue

        if reading_spot_header:
            match = re.match(
                r"^\s*(Pico|Valle|Resto)\s+\(\$/MWh\):\s*([0-9][0-9\s.,]*?)(?:\s{2,}|$)",
                raw_line,
                flags=re.IGNORECASE,
            )
            if match:
                tramo = normalize(match.group(1))
                precios[tramo] = to_float(match.group(2), default=0.0)
                continue
            if all(value is not None for value in precios.values()):
                reading_spot_header = False

        # Las filas con sangria son subtotales/resumenes y no representan detalle por contrato.
        if raw_line[:1].isspace():
            continue

        if current_section == "A4.3.4.1":
            match = re.match(
                r"^([A-Z0-9]{8})\s+([A-Z0-9]{8})(?:\s+([A-Z0-9]{8}))?\s{2,}(.*)$",
                raw_line.rstrip(),
            )
            if not match:
                continue

            nemo = match.group(1).strip().upper()
            generador = (match.group(3) or "").strip().upper()
            numeric_part = match.group(4)

            value_tokens = re.split(r"\s+", numeric_part.strip())
            if len(value_tokens) < 4:
                continue

            # En A4.3.4.1 el campo 4 es la energia del bloque. Si no hay generador es SPOT/MEM.
            demanda_total = to_float(value_tokens[3], default=float("nan"))
            if pd.isna(demanda_total):
                continue

            demanda_by_nemo[nemo] = demanda_by_nemo.get(nemo, 0.0) + float(demanda_total)
            if not generador:
                spot_by_nemo[nemo] = spot_by_nemo.get(nemo, 0.0) + float(demanda_total)
            continue

        if current_section == "A4.1":
            match = re.match(
                r"^([A-Z0-9]{8})\s+([A-Z0-9]{8})\s{2,}(.*)$",
                raw_line.rstrip(),
            )
            if not match:
                continue

            nemo = match.group(1).strip().upper()
            numeric_part = match.group(3)
            value_tokens = re.split(r"\s{2,}", numeric_part.strip())
            if len(value_tokens) < 3:
                continue

            # En A4.1 las primeras tres columnas numericas son pico/valle/resto de la demanda real.
            demanda_componentes = [to_float(token, default=float("nan")) for token in value_tokens[:3]]
            if any(pd.isna(value) for value in demanda_componentes):
                continue

            demanda_total = float(sum(demanda_componentes))
            spot_total = to_float(value_tokens[2], default=float("nan"))
            if pd.isna(spot_total):
                continue

            demanda_by_nemo[nemo] = demanda_by_nemo.get(nemo, 0.0) + demanda_total
            spot_by_nemo[nemo] = spot_by_nemo.get(nemo, 0.0) + float(spot_total)

    return demanda_by_nemo, spot_by_nemo, precios


def parse_atra_text(text: str) -> float | None:
    for raw_line in text.splitlines():
        if "Precio Mensual de Transporte en Alta Tensión" not in raw_line:
            continue
        match = re.search(r":\s*([0-9][0-9\s.,]*)$", raw_line.strip())
        if match:
            return to_float(match.group(1), default=0.0)
    return None


def parse_cammesa_zip(zip_path: Path) -> ParsedCammesaZip:
    amat_text = read_cammesa_member(zip_path, "AMAT")
    agum_text = read_cammesa_member(zip_path, "AGUM")
    atra_text = read_cammesa_member(zip_path, "ATRA")

    amat_by_nemo, total_mater_mwh, total_importe = parse_amat_text(amat_text)
    demanda_by_nemo, spot_by_nemo, precios_spot = parse_agum_text(agum_text)
    cargo_transporte = parse_atra_text(atra_text)

    nemos = set(amat_by_nemo) | set(demanda_by_nemo)
    empresas: dict[str, EmpresaCammesaData] = {}
    for nemo in nemos:
        mater_mwh, importe_mater_pesos = amat_by_nemo.get(nemo, (0.0, 0.0))
        spot_total = spot_by_nemo.get(nemo, 0.0)
        demanda_total = max(demanda_by_nemo.get(nemo, 0.0), spot_total + mater_mwh)
        empresas[nemo] = EmpresaCammesaData(
            nemo=nemo,
            demanda_total_mwh=demanda_total,
            mater_mwh=mater_mwh,
            spot_mwh=spot_total,
            importe_mater_pesos=importe_mater_pesos,
        )

    logging.info(
        "ZIP CAMMESA parseado: %s Nemos, MATER total %.2f MWh, importe total %.2f pesos",
        len(empresas),
        total_mater_mwh,
        total_importe,
    )
    return ParsedCammesaZip(
        empresas=empresas,
        total_mater_mwh=total_mater_mwh,
        total_importe_mater_pesos=total_importe,
        precio_spot_pico_pesos_mwh=precios_spot["pico"],
        precio_spot_valle_pesos_mwh=precios_spot["valle"],
        precio_spot_resto_pesos_mwh=precios_spot["resto"],
        cargo_transporte_pesos_mwh=cargo_transporte,
    )


def parse_dte_mate(path: Path) -> pd.DataFrame | ParsedCammesaZip:
    if is_cammesa_txt_zip(path):
        return parse_cammesa_zip(path)

    xls = pd.ExcelFile(path)
    sheet_name = next((name for name in xls.sheet_names if "mate" in normalize(name)), xls.sheet_names[0])
    raw = pd.read_excel(path, sheet_name=sheet_name, header=None, engine="openpyxl")
    required_cols = [DTE_COL_NEMO, DTE_COL_TIPO, DTE_COL_DEM_ABASTECIDA_TOTAL, DTE_COL_SALDO_TOTAL]
    for col in required_cols:
        if col not in raw.columns:
            raise ValueError(f"El DTE no tiene la columna esperada #{col + 1} en hoja {sheet_name}")

    data = pd.DataFrame(
        {
            "nemo": raw[DTE_COL_NEMO].astype(str).str.strip().str.upper(),
            "tipo": raw[DTE_COL_TIPO].astype(str).str.strip().str.upper(),
            "numero_contrato": raw[DTE_COL_NUMERO_CONTRATO].astype(str).str.strip(),
            "dem_abastecida_total": raw[DTE_COL_DEM_ABASTECIDA_TOTAL].map(to_float),
            "saldo_total": raw[DTE_COL_SALDO_TOTAL].map(to_float),
        }
    )
    data = data[data["nemo"].str.fullmatch(r"[A-Z0-9]{8}", na=False)]
    logging.info("DTE legacy parseado desde hoja '%s': %s filas utiles", sheet_name, len(data))
    return data


def find_value_by_alias(row: pd.Series, aliases: Iterable[str]) -> float | None:
    normalized_columns = {normalize(column): column for column in row.index}
    for alias in aliases:
        alias_norm = normalize(alias)
        for normalized_column, original_column in normalized_columns.items():
            if alias_norm in normalized_column:
                value = to_float(row[original_column], default=float("nan"))
                if not pd.isna(value):
                    return value
    return None


def period_mask(df: pd.DataFrame, anio: int, mes: int) -> pd.Series:
    columns = {normalize(column): column for column in df.columns}
    anio_col = next((column for name, column in columns.items() if "anio" in name or "ano" in name or "year" in name), None)
    mes_col = next((column for name, column in columns.items() if name == "mes" or "month" in name), None)
    fecha_col = next((column for name, column in columns.items() if "fecha" in name or "periodo" in name or "date" in name), None)

    if anio_col is not None and mes_col is not None:
        anios = pd.to_numeric(df[anio_col].map(to_float), errors="coerce")
        mes_dates = pd.to_datetime(df[mes_col], errors="coerce")
        if mes_dates.notna().any():
            return (anios == anio) & (mes_dates.dt.month == mes)
        meses = pd.to_numeric(df[mes_col].map(to_float), errors="coerce")
        return (anios == anio) & (meses == mes)

    if fecha_col is not None:
        dates = pd.to_datetime(df[fecha_col], errors="coerce")
        return (dates.dt.year == anio) & (dates.dt.month == mes)

    return pd.Series([False] * len(df), index=df.index)


def get_column_value(row: pd.Series, name: str) -> float | None:
    if name not in row.index:
        return None
    value = to_float(row[name], default=float("nan"))
    return None if pd.isna(value) else value


def extract_mercado_from_variables_relevantes(path: Path, anio: int, mes: int) -> MercadoMes | None:
    try:
        df = pd.read_excel(path, sheet_name="Variables Relevantes", header=6, engine="openpyxl")
    except ValueError:
        return None

    year_col = next((column for column in df.columns if normalize(column) in ("ano", "anio")), None)
    month_col = next((column for column in df.columns if normalize(column) == "mes"), None)
    if year_col is None or month_col is None:
        return None

    dates = pd.to_datetime(df[month_col], errors="coerce")
    years = pd.to_numeric(df[year_col], errors="coerce")
    matches = df[(years == anio) & (dates.dt.month == mes)]
    if matches.empty:
        return None

    row = matches.iloc[-1]
    generacion_termica = get_column_value(row, "GeneraciÃ³n TÃ©rmica") or 0.0
    generacion_nuclear = get_column_value(row, "GeneraciÃ³n Nuclear") or 0.0
    hidraulica_mayor_50 = get_column_value(row, "Renovable HIDRO > 50") or 0.0
    renovable_ley = get_column_value(row, "GeneraciÃ³n Renovable SegÃºn Ley 26 190") or 0.0
    mix_total = generacion_termica + generacion_nuclear + hidraulica_mayor_50 + renovable_ley
    if mix_total <= 0:
        mix_total = get_column_value(row, "Oferta Total") or 0.0

    def pct(value: float) -> float:
        return value / mix_total * 100 if mix_total else 0.0

    generacion_mater = (
        get_column_value(row, "GRAN DEMANDA MEM (estimaciÃ³n GU mercado a tÃ©rmino/contrato entre privados y acuerdos especiales)")
        or 0.0
    )
    precio_spot = get_column_value(row, "GRAN DEMANDA MEM (a precio SPOT).1")
    costo_renovable = get_column_value(row, "GRAN DEMANDA MEM (*) Mercado a tÃ©rmino o contrato entre privados")
    costo_cammesa = get_column_value(row, "MONOMICO TOTAL (LOCAL).1")
    cargo_transporte = get_column_value(row, "Transporte") or 0.0

    if precio_spot is None or costo_renovable is None or costo_cammesa is None:
        return None

    return MercadoMes(
        generacion_total_gwh=get_column_value(row, "Oferta Total") or mix_total,
        generacion_mater_gwh=generacion_mater,
        mix_termica_pct=pct(generacion_termica),
        mix_hidraulica_pct=pct(hidraulica_mayor_50),
        mix_nuclear_pct=pct(generacion_nuclear),
        mix_renovable_pct=pct(renovable_ley),
        precio_spot_usd_mwh=precio_spot,
        costo_renovable_usd_mwh=costo_renovable,
        costo_cammesa_usd_mwh=costo_cammesa,
        precio_potencia_usd_mw_mes=to_float(os.getenv("ENERGYOS_PRECIO_POTENCIA_USD_MW_MES", "0")),
        cargo_transporte_usd_mwh=cargo_transporte,
        precio_gasoil_importado_usd_mwh=to_float(os.getenv("ENERGYOS_PRECIO_GASOIL_IMPORTADO_USD_MWH", "0")),
    )


def candidate_tables_from_excel(path: Path) -> list[pd.DataFrame]:
    tables: list[pd.DataFrame] = []
    xls = pd.ExcelFile(path)
    for sheet_name in xls.sheet_names:
        raw = pd.read_excel(path, sheet_name=sheet_name, header=None, engine="openpyxl")
        max_header_row = min(20, len(raw))
        for header_row in range(max_header_row):
            header = raw.iloc[header_row].fillna("").astype(str).tolist()
            if sum(1 for value in header if value.strip()) < 3:
                continue
            table = raw.iloc[header_row + 1 :].copy()
            table.columns = header
            table = table.dropna(how="all")
            if not table.empty:
                tables.append(table)
    return tables


def extract_mercado_from_cammesa_zip(path: Path) -> MercadoMes:
    parsed = parse_cammesa_zip(path)
    precio_spot_promedio = average(
        parsed.precio_spot_pico_pesos_mwh,
        parsed.precio_spot_valle_pesos_mwh,
        parsed.precio_spot_resto_pesos_mwh,
    )
    precio_mater_promedio = (
        parsed.total_importe_mater_pesos / parsed.total_mater_mwh if parsed.total_mater_mwh else 0.0
    )
    return MercadoMes(
        costo_renovable_usd_mwh=precio_mater_promedio,
        precio_spot_usd_mwh=precio_spot_promedio,
        costo_cammesa_usd_mwh=precio_spot_promedio,
        cargo_transporte_usd_mwh=parsed.cargo_transporte_pesos_mwh or 0.0,
        precio_spot_pico_pesos_mwh=parsed.precio_spot_pico_pesos_mwh,
        precio_spot_valle_pesos_mwh=parsed.precio_spot_valle_pesos_mwh,
        precio_spot_resto_pesos_mwh=parsed.precio_spot_resto_pesos_mwh,
        cargo_transporte_pesos_mwh=parsed.cargo_transporte_pesos_mwh,
    )


def extract_mercado(variables_path: Path, anio: int, mes: int) -> MercadoMes:
    if is_cammesa_txt_zip(variables_path):
        logging.info("Extrayendo precios de mercado desde ZIP CAMMESA %s", variables_path.name)
        return extract_mercado_from_cammesa_zip(variables_path)

    mercado_real = extract_mercado_from_variables_relevantes(variables_path, anio, mes)
    if mercado_real:
        logging.info("Variables Relevantes parseadas con formato CAMMESA real para %s-%02d", anio, mes)
        return mercado_real

    aliases = {
        "generacion_total_gwh": ["generacion total mem", "generacion total", "total mem", "energia generada total"],
        "generacion_mater_gwh": ["generacion mater", "energia mater", "mater gwh"],
        "mix_termica_pct": ["mix termica", "termica %", "termico %", "termica"],
        "mix_hidraulica_pct": ["mix hidraulica", "hidraulica %", "hidraulico %", "hidraulica"],
        "mix_nuclear_pct": ["mix nuclear", "nuclear %", "nuclear"],
        "mix_renovable_pct": ["mix renovable", "renovable %", "renovable ley", "renovable"],
        "precio_spot_usd_mwh": ["precio spot promedio", "spot promedio", "precio spot", "spot usd"],
        "costo_renovable_usd_mwh": ["costo renovable promedio", "costo renovable", "renovable promedio"],
        "costo_cammesa_usd_mwh": ["costo cammesa promedio", "costo cammesa", "cammesa promedio"],
        "precio_potencia_usd_mw_mes": ["precio potencia", "potencia usd", "potencia"],
        "cargo_transporte_usd_mwh": ["cargo transporte", "transporte usd", "transporte"],
        "precio_gasoil_importado_usd_mwh": ["gasoil importado", "precio gasoil", "gasoil"],
    }
    defaults = {
        "generacion_total_gwh": os.getenv("ENERGYOS_GENERACION_TOTAL_GWH"),
        "generacion_mater_gwh": os.getenv("ENERGYOS_GENERACION_MATER_GWH"),
        "mix_termica_pct": os.getenv("ENERGYOS_MIX_TERMICA_PCT"),
        "mix_hidraulica_pct": os.getenv("ENERGYOS_MIX_HIDRAULICA_PCT"),
        "mix_nuclear_pct": os.getenv("ENERGYOS_MIX_NUCLEAR_PCT"),
        "mix_renovable_pct": os.getenv("ENERGYOS_MIX_RENOVABLE_PCT"),
        "precio_spot_usd_mwh": os.getenv("ENERGYOS_PRECIO_SPOT_USD_MWH"),
        "costo_renovable_usd_mwh": os.getenv("ENERGYOS_COSTO_RENOVABLE_USD_MWH"),
        "costo_cammesa_usd_mwh": os.getenv("ENERGYOS_COSTO_CAMMESA_USD_MWH"),
        "precio_potencia_usd_mw_mes": os.getenv("ENERGYOS_PRECIO_POTENCIA_USD_MW_MES", "0"),
        "cargo_transporte_usd_mwh": os.getenv("ENERGYOS_CARGO_TRANSPORTE_USD_MWH", "0"),
        "precio_gasoil_importado_usd_mwh": os.getenv("ENERGYOS_PRECIO_GASOIL_IMPORTADO_USD_MWH", "0"),
    }

    values: dict[str, float | None] = dict.fromkeys(aliases)
    for table in candidate_tables_from_excel(variables_path):
        mask = period_mask(table, anio, mes)
        if not mask.any():
            continue
        row = table.loc[mask].iloc[-1]
        for field, field_aliases in aliases.items():
            if values[field] is None:
                values[field] = find_value_by_alias(row, field_aliases)

    missing_required: list[str] = []
    resolved: dict[str, float | None] = dict.fromkeys(aliases)
    for field in aliases:
        value = values[field]
        if value is None and defaults[field] is not None:
            value = to_float(defaults[field])
        if value is None:
            if field in {"precio_potencia_usd_mw_mes", "cargo_transporte_usd_mwh", "precio_gasoil_importado_usd_mwh"}:
                value = 0.0
            else:
                missing_required.append(field)
                value = 0.0
        resolved[field] = float(value)

    if missing_required:
        raise ValueError(
            "No pude extraer estas variables del Excel de Variables Relevantes: "
            + ", ".join(missing_required)
            + ". Se pueden completar temporalmente con variables de entorno ENERGYOS_*."
        )

    logging.info("Variables Relevantes parseadas para %s-%02d", anio, mes)
    return MercadoMes(**resolved)


def fetch_active_empresas(supabase: Client) -> list[dict[str, Any]]:
    response = (
        supabase.table("empresas")
        .select("*")
        .in_("plan_activo", list(ACTIVE_PLANS))
        .execute()
    )
    return response.data or []


def fetch_nemos(supabase: Client, empresa_id: str) -> list[str]:
    response = (
        supabase.table("nemos")
        .select("nemo")
        .eq("empresa_id", empresa_id)
        .eq("activo", True)
        .execute()
    )
    return [str(row["nemo"]).strip().upper() for row in response.data or []]


def fetch_contratos(supabase: Client, empresa_id: str, anio: int, mes: int) -> list[dict[str, Any]]:
    period_date = date(anio, mes, 1).isoformat()
    response = (
        supabase.table("contratos")
        .select("*")
        .eq("empresa_id", empresa_id)
        .eq("activo", True)
        .lte("vigencia_inicio", period_date)
        .gte("vigencia_fin", period_date)
        .execute()
    )
    return response.data or []


def fetch_historial_anual(supabase: Client, empresa_id: str, anio: int, mes: int) -> list[dict[str, Any]]:
    response = (
        supabase.table("datos_mensuales")
        .select("mes,demanda_total_mwh,mater_mwh")
        .eq("empresa_id", empresa_id)
        .eq("anio", anio)
        .lt("mes", mes)
        .order("mes")
        .execute()
    )
    return response.data or []


def weighted_contract_price(contratos: list[dict[str, Any]], dte_rows: pd.DataFrame) -> float:
    mater_contracts = [contract for contract in contratos if contract.get("tipo") in MATER_TYPES]
    if not mater_contracts:
        return 0.0

    total_mwh = 0.0
    weighted_usd = 0.0
    for contract in mater_contracts:
        digits = re.sub(r"\D", "", str(contract.get("numero_contrato", "")))
        if digits:
            contract_rows = dte_rows[
                dte_rows["numero_contrato"].astype(str).str.replace(r"\D", "", regex=True) == digits
            ]
        else:
            contract_rows = pd.DataFrame()

        mwh = float(contract_rows["dem_abastecida_total"].sum()) if not contract_rows.empty else 0.0
        if mwh <= 0:
            mwh = to_float(contract.get("volumen_mwh_mes"))
        total_mwh += mwh
        weighted_usd += mwh * to_float(contract.get("precio_usd_mwh"))

    if total_mwh <= 0:
        return 0.0
    return weighted_usd / total_mwh


def calculate_compliance_context(
    historial: list[dict[str, Any]],
    demanda_total: float,
    mater_mwh: float,
    mes: int,
    precio_gasoil_importado_usd_mwh: float,
) -> dict[str, float | str]:
    demanda_acumulado = sum(to_float(row.get("demanda_total_mwh")) for row in historial) + demanda_total
    mater_acumulado = sum(to_float(row.get("mater_mwh")) for row in historial) + mater_mwh
    pct_acumulado = (mater_acumulado / demanda_acumulado * 100) if demanda_acumulado else 0.0
    if pct_acumulado >= 20:
        estado = "CUMPLE"
    elif pct_acumulado >= 17:
        estado = "RIESGO"
    else:
        estado = "INCUMPLE"

    mwh_faltantes = max(0.0, (demanda_acumulado * 0.20) - mater_acumulado)
    multa_usd = mwh_faltantes * precio_gasoil_importado_usd_mwh
    meses_transcurridos = max(1, mes)
    meses_restantes = max(0, 12 - meses_transcurridos)
    mater_promedio_mes = mater_acumulado / meses_transcurridos
    demanda_promedio_mes = demanda_acumulado / meses_transcurridos
    pct_proyectado = (
        ((mater_acumulado + mater_promedio_mes * meses_restantes)
         / (demanda_acumulado + demanda_promedio_mes * meses_restantes))
        * 100
        if demanda_acumulado
        else 0.0
    )

    return {
        "pct_acumulado": pct_acumulado,
        "estado": estado,
        "mwh_faltantes": mwh_faltantes,
        "multa_usd": multa_usd,
        "pct_proyectado": pct_proyectado,
    }


def calculate_module_2(
    contratos: list[dict[str, Any]],
    precio_mercado_referencia: float,
    mater_mwh_mes: float,
) -> list[dict[str, Any]]:
    today = date.today()
    results = []
    for contract in contratos:
        precio_contrato = to_float(contract.get("precio_usd_mwh"))
        diferencia_pct = (
            ((precio_contrato - precio_mercado_referencia) / precio_mercado_referencia) * 100
            if precio_mercado_referencia
            else 0.0
        )
        if diferencia_pct <= -5:
            score = "OPTIMO"
        elif diferencia_pct <= 5:
            score = "EN_RANGO"
        elif diferencia_pct <= 15:
            score = "CARO"
        else:
            score = "MUY_CARO"
        diferencia_usd_mes = (precio_mercado_referencia - precio_contrato) * mater_mwh_mes
        vigencia_fin = datetime.fromisoformat(str(contract["vigencia_fin"])).date()
        results.append(
            {
                "numero_contrato": contract.get("numero_contrato"),
                "diferencia_pct": diferencia_pct,
                "score": score,
                "diferencia_usd_mes": diferencia_usd_mes,
                "dias_vencimiento": (vigencia_fin - today).days,
            }
        )
    return results


def process_empresa_from_cammesa_zip(
    supabase: Client,
    empresa: dict[str, Any],
    parsed: ParsedCammesaZip,
    mercado: MercadoMes,
    anio: int,
    mes: int,
) -> dict[str, Any] | None:
    empresa_id = empresa["id"]
    razon_social = empresa["razon_social"]
    nemos = fetch_nemos(supabase, empresa_id)
    if not nemos:
        logging.warning("Empresa %s sin Nemos activos; se omite", razon_social)
        return None

    matched = [parsed.empresas[nemo] for nemo in nemos if nemo in parsed.empresas]
    if not matched:
        logging.warning("No se encontraron Nemos %s en el ZIP CAMMESA para %s", ", ".join(nemos), razon_social)
        return None

    demanda_total = sum(item.demanda_total_mwh for item in matched)
    mater_mwh = sum(item.mater_mwh for item in matched)
    spot_mwh = sum(item.spot_mwh for item in matched)
    importe_mater_pesos = sum(item.importe_mater_pesos for item in matched)
    saldo_total = spot_mwh
    porcentaje_renovable = min(100.0, (mater_mwh / demanda_total * 100) if demanda_total else 0.0)
    precio_efectivo_pesos_mwh = (importe_mater_pesos / mater_mwh) if mater_mwh else 0.0
    precio_spot_pesos_mwh = average(
        mercado.precio_spot_pico_pesos_mwh,
        mercado.precio_spot_valle_pesos_mwh,
        mercado.precio_spot_resto_pesos_mwh,
    )
    cargo_transporte_pesos_mwh = mercado.cargo_transporte_pesos_mwh or 0.0
    costo_total_estimado = (
        importe_mater_pesos
        + (spot_mwh * precio_spot_pesos_mwh)
        + (demanda_total * cargo_transporte_pesos_mwh)
    )

    payload = {
        "empresa_id": empresa_id,
        "nemo": ",".join(nemos),
        "anio": anio,
        "mes": mes,
        "demanda_total_mwh": demanda_total,
        "mater_mwh": mater_mwh,
        "spot_mwh": spot_mwh,
        "saldo_total_mwh": saldo_total,
        "porcentaje_renovable": porcentaje_renovable,
        "costo_renovable_usd_mwh": precio_efectivo_pesos_mwh,
        "costo_spot_usd_mwh": precio_spot_pesos_mwh,
        "costo_total_estimado_usd": costo_total_estimado,
        "importe_mater_pesos": importe_mater_pesos,
        "precio_efectivo_pesos_mwh": precio_efectivo_pesos_mwh,
        "cargo_transporte_pesos_mwh": cargo_transporte_pesos_mwh,
        "precio_spot_pesos_mwh": precio_spot_pesos_mwh,
        "procesado_en": datetime.now(UTC).isoformat(),
    }
    supabase.table("datos_mensuales").upsert(payload, on_conflict="empresa_id,anio,mes").execute()
    logging.info(
        "%s procesada desde ZIP CAMMESA: demanda=%.2f MWh mater=%.2f MWh importe=%.2f pesos renovable=%.2f%%",
        razon_social,
        demanda_total,
        mater_mwh,
        importe_mater_pesos,
        porcentaje_renovable,
    )
    return payload


def process_empresa_legacy(
    supabase: Client,
    empresa: dict[str, Any],
    dte: pd.DataFrame,
    mercado: MercadoMes,
    anio: int,
    mes: int,
) -> dict[str, Any] | None:
    empresa_id = empresa["id"]
    razon_social = empresa["razon_social"]
    try:
        nemos = fetch_nemos(supabase, empresa_id)
        if not nemos:
            logging.warning("Empresa %s sin Nemos activos; se omite", razon_social)
            return None

        rows = dte[dte["nemo"].isin(nemos)]
        if rows.empty:
            logging.warning("No se encontraron Nemos %s en el DTE para %s", ", ".join(nemos), razon_social)
            return None

        demanda_total = float(rows["dem_abastecida_total"].sum())
        mater_rows = rows[rows["tipo"].isin(MATER_TYPES)]
        spot_rows = rows[rows["tipo"].eq("BAS")]
        mater_mwh = float(mater_rows["dem_abastecida_total"].sum())
        spot_mwh = float(spot_rows["dem_abastecida_total"].sum())
        saldo_total = float(rows["saldo_total"].sum())
        porcentaje_renovable = (mater_mwh / demanda_total * 100) if demanda_total else 0.0

        contratos = fetch_contratos(supabase, empresa_id, anio, mes)
        precio_contrato = weighted_contract_price(contratos, mater_rows)
        costo_mater_usd = mater_mwh * precio_contrato
        costo_spot_usd = spot_mwh * (mercado.precio_spot_usd_mwh or 0.0)
        costo_transporte_usd = demanda_total * (mercado.cargo_transporte_usd_mwh or 0.0)
        costo_total_usd = costo_mater_usd + costo_spot_usd + costo_transporte_usd

        historial = fetch_historial_anual(supabase, empresa_id, anio, mes)
        compliance_context = calculate_compliance_context(
            historial,
            demanda_total,
            mater_mwh,
            mes,
            mercado.precio_gasoil_importado_usd_mwh or 0.0,
        )
        module_2 = calculate_module_2(contratos, mercado.costo_renovable_usd_mwh or 0.0, mater_mwh)

        payload = {
            "empresa_id": empresa_id,
            "nemo": ",".join(nemos),
            "anio": anio,
            "mes": mes,
            "demanda_total_mwh": demanda_total,
            "mater_mwh": mater_mwh,
            "spot_mwh": spot_mwh,
            "saldo_total_mwh": saldo_total,
            "porcentaje_renovable": porcentaje_renovable,
            "costo_renovable_usd_mwh": mercado.costo_renovable_usd_mwh or 0.0,
            "costo_spot_usd_mwh": mercado.precio_spot_usd_mwh or 0.0,
            "costo_total_estimado_usd": costo_total_usd,
            "importe_mater_pesos": None,
            "precio_efectivo_pesos_mwh": None,
            "cargo_transporte_pesos_mwh": None,
            "precio_spot_pesos_mwh": None,
            "procesado_en": datetime.now(UTC).isoformat(),
        }
        supabase.table("datos_mensuales").upsert(payload, on_conflict="empresa_id,anio,mes").execute()
        logging.info(
            "%s procesada legacy: demanda=%.2f MWh mater=%.2f MWh spot=%.2f MWh renovable=%.2f%% estado=%s contratos=%s",
            razon_social,
            demanda_total,
            mater_mwh,
            spot_mwh,
            porcentaje_renovable,
            compliance_context["estado"],
            len(module_2),
        )
        return payload
    except Exception:
        logging.exception("Error procesando empresa %s", razon_social)
        return None


def process_empresa(
    supabase: Client,
    empresa: dict[str, Any],
    dte: pd.DataFrame | ParsedCammesaZip,
    mercado: MercadoMes,
    anio: int,
    mes: int,
) -> dict[str, Any] | None:
    if isinstance(dte, ParsedCammesaZip):
        try:
            return process_empresa_from_cammesa_zip(supabase, empresa, dte, mercado, anio, mes)
        except Exception:
            logging.exception("Error procesando empresa %s", empresa["razon_social"])
            return None
    return process_empresa_legacy(supabase, empresa, dte, mercado, anio, mes)


def previous_period(anio: int, mes: int) -> tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def calculate_market_variations(
    supabase: Client,
    anio: int,
    mes: int,
    generacion_mater_gwh: float | None,
) -> tuple[float | None, float | None]:
    if generacion_mater_gwh is None:
        return None, None

    prev_anio, prev_mes = previous_period(anio, mes)
    previous = (
        supabase.table("datos_mercado")
        .select("generacion_mater_gwh")
        .eq("anio", prev_anio)
        .eq("mes", prev_mes)
        .maybe_single()
        .execute()
    )
    yoy = (
        supabase.table("datos_mercado")
        .select("generacion_mater_gwh")
        .eq("anio", anio - 1)
        .eq("mes", mes)
        .maybe_single()
        .execute()
    )

    previous_data = getattr(previous, "data", None)
    yoy_data = getattr(yoy, "data", None)
    previous_value = to_float((previous_data or {}).get("generacion_mater_gwh")) if previous_data else 0.0
    yoy_value = to_float((yoy_data or {}).get("generacion_mater_gwh")) if yoy_data else 0.0
    mater_mom_pct = ((generacion_mater_gwh - previous_value) / previous_value * 100) if previous_value else None
    mater_yoy_pct = ((generacion_mater_gwh - yoy_value) / yoy_value * 100) if yoy_value else None
    return mater_mom_pct, mater_yoy_pct


def existing_market_row(supabase: Client, anio: int, mes: int) -> dict[str, Any] | None:
    response = (
        supabase.table("datos_mercado")
        .select("*")
        .eq("anio", anio)
        .eq("mes", mes)
        .maybe_single()
        .execute()
    )
    if response is None:
        return None
    return response.data or None


def coalesce_number(new_value: float | None, previous_value: Any, default: float = 0.0) -> float:
    if new_value is not None:
        return float(new_value)
    if previous_value is not None:
        return to_float(previous_value, default=default)
    return default


def upsert_mercado(supabase: Client, mercado: MercadoMes, anio: int, mes: int) -> None:
    previous = existing_market_row(supabase, anio, mes) or {}
    generacion_mater = mercado.generacion_mater_gwh
    resolved_generacion_mater = coalesce_number(generacion_mater, previous.get("generacion_mater_gwh"))
    mater_mom_pct, mater_yoy_pct = calculate_market_variations(
        supabase,
        anio,
        mes,
        generacion_mater if generacion_mater is not None else previous.get("generacion_mater_gwh"),
    )

    payload = {
        "anio": anio,
        "mes": mes,
        "generacion_total_gwh": coalesce_number(mercado.generacion_total_gwh, previous.get("generacion_total_gwh")),
        "generacion_mater_gwh": resolved_generacion_mater,
        "mix_termica_pct": coalesce_number(mercado.mix_termica_pct, previous.get("mix_termica_pct")),
        "mix_hidraulica_pct": coalesce_number(mercado.mix_hidraulica_pct, previous.get("mix_hidraulica_pct")),
        "mix_nuclear_pct": coalesce_number(mercado.mix_nuclear_pct, previous.get("mix_nuclear_pct")),
        "mix_renovable_pct": coalesce_number(mercado.mix_renovable_pct, previous.get("mix_renovable_pct")),
        "precio_spot_usd_mwh": coalesce_number(mercado.precio_spot_usd_mwh, previous.get("precio_spot_usd_mwh")),
        "costo_renovable_usd_mwh": coalesce_number(mercado.costo_renovable_usd_mwh, previous.get("costo_renovable_usd_mwh")),
        "costo_cammesa_usd_mwh": coalesce_number(mercado.costo_cammesa_usd_mwh, previous.get("costo_cammesa_usd_mwh")),
        "mater_mom_pct": mater_mom_pct if mater_mom_pct is not None else previous.get("mater_mom_pct"),
        "mater_yoy_pct": mater_yoy_pct if mater_yoy_pct is not None else previous.get("mater_yoy_pct"),
        "precio_spot_pico_pesos_mwh": mercado.precio_spot_pico_pesos_mwh,
        "precio_spot_valle_pesos_mwh": mercado.precio_spot_valle_pesos_mwh,
        "precio_spot_resto_pesos_mwh": mercado.precio_spot_resto_pesos_mwh,
        "cargo_transporte_pesos_mwh": mercado.cargo_transporte_pesos_mwh,
    }
    if previous:
        supabase.table("datos_mercado").update(payload).eq("anio", anio).eq("mes", mes).execute()
    else:
        supabase.table("datos_mercado").insert(payload).execute()
    logging.info("Datos de mercado actualizados para %s-%02d", anio, mes)


def verify_month(supabase: Client, processed_empresa_ids: set[str], anio: int, mes: int) -> None:
    empresas = fetch_active_empresas(supabase)
    missing = [empresa for empresa in empresas if empresa["id"] not in processed_empresa_ids]
    if missing:
        for empresa in missing:
            logging.warning("Verificacion: sin datos_mensuales para %s en %s-%02d", empresa["razon_social"], anio, mes)
    else:
        logging.info("Verificacion OK: todos los clientes activos tienen datos para %s-%02d", anio, mes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Procesa archivos CAMMESA para EnergyOS.")
    parser.add_argument("input_path", type=Path, help="ZIP DTE[AAMM].zip o archivo legacy DTE .xlsx")
    parser.add_argument(
        "variables_relevantes_xlsx",
        nargs="?",
        type=Path,
        help="Archivo legacy de Variables Relevantes. En el flujo nuevo no se usa.",
    )
    parser.add_argument("--anio", type=int, help="Anio del periodo.")
    parser.add_argument("--mes", type=int, help="Mes del periodo (1-12).")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inferred_anio, inferred_mes = infer_period_from_filename(args.input_path)
    anio = args.anio or inferred_anio
    mes = args.mes or inferred_mes
    if not anio or not mes:
        raise SystemExit("No pude inferir anio/mes. Pasalos explicitamente con --anio y --mes.")
    if mes < 1 or mes > 12:
        raise SystemExit("--mes debe estar entre 1 y 12.")

    setup_logging(anio, mes)
    logging.info("Inicio pipeline EnergyOS para %s-%02d", anio, mes)

    supabase_url = get_required_env("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or get_required_env("SUPABASE_SERVICE_KEY")
    supabase = create_client(supabase_url, service_key)

    dte = parse_dte_mate(args.input_path)
    mercado_source = args.input_path if is_cammesa_txt_zip(args.input_path) else args.variables_relevantes_xlsx
    if mercado_source is None:
        raise SystemExit("Para el flujo legacy tenes que pasar tambien el archivo de Variables Relevantes.")
    mercado = extract_mercado(mercado_source, anio, mes)

    processed_empresa_ids: set[str] = set()
    for empresa in fetch_active_empresas(supabase):
        result = process_empresa(supabase, empresa, dte, mercado, anio, mes)
        if result:
            processed_empresa_ids.add(empresa["id"])

    upsert_mercado(supabase, mercado, anio, mes)
    verify_month(supabase, processed_empresa_ids, anio, mes)
    logging.info("Fin pipeline EnergyOS para %s-%02d", anio, mes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
