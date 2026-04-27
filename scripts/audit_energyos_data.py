from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Iterable

from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "tmp" / "audit-energyos-data.json"
DEFAULT_DESDE = "2021-01"
DEFAULT_HASTA = "2026-03"
RAW_TABLES = ("raw_amat", "raw_agum", "raw_atra")
REQUIRED_MARKET_FIELDS = (
    "generacion_total_gwh",
    "generacion_mater_gwh",
    "mix_termica_pct",
    "mix_hidraulica_pct",
    "mix_nuclear_pct",
    "mix_renovable_pct",
    "precio_spot_usd_mwh",
    "costo_renovable_usd_mwh",
    "costo_cammesa_usd_mwh",
)


@dataclass(frozen=True)
class Period:
    anio: int
    mes: int

    @property
    def key(self) -> str:
        return f"{self.anio}-{self.mes:02d}"

    @property
    def first_day(self) -> date:
        return date(self.anio, self.mes, 1)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_period(value: str) -> Period:
    parsed = datetime.strptime(value, "%Y-%m")
    return Period(parsed.year, parsed.month)


def month_range(desde: Period, hasta: Period) -> list[Period]:
    months: list[Period] = []
    anio = desde.anio
    mes = desde.mes
    while (anio, mes) <= (hasta.anio, hasta.mes):
        months.append(Period(anio, mes))
        if mes == 12:
            anio += 1
            mes = 1
        else:
            mes += 1
    return months


def parse_date(value: Any) -> date | None:
    if value in (None, "", "None"):
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def nullable_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def close_enough(actual: float | None, expected: float | None, tolerance: float) -> bool:
    if actual is None or expected is None:
        return actual is expected
    return abs(actual - expected) <= tolerance


def tolerance_for(value: float, *, pct: float = 0.001, floor: float = 0.05) -> float:
    return max(abs(value) * pct, floor)


def make_finding(
    findings: list[dict[str, Any]],
    severity: str,
    code: str,
    message: str,
    **extra: Any,
) -> None:
    findings.append({"severity": severity, "code": code, "message": message, **extra})


