"""
Auditoria global de Fase 1 para tablas CAMMESA raw_*.

Compara conteos locales, conteos del parser, conteos remotos, unicidad por
(source_zip, source_file, source_row), ingest_health e ingest_runs.
"""
from __future__ import annotations

import argparse
import csv
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path


SQL_DIR_DEFAULT = Path(r"C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03")

RAW_TABLES = [
    "raw_amat", "raw_agum",
    "raw_aexp", "raw_agfq", "raw_auto", "raw_game",
    "raw_aama", "raw_atra", "raw_adco", "raw_adis", "raw_gudi", "raw_rscj",
    "raw_agen",
    "raw_anexo_gen111", "raw_anexo_gen112", "raw_anexo_gen113", "raw_anexo_gen114",
    "raw_anexo_gen115", "raw_anexo_gen116", "raw_anexo_gen117", "raw_anexo_gen118",
    "raw_anexo_gen119", "raw_anexo_gen12", "raw_anexo_gen13",
    "raw_anexo_gen_disp_mejora", "raw_anexo_generacion_forzada",
    "raw_anexo_gen_294pot", "raw_anexo_gen_294ene",
    "raw_anexo_genmovil", "raw_anexo_gennuc",
    "raw_anexo_mat", "raw_anexo_mat_plus", "raw_anexo_mat_renovable",
    "raw_anexo_mat_cvt", "raw_anexo_mat_cvt_plus", "raw_anexo_mat_compromiso",
    "raw_anexo_mat_cont_delivery", "raw_anexo_mat_cequip724",
    "raw_anexo_guma", "raw_anexo_gume",
    "raw_dexc", "raw_dte",
]


@dataclass
class AuditRow:
    tabla: str
    local_count: int | None = None
    parser_count: int | None = None
    remote_total: int | None = None
    unique_source: int | None = None
    duplicate_sources: int | None = None
    health_status: str | None = None
    meses_cargados: int | None = None
    meses_esperados: int | None = None
    run_errors: int = 0
    run_open: bool = False


def parse_supabase_csv(output: str) -> list[dict[str, str]]:
    lines = []
    for line in output.splitlines():
        clean = line.strip()
        if not clean:
            continue
        if clean.startswith(("Initialising ", "Connecting ", "Try rerunning ")):
            continue
        lines.append(clean)
    if len(lines) < 2:
        return []
    return list(csv.DictReader(lines))


def row_status(row: AuditRow) -> str:
    if row.local_count is None:
        return "missing_local"
    if row.parser_count is None:
        return "missing_parser"
    if row.local_count != row.parser_count:
        return "fail"
    if row.remote_total is None or row.unique_source is None or row.duplicate_sources is None:
        return "missing_remote"
    if row.duplicate_sources != 0 or row.remote_total != row.unique_source:
        return "fail"
    if row.remote_total < row.local_count or row.run_open:
        return "pending"
    if row.remote_total != row.local_count:
        return "fail"
    if row.health_status != "ok":
        return "fail"
    if row.run_errors:
        return "warn_prior_errors"
    return "ok"


