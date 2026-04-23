from __future__ import annotations

import argparse
import logging
import os
import re
import sys
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
DEFAULT_CARGOS_ADICIONALES_PCT = 0.025


@dataclass(frozen=True)
class MercadoMes:
    generacion_total_gwh: float
    generacion_mater_gwh: float
    mix_termica_pct: float
    mix_hidraulica_pct: float
    mix_nuclear_pct: float
    mix_renovable_pct: float
    precio_spot_usd_mwh: float
    costo_renovable_usd_mwh: float
    costo_cammesa_usd_mwh: float
    precio_potencia_usd_mw_mes: float
    cargo_transporte_usd_mwh: float
    precio_gasoil_importado_usd_mwh: float


def normalize(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
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
    text = text.replace("%", "").replace("USD", "").replace("usd", "").strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return default


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
    )


def infer_period_from_filename(path: Path) -> tuple[int | None, int | None]:
    months = {
        "ene": 1,
        "enero": 1,
        "feb": 2,
        "febrero": 2,
        "mar": 3,
        "marzo": 3,
        "abr": 4,
        "abril": 4,
        "may": 5,
        "mayo": 5,
        "jun": 6,
        "junio": 6,
        "jul": 7,
        "julio": 7,
        "ago": 8,
        "agosto": 8,
        "sep": 9,
        "septiembre": 9,
        "oct": 10,
        "octubre": 10,
        "nov": 11,
        "noviembre": 11,
        "dic": 12,
        "diciembre": 12,
    }
    name = normalize(path.stem)
    year_match = re.search(r"(20\d{2})", name)
    year = int(year_match.group(1)) if year_match else None
    month = None
    numeric_month = re.search(r"(?:^|[_\-\s])(0?[1-9]|1[0-2])(?:[_\-\s]|$)", name)
    if numeric_month:
        month = int(numeric_month.group(1))
    else:
        for label, value in months.items():
            if re.search(rf"\b{label}\b", name):
                month = value
                break
    return year, month


def parse_dte_mate(dte_path: Path) -> pd.DataFrame:
    xls = pd.ExcelFile(dte_path)
    sheet_name = next((name for name in xls.sheet_names if "mate" in normalize(name)), xls.sheet_names[0])
    raw = pd.read_excel(dte_path, sheet_name=sheet_name, header=None, engine="openpyxl")
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
    logging.info("DTE MATE parseado desde hoja '%s': %s filas utiles", sheet_name, len(data))
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
    generacion_termica = get_column_value(row, "Generación Térmica") or 0.0
    generacion_nuclear = get_column_value(row, "Generación Nuclear") or 0.0
    hidraulica_mayor_50 = get_column_value(row, "Renovable HIDRO > 50") or 0.0
    renovable_ley = get_column_value(row, "Generación Renovable Según Ley 26 190") or 0.0
    mix_total = generacion_termica + generacion_nuclear + hidraulica_mayor_50 + renovable_ley
    if mix_total <= 0:
        mix_total = get_column_value(row, "Oferta Total") or 0.0

    def pct(value: float) -> float:
        return value / mix_total * 100 if mix_total else 0.0

    generacion_mater = (
        get_column_value(row, "GRAN DEMANDA MEM (estimación GU mercado a término/contrato entre privados y acuerdos especiales)")
        or 0.0
    )
    precio_spot = get_column_value(row, "GRAN DEMANDA MEM (a precio SPOT).1")
    costo_renovable = get_column_value(row, "GRAN DEMANDA MEM (*) Mercado a término o contrato entre privados")
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


def extract_mercado(variables_path: Path, anio: int, mes: int) -> MercadoMes:
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
    resolved: dict[str, float] = {}
    for field in aliases:
        value = values[field]
        if value is None and defaults[field] is not None:
            value = to_float(defaults[field])
        if value is None:
            if field in {
                "precio_potencia_usd_mw_mes",
                "cargo_transporte_usd_mwh",
                "precio_gasoil_importado_usd_mwh",
            }:
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