def fetch_all(client, table: str, columns: str, *, page_size: int = 1000):
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = (
            client.table(table)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        offset += page_size


def in_periods(row: dict[str, Any], allowed: set[tuple[int, int]]) -> bool:
    return (int(row.get("anio", 0)), int(row.get("mes", 0))) in allowed


def expected_for_agent(agent: dict[str, Any], period: Period) -> bool:
    if not agent.get("activo", True):
        return False
    seguimiento_desde = parse_date(agent.get("seguimiento_desde"))
    cobertura_desde = parse_date(agent.get("cobertura_desde"))
    cobertura_hasta = parse_date(agent.get("cobertura_hasta"))
    starts = [value for value in (seguimiento_desde, cobertura_desde) if value is not None]
    if starts and period.first_day < max(starts):
        return False
    if cobertura_hasta is not None and period.first_day > cobertura_hasta:
        return False
    return True


def count_rows(client, table: str, period: Period) -> int:
    response = (
        client.table(table)
        .select("id", count="exact", head=True)
        .eq("anio", period.anio)
        .eq("mes", period.mes)
        .execute()
    )
    return int(response.count or 0)


def validate_monthly_data(
    rows: list[dict[str, Any]],
    agents: list[dict[str, Any]],
    periods: list[Period],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    period_set = {(period.anio, period.mes) for period in periods}
    rows = [row for row in rows if in_periods(row, period_set)]
    by_agent_period: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (str(row.get("empresa_id")), f"{int(row['anio'])}-{int(row['mes']):02d}")
        by_agent_period.setdefault(key, []).append(row)

    duplicate_keys = [key for key, values in by_agent_period.items() if len(values) > 1]
    if duplicate_keys:
        make_finding(
            findings,
            "critical",
            "duplicate_monthly_rows",
            "Hay filas duplicadas por agente-periodo en datos_mensuales.",
            count=len(duplicate_keys),
            samples=duplicate_keys[:20],
        )

    missing_samples: list[dict[str, Any]] = []
    missing_count = 0
    expected_count = 0
    complete_agents = 0
    partial_agents = 0
    per_agent_summary: list[dict[str, Any]] = []

    for agent in agents:
        expected_periods = [period for period in periods if expected_for_agent(agent, period)]
        expected_count += len(expected_periods)
        present = sum(1 for period in expected_periods if (agent["id"], period.key) in by_agent_period)
        if expected_periods and present == len(expected_periods):
            complete_agents += 1
        else:
            partial_agents += 1
        if expected_periods and present != len(expected_periods):
            per_agent_summary.append(
                {
                    "agent_id": agent["id"],
                    "nemo": agent.get("nemo"),
                    "razon_social": agent.get("razon_social"),
                    "expected_months": len(expected_periods),
                    "present_months": present,
                    "missing_months": len(expected_periods) - present,
                },
            )
        for period in expected_periods:
            if (agent["id"], period.key) in by_agent_period:
                continue
            missing_count += 1
            if len(missing_samples) < 50:
                missing_samples.append(
                    {
                        "agent_id": agent["id"],
                        "nemo": agent.get("nemo"),
                        "razon_social": agent.get("razon_social"),
                        "periodo": period.key,
                    },
                )

    if missing_count:
        make_finding(
            findings,
            "critical",
            "missing_agent_months",
            "Faltan datos_mensuales para agentes activos dentro de su ventana esperada.",
            count=missing_count,
            samples=missing_samples,
        )

    numeric_issue_count = 0
    numeric_issue_samples: list[dict[str, Any]] = []
    unit_issue_count = 0
    unit_issue_samples: list[dict[str, Any]] = []
    for row in rows:
        agent_id = str(row.get("empresa_id"))
        periodo = f"{int(row['anio'])}-{int(row['mes']):02d}"
        demanda = number(row.get("demanda_total_mwh"))
        mater = number(row.get("mater_mwh"))
        spot = number(row.get("spot_mwh"))
        pct = number(row.get("porcentaje_renovable"))
        importe = nullable_number(row.get("importe_mater_pesos"))
        precio_efectivo = nullable_number(row.get("precio_efectivo_pesos_mwh"))
        precio_spot = nullable_number(row.get("precio_spot_pesos_mwh"))
        transporte = nullable_number(row.get("cargo_transporte_pesos_mwh"))
        costo_total = nullable_number(row.get("costo_total_estimado_usd"))
        costo_renovable_usd = nullable_number(row.get("costo_renovable_usd_mwh"))
        suspicious = bool(row.get("dato_sospechoso"))

        issues: list[str] = []
        if demanda < 0 or mater < 0 or spot < 0:
            issues.append("energia_negativa")
        if demanda <= 0 and (mater > 0 or spot > 0):
            issues.append("demanda_no_positiva_con_energia")
        if demanda > 0 and mater > demanda + 0.5:
            issues.append("mater_supera_demanda")
        if demanda > 0 and spot > demanda + 0.5:
            issues.append("spot_supera_demanda")
        if demanda > 0 and mater + spot > demanda + 0.5:
            issues.append("mater_mas_spot_supera_demanda")
        if demanda > 0:
            expected_pct = min(100.0, mater / demanda * 100)
            if not close_enough(pct, expected_pct, 0.05):
                issues.append("porcentaje_renovable_inconsistente")
        if importe is not None and precio_efectivo is not None and mater > 0:
            expected_precio = importe / mater
            if not close_enough(precio_efectivo, expected_precio, tolerance_for(expected_precio)):
                issues.append("precio_efectivo_inconsistente")
        if None not in (importe, precio_spot, transporte, costo_total):
            expected_cost = importe + (spot * precio_spot) + (demanda * transporte)
            if not close_enough(costo_total, expected_cost, tolerance_for(expected_cost, floor=0.5)):
                issues.append("costo_total_inconsistente")
        if issues and not suspicious:
            issues.append("no_marcado_sospechoso")
        if issues:
            numeric_issue_count += 1
            if len(numeric_issue_samples) < 50:
                numeric_issue_samples.append(
                    {
                        "agent_id": agent_id,
                        "periodo": periodo,
                        "issues": issues,
                        "demanda_total_mwh": demanda,
                        "mater_mwh": mater,
                        "spot_mwh": spot,
                        "porcentaje_renovable": pct,
                    },
                )

        if (
            importe is not None
            and precio_efectivo is not None
            and costo_renovable_usd is not None
            and precio_efectivo > 0
            and close_enough(costo_renovable_usd, precio_efectivo, tolerance_for(precio_efectivo))
        ):
            unit_issue_count += 1
            if len(unit_issue_samples) < 20:
                unit_issue_samples.append(
                    {
                        "agent_id": agent_id,
                        "periodo": periodo,
                        "costo_renovable_usd_mwh": costo_renovable_usd,
                        "precio_efectivo_pesos_mwh": precio_efectivo,
                    },
                )

    if numeric_issue_count:
        make_finding(
            findings,
            "critical",
            "monthly_numeric_invariants",
            "Hay filas de datos_mensuales que violan invariantes numericos o no estan marcadas como sospechosas.",
            count=numeric_issue_count,
            samples=numeric_issue_samples,
        )

    if unit_issue_count:
        make_finding(
            findings,
            "high",
            "mixed_pesos_usd_fields",
            "Los campos costo_*_usd_mwh parecen contener valores en pesos para filas provenientes de raw CAMMESA.",
            count=unit_issue_count,
            samples=unit_issue_samples,
        )

    return {
        "rows_in_range": len(rows),
        "expected_agent_months": expected_count,
        "missing_agent_months": missing_count,
        "complete_agents": complete_agents,
        "partial_agents": partial_agents,
        "agent_gap_summary": sorted(per_agent_summary, key=lambda item: item["missing_months"], reverse=True)[:50],
    }


def validate_market_data(
    rows: list[dict[str, Any]],
    periods: list[Period],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    period_set = {(period.anio, period.mes) for period in periods}
    rows = [row for row in rows if in_periods(row, period_set)]
    by_key = {f"{int(row['anio'])}-{int(row['mes']):02d}": row for row in rows}

    missing = [period.key for period in periods if period.key not in by_key]
    if missing:
        make_finding(
            findings,
            "critical",
            "missing_market_months",
            "Faltan filas de datos_mercado para meses del rango auditado.",
            count=len(missing),
            samples=missing[:50],
        )

    market_issue_count = 0
    market_issues: list[dict[str, Any]] = []
    for period in periods:
        row = by_key.get(period.key)
        if not row:
            continue
        issues: list[str] = []
        missing_fields = [field for field in REQUIRED_MARKET_FIELDS if row.get(field) in (None, "")]
        if missing_fields:
            issues.append(f"campos_requeridos_nulos:{','.join(missing_fields)}")
        mix_values = [
            nullable_number(row.get("mix_termica_pct")),
            nullable_number(row.get("mix_hidraulica_pct")),
            nullable_number(row.get("mix_nuclear_pct")),
            nullable_number(row.get("mix_renovable_pct")),
        ]
        if all(value is not None for value in mix_values):
            mix_sum = sum(value or 0 for value in mix_values)
            if not 99.0 <= mix_sum <= 101.0:
                issues.append(f"mix_no_suma_100:{mix_sum:.4f}")

        current_mater = nullable_number(row.get("generacion_mater_gwh"))
        if current_mater is not None:
            prev_anio = period.anio - 1 if period.mes == 1 else period.anio
            prev_mes = 12 if period.mes == 1 else period.mes - 1
            prev = by_key.get(f"{prev_anio}-{prev_mes:02d}")
            prev_value = nullable_number(prev.get("generacion_mater_gwh")) if prev else None
            if prev_value:
                expected_mom = (current_mater - prev_value) / prev_value * 100
                actual_mom = nullable_number(row.get("mater_mom_pct"))
                if actual_mom is not None and not close_enough(actual_mom, expected_mom, 0.1):
                    issues.append("mater_mom_pct_inconsistente")

            yoy = by_key.get(f"{period.anio - 1}-{period.mes:02d}")
            yoy_value = nullable_number(yoy.get("generacion_mater_gwh")) if yoy else None
            if yoy_value:
                expected_yoy = (current_mater - yoy_value) / yoy_value * 100
                actual_yoy = nullable_number(row.get("mater_yoy_pct"))
                if actual_yoy is not None and not close_enough(actual_yoy, expected_yoy, 0.1):
                    issues.append("mater_yoy_pct_inconsistente")

        if issues:
            market_issue_count += 1
            if len(market_issues) < 50:
                market_issues.append({"periodo": period.key, "issues": issues})

    if market_issue_count:
        make_finding(
            findings,
            "high",
            "market_numeric_invariants",
            "Hay filas de datos_mercado con campos faltantes, mix inconsistente o variaciones incorrectas.",
            count=market_issue_count,
            samples=market_issues,
        )

    return {
        "rows_in_range": len(rows),
        "missing_months": len(missing),
    }


def validate_raw_coverage(client, periods: list[Period], findings: list[dict[str, Any]]) -> dict[str, Any]:
    raw_counts: dict[str, dict[str, int | str]] = {}
    missing_by_table: dict[str, list[str]] = {table: [] for table in RAW_TABLES}

    for table in RAW_TABLES:
        raw_counts[table] = {}
        for period in periods:
            try:
                count = count_rows(client, table, period)
            except Exception as exc:
                raw_counts[table][period.key] = f"ERROR: {exc}"
                missing_by_table[table].append(period.key)
                continue
            raw_counts[table][period.key] = count
            if count <= 0:
                missing_by_table[table].append(period.key)

    for table, missing in missing_by_table.items():
        if missing:
            make_finding(
                findings,
                "critical" if table in {"raw_amat", "raw_agum"} else "high",
                f"missing_{table}_months",
                f"Faltan filas en {table} para meses del rango auditado.",
                count=len(missing),
                samples=missing[:50],
            )

    return {
        "missing_by_table": {table: len(missing) for table, missing in missing_by_table.items()},
        "counts": raw_counts,
    }


def validate_processing(rows: list[dict[str, Any]], periods: list[Period], findings: list[dict[str, Any]]) -> dict[str, Any]:
    period_set = {(period.anio, period.mes) for period in periods}
    rows = [row for row in rows if in_periods(row, period_set)]
    completed_by_period: set[str] = set()
    latest_status: dict[str, str] = {}
    for row in sorted(rows, key=lambda item: str(item.get("created_at") or "")):
        key = f"{int(row['anio'])}-{int(row['mes']):02d}"
        latest_status[key] = str(row.get("estado"))
        if row.get("estado") == "completo":
            completed_by_period.add(key)

    missing_completed = [period.key for period in periods if period.key not in completed_by_period]
    if missing_completed:
        make_finding(
            findings,
            "medium",
            "missing_completed_processing",
            "No hay una corrida completa registrada en procesamientos para todos los meses.",
            count=len(missing_completed),
            samples=[{"periodo": key, "latest_status": latest_status.get(key)} for key in missing_completed[:50]],
        )

    return {
        "rows_in_range": len(rows),
        "completed_months": len(completed_by_period),
        "missing_completed_months": len(missing_completed),
    }


def severity_counts(findings: Iterable[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        severity = str(finding.get("severity", "unknown"))
        counts[severity] = counts.get(severity, 0) + 1
    return counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audita datos historicos EnergyOS en Supabase.")
    parser.add_argument("--desde", default=DEFAULT_DESDE, help="Periodo inicial YYYY-MM.")
    parser.add_argument("--hasta", default=DEFAULT_HASTA, help="Periodo final YYYY-MM.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Archivo JSON de salida.")
    parser.add_argument("--fail-on-findings", action="store_true", help="Devuelve exit code 1 si hay hallazgos.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_dotenv(ROOT / ".env.local")

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        raise SystemExit("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY.")

    desde = parse_period(args.desde)
    hasta = parse_period(args.hasta)
    if (desde.anio, desde.mes) > (hasta.anio, hasta.mes):
        raise SystemExit("--desde no puede ser mayor que --hasta")

    periods = month_range(desde, hasta)
    allowed = {(period.anio, period.mes) for period in periods}
    client = create_client(supabase_url, service_key)
    findings: list[dict[str, Any]] = []

    agents = fetch_all(
        client,
        "agentes_monitoreados",
        "id,nemo,razon_social,tipo_agente,activo,seguimiento_desde,cobertura_desde,cobertura_hasta,ultima_captura_periodo",
    )
    monthly_rows = [
        row
        for row in fetch_all(
            client,
            "datos_mensuales",
            "empresa_id,nemo,anio,mes,demanda_total_mwh,mater_mwh,spot_mwh,saldo_total_mwh,porcentaje_renovable,costo_renovable_usd_mwh,costo_spot_usd_mwh,costo_total_estimado_usd,importe_mater_pesos,precio_efectivo_pesos_mwh,cargo_transporte_pesos_mwh,precio_spot_pesos_mwh,dato_sospechoso,sospechoso_motivo,procesado_en",
        )
        if in_periods(row, allowed)
    ]
    market_rows = [
        row
        for row in fetch_all(
            client,
            "datos_mercado",
            "anio,mes,generacion_total_gwh,generacion_mater_gwh,mix_termica_pct,mix_hidraulica_pct,mix_nuclear_pct,mix_renovable_pct,precio_spot_usd_mwh,costo_renovable_usd_mwh,costo_cammesa_usd_mwh,mater_mom_pct,mater_yoy_pct,precio_spot_pico_pesos_mwh,precio_spot_valle_pesos_mwh,precio_spot_resto_pesos_mwh,cargo_transporte_pesos_mwh",
        )
        if in_periods(row, allowed)
    ]
    processing_rows = [
        row
        for row in fetch_all(client, "procesamientos", "id,anio,mes,estado,error_message,resumen,created_at")
        if in_periods(row, allowed)
    ]

    summary = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "range": {"desde": desde.key, "hasta": hasta.key, "expected_months": len(periods)},
        "agents": {
            "active": sum(1 for agent in agents if agent.get("activo", True)),
            "total": len(agents),
        },
    }
    summary["monthly_data"] = validate_monthly_data(monthly_rows, agents, periods, findings)
    summary["market_data"] = validate_market_data(market_rows, periods, findings)
    summary["raw_coverage"] = validate_raw_coverage(client, periods, findings)
    summary["processing"] = validate_processing(processing_rows, periods, findings)
    summary["finding_counts"] = severity_counts(findings)

    report = {"summary": summary, "findings": findings}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Audit range: {desde.key}..{hasta.key} ({len(periods)} months)")
    print(f"Agents: {summary['agents']['active']} active / {summary['agents']['total']} total")
    print(f"Monthly rows in range: {summary['monthly_data']['rows_in_range']}")
    print(f"Market rows in range: {summary['market_data']['rows_in_range']}")
    print(f"Findings: {summary['finding_counts']}")
    print(f"Report: {args.output}")

    if args.fail_on_findings and findings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