def int_or_none(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        try:
            return int(Decimal(value))
        except (InvalidOperation, ValueError) as exc:
            raise ValueError(f"cannot parse integer value from Supabase CSV: {value!r}") from exc


def bool_from_pg(value: str | None) -> bool:
    return str(value).lower() in {"t", "true", "1", "yes"}


def count_local_inserts(sql_dir: Path, tabla: str) -> int | None:
    sql_path = sql_dir / f"{tabla}.sql"
    if not sql_path.exists():
        return None
    rx = re.compile(rf"INSERT\s+INTO\s+(?:public\.)?{re.escape(tabla)}\b", re.IGNORECASE)
    count = 0
    with sql_path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if rx.search(line):
                count += 1
    return count


def count_parser_rows(sql_dir: Path, tabla: str, *, strict_values: bool = False) -> int | None:
    sql_path = sql_dir / f"{tabla}.sql"
    if not sql_path.exists():
        return None
    sys.path.insert(0, str(Path(__file__).parent))
    import ingest_sql_historico as ingest

    total = 0
    for stmt in ingest.iter_insert_statements(sql_path, tabla):
        m = ingest._RE_INSERT_STMT.match(stmt.strip())
        if not m:
            continue
        active_cols = [c.strip().strip('"') for c in m.group(2).split(",")]
        for raw_vals in ingest.iter_value_tuples(m.group(3)):
            if strict_values:
                vals = ingest.split_values(raw_vals)
                if len(vals) != len(active_cols):
                    raise ValueError(
                        f"{sql_path.name}: INSERT con {len(vals)} valores para "
                        f"{len(active_cols)} columnas en {tabla}"
                    )
            total += 1
    return total


def run_supabase_query(sql: str) -> list[dict[str, str]]:
    npx = shutil.which("npx") or "npx"
    sql_file: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as handle:
            handle.write(sql)
            sql_file = Path(handle.name)
        result = subprocess.run(
            [npx, "supabase", "db", "query", "--linked", "--output", "csv", "--file", str(sql_file)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        return parse_supabase_csv(result.stdout)
    finally:
        if sql_file is not None:
            sql_file.unlink(missing_ok=True)


def sql_list(values: list[str]) -> str:
    return ", ".join("'" + value.replace("'", "''") + "'" for value in values)


def fetch_remote_counts(tables: list[str]) -> dict[str, dict[str, str]]:
    selects = [
        (
            f"select '{tabla}' as tabla, count(*) as total, "
            f"count(distinct (source_zip, source_file, source_row)) as unique_source "
            f"from public.{tabla}"
        )
        for tabla in tables
    ]
    sql = (
        "with checks as ("
        + " union all ".join(selects)
        + ") select tabla,total,unique_source,total-unique_source as duplicate_sources "
        + "from checks order by tabla;"
    )
    return {row["tabla"]: row for row in run_supabase_query(sql)}


def fetch_health(tables: list[str]) -> dict[str, dict[str, str]]:
    sql = (
        "select tabla, meses_cargados, meses_esperados, total_filas, estado_cobertura "
        f"from public.ingest_health where tabla in ({sql_list(tables)}) order by tabla;"
    )
    return {row["tabla"]: row for row in run_supabase_query(sql)}


def fetch_runs(tables: list[str]) -> dict[str, dict[str, str]]:
    sql = (
        "select tabla, coalesce(sum(filas_error),0) as run_errors, "
        "coalesce(bool_or(terminado_en is null),false) as run_open "
        "from public.ingest_runs "
        f"where tabla in ({sql_list(tables)}) group by tabla order by tabla;"
    )
    return {row["tabla"]: row for row in run_supabase_query(sql)}


def audit_tables(
    sql_dir: Path,
    tables: list[str],
    skip_parser: bool = False,
    strict_parser_values: bool = False,
) -> list[AuditRow]:
    print("Consultando conteos remotos...", flush=True)
    remote_counts = fetch_remote_counts(tables)
    print("Consultando ingest_health...", flush=True)
    health = fetch_health(tables)
    print("Consultando ingest_runs...", flush=True)
    runs = fetch_runs(tables)

    rows: list[AuditRow] = []
    for index, tabla in enumerate(tables, start=1):
        print(f"[{index}/{len(tables)}] Auditando {tabla}...", flush=True)
        row = AuditRow(tabla=tabla)
        row.local_count = count_local_inserts(sql_dir, tabla)
        row.parser_count = (
            row.local_count
            if skip_parser
            else count_parser_rows(sql_dir, tabla, strict_values=strict_parser_values)
        )

        remote = remote_counts.get(tabla, {})
        row.remote_total = int_or_none(remote.get("total"))
        row.unique_source = int_or_none(remote.get("unique_source"))
        row.duplicate_sources = int_or_none(remote.get("duplicate_sources"))

        health_row = health.get(tabla, {})
        row.health_status = health_row.get("estado_cobertura")
        row.meses_cargados = int_or_none(health_row.get("meses_cargados"))
        row.meses_esperados = int_or_none(health_row.get("meses_esperados"))

        run_row = runs.get(tabla, {})
        row.run_errors = int_or_none(run_row.get("run_errors")) or 0
        row.run_open = bool_from_pg(run_row.get("run_open"))
        rows.append(row)
        print(
            f"[{index}/{len(tables)}] {tabla}: {row_status(row)} "
            f"local={row.local_count} parser={row.parser_count} remote={row.remote_total}",
            flush=True,
        )
    return rows


def render_markdown(rows: list[AuditRow]) -> str:
    out = [
        "# Auditoria Fase 1 Raw",
        "",
        "| tabla | local | parser | remoto | unique_source | dupes | meses | health | runs | estado |",
        "|---|---:|---:|---:|---:|---:|---|---|---|---|",
    ]
    for row in rows:
        meses = ""
        if row.meses_cargados is not None or row.meses_esperados is not None:
            meses = f"{row.meses_cargados or 0}/{row.meses_esperados or 0}"
        runs = f"err={row.run_errors}, open={str(row.run_open).lower()}"
        out.append(
            "| {tabla} | {local} | {parser} | {remote} | {unique} | {dupes} | "
            "{meses} | {health} | {runs} | {estado} |".format(
                tabla=row.tabla,
                local=row.local_count if row.local_count is not None else "",
                parser=row.parser_count if row.parser_count is not None else "",
                remote=row.remote_total if row.remote_total is not None else "",
                unique=row.unique_source if row.unique_source is not None else "",
                dupes=row.duplicate_sources if row.duplicate_sources is not None else "",
                meses=meses,
                health=row.health_status or "",
                runs=runs,
                estado=row_status(row),
            )
        )
    return "\n".join(out) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita Fase 1 raw_* CAMMESA local vs Supabase.")
    parser.add_argument("--sql-dir", type=Path, default=SQL_DIR_DEFAULT)
    parser.add_argument("--tables", nargs="*", default=RAW_TABLES)
    parser.add_argument("--skip-parser", action="store_true", help="Usa local_count como parser_count para una corrida rapida.")
    parser.add_argument(
        "--strict-parser-values",
        action="store_true",
        help="Ademas de contar tuplas, valida cantidad de valores por columna en cada INSERT.",
    )
    parser.add_argument("--output", type=Path, help="Escribe el reporte markdown en esta ruta.")
    parser.add_argument("--fail-on-mismatch", action="store_true", help="Exit 1 si alguna tabla no queda ok.")
    args = parser.parse_args()

    rows = audit_tables(
        args.sql_dir,
        args.tables,
        skip_parser=args.skip_parser,
        strict_parser_values=args.strict_parser_values,
    )
    report = render_markdown(rows)
    print(report)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")

    statuses = {row_status(row) for row in rows}
    accepted = {"ok", "warn_prior_errors"}
    if args.fail_on_mismatch and any(status not in accepted for status in statuses):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