def process_empresa(
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
        costo_spot_usd = spot_mwh * mercado.precio_spot_usd_mwh
        potencia_contratada_mw = to_float(os.getenv("ENERGYOS_POTENCIA_CONTRATADA_MW_DEFAULT", "0"))
        costo_potencia_usd = potencia_contratada_mw * mercado.precio_potencia_usd_mw_mes
        costo_transporte_usd = demanda_total * mercado.cargo_transporte_usd_mwh
        cargos_pct = to_float(os.getenv("ENERGYOS_CARGOS_ADICIONALES_PCT", str(DEFAULT_CARGOS_ADICIONALES_PCT)))
        subtotal = costo_mater_usd + costo_spot_usd + costo_potencia_usd + costo_transporte_usd
        cargos_adicionales_usd = subtotal * cargos_pct
        costo_total_usd = subtotal + cargos_adicionales_usd
        costo_monomico_usd_mwh = (costo_total_usd / demanda_total) if demanda_total else 0.0

        historial = fetch_historial_anual(supabase, empresa_id, anio, mes)
        compliance_context = calculate_compliance_context(
            historial,
            demanda_total,
            mater_mwh,
            mes,
            mercado.precio_gasoil_importado_usd_mwh,
        )
        module_2 = calculate_module_2(contratos, mercado.costo_renovable_usd_mwh, mater_mwh)

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
            "costo_renovable_usd_mwh": mercado.costo_renovable_usd_mwh,
            "costo_spot_usd_mwh": mercado.precio_spot_usd_mwh,
            "costo_total_estimado_usd": costo_total_usd,
            "procesado_en": datetime.now(UTC).isoformat(),
        }
        supabase.table("datos_mensuales").upsert(payload, on_conflict="empresa_id,anio,mes").execute()
        logging.info(
            "%s procesada: demanda=%.2f MWh mater=%.2f MWh spot=%.2f MWh renovable=%.2f%% estado=%s monomico=%.2f USD/MWh contratos=%s",
            razon_social,
            demanda_total,
            mater_mwh,
            spot_mwh,
            porcentaje_renovable,
            compliance_context["estado"],
            costo_monomico_usd_mwh,
            len(module_2),
        )
        return payload
    except Exception:
        logging.exception("Error procesando empresa %s", razon_social)
        return None


def previous_period(anio: int, mes: int) -> tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def calculate_market_variations(supabase: Client, anio: int, mes: int, generacion_mater_gwh: float) -> tuple[float | None, float | None]:
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


def upsert_mercado(supabase: Client, mercado: MercadoMes, anio: int, mes: int) -> None:
    mater_mom_pct, mater_yoy_pct = calculate_market_variations(
        supabase,
        anio,
        mes,
        mercado.generacion_mater_gwh,
    )
    payload = {
        "anio": anio,
        "mes": mes,
        "generacion_total_gwh": mercado.generacion_total_gwh,
        "generacion_mater_gwh": mercado.generacion_mater_gwh,
        "mix_termica_pct": mercado.mix_termica_pct,
        "mix_hidraulica_pct": mercado.mix_hidraulica_pct,
        "mix_nuclear_pct": mercado.mix_nuclear_pct,
        "mix_renovable_pct": mercado.mix_renovable_pct,
        "precio_spot_usd_mwh": mercado.precio_spot_usd_mwh,
        "costo_renovable_usd_mwh": mercado.costo_renovable_usd_mwh,
        "costo_cammesa_usd_mwh": mercado.costo_cammesa_usd_mwh,
        "mater_mom_pct": mater_mom_pct,
        "mater_yoy_pct": mater_yoy_pct,
    }
    supabase.table("datos_mercado").upsert(payload, on_conflict="anio,mes").execute()
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
    parser = argparse.ArgumentParser(description="Procesa el DTE mensual y Variables Relevantes MEM para EnergyOS.")
    parser.add_argument("dte_xlsx", type=Path, help="Archivo DTE_Detallado_Provisorio_[MES]_[ANIO].xlsx")
    parser.add_argument("variables_relevantes_xlsx", type=Path, help="Archivo BASE DE DATOS Variables Relevantes del MEM .xlsx")
    parser.add_argument("--anio", type=int, help="Anio del DTE. Si se omite, se intenta inferir del nombre del archivo.")
    parser.add_argument("--mes", type=int, help="Mes del DTE (1-12). Si se omite, se intenta inferir del nombre del archivo.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inferred_anio, inferred_mes = infer_period_from_filename(args.dte_xlsx)
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

    dte = parse_dte_mate(args.dte_xlsx)
    mercado = extract_mercado(args.variables_relevantes_xlsx, anio, mes)

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
