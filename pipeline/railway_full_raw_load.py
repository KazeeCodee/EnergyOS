r"""
Unattended full CAMMESA raw loader for Railway Postgres.

This is the "leave it running" entrypoint. It prepares the schema, loads every
raw_* table in the proven order, retries transient failures, audits each table,
and writes a final CSV/Markdown report.

Run from this repo:
    railway run python pipeline/railway_full_raw_load.py

Or open a visible PowerShell window:
    .\scripts\run_railway_full_raw_load.ps1
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import railway_load_raw as raw


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "logs"


@dataclass
class TableResult:
    group: str
    table: str
    expected_local: int | None
    remote_total: int | None
    unique_source: int | None
    duplicate_sources: int | str | None
    table_size: str
    total_size: str
    status: str
    attempts: int
    elapsed_seconds: float
    error: str


def log(message: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}", flush=True)


def table_sequence(groups: list[str] | None, tables: list[str] | None) -> list[str]:
    if tables:
        return [raw.validate_ident(table) for table in tables]
    if groups:
        selected: list[str] = []
        for group in groups:
            if group not in raw.RAW_GROUPS:
                raise SystemExit(f"Unknown group {group!r}. Valid: {', '.join(raw.RAW_GROUPS)}")
            selected.extend(raw.RAW_GROUPS[group])
        return selected
    return raw.LOAD_ORDER


def write_reports(results: list[TableResult], stamp: str) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(exist_ok=True)
    csv_path = REPORT_DIR / f"railway_full_raw_load_{stamp}.csv"
    md_path = REPORT_DIR / f"railway_full_raw_load_{stamp}.md"

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(TableResult.__dataclass_fields__))
        writer.writeheader()
        for result in results:
            writer.writerow(result.__dict__)

    ok = sum(1 for result in results if result.status == "ok")
    failed = [result for result in results if result.status != "ok"]
    with md_path.open("w", encoding="utf-8") as handle:
        handle.write("# Railway Full Raw Load Report\n\n")
        handle.write(f"- Generated: {datetime.now().isoformat(timespec='seconds')}\n")
        handle.write(f"- Tables OK: {ok}/{len(results)}\n")
        handle.write(f"- Tables failed: {len(failed)}\n\n")
        handle.write("| Grupo | Tabla | Local | Remoto | Unique | Dupes | Size | Estado |\n")
        handle.write("|---|---:|---:|---:|---:|---:|---:|---|\n")
        for result in results:
            handle.write(
                f"| {result.group} | {result.table} | {result.expected_local or ''} | "
                f"{result.remote_total or ''} | {result.unique_source or ''} | "
                f"{result.duplicate_sources if result.duplicate_sources is not None else ''} | "
                f"{result.total_size} | {result.status} |\n"
            )
        if failed:
            handle.write("\n## Failed Tables\n\n")
            for result in failed:
                handle.write(f"### {result.table}\n\n")
                handle.write(f"Attempts: {result.attempts}\n\n")
                handle.write("```text\n")
                handle.write(result.error[:4000])
                handle.write("\n```\n\n")

    return csv_path, md_path


def load_one_table(
    conn,
    table: str,
    sql_dir: Path,
    batch_size: int,
    log_every: int,
    retries: int,
    skip_complete: bool,
) -> TableResult:
    started = time.monotonic()
    group = raw.group_for(table)
    expected_local: int | None = None
    last_error = ""

    for attempt in range(1, retries + 2):
        try:
            log(f"{table}: discovering local SQL layout and row count (attempt {attempt})")
            manifest = raw.discover_table(sql_dir / f"{table}.sql", table, count_rows=True)
            expected_local = manifest.row_count

            raw.create_support_tables(conn)
            raw.create_helpers(conn)
            raw.create_raw_table(conn, manifest)

            if skip_complete:
                current = raw.audit_table(conn, table)
                if (
                    current["total_filas"] == expected_local
                    and current["unique_source"] == expected_local
                    and current["duplicate_sources"] == 0
                ):
                    elapsed = time.monotonic() - started
                    log(f"{table}: already complete, skipping load")
                    return TableResult(
                        group=group,
                        table=table,
                        expected_local=expected_local,
                        remote_total=current["total_filas"],
                        unique_source=current["unique_source"],
                        duplicate_sources=current["duplicate_sources"],
                        table_size=str(current["table_size"]),
                        total_size=str(current["total_size"]),
                        status="ok",
                        attempts=attempt,
                        elapsed_seconds=elapsed,
                        error="",
                    )

            log(f"{table}: loading {expected_local:,} local rows")
            raw.load_table(conn, manifest, batch_size=batch_size, log_every=log_every)
            audit = raw.audit_table(conn, table)

            duplicate_sources = audit["duplicate_sources"]
            remote_total = audit["total_filas"]
            unique_source = audit["unique_source"]
            if remote_total != expected_local or unique_source != expected_local or duplicate_sources != 0:
                raise RuntimeError(
                    f"audit mismatch: expected={expected_local}, total={remote_total}, "
                    f"unique={unique_source}, dupes={duplicate_sources}"
                )

            elapsed = time.monotonic() - started
            log(f"{table}: OK total={remote_total:,} elapsed={elapsed/60:.1f} min")
            return TableResult(
                group=group,
                table=table,
                expected_local=expected_local,
                remote_total=remote_total,
                unique_source=unique_source,
                duplicate_sources=duplicate_sources,
                table_size=str(audit["table_size"]),
                total_size=str(audit["total_size"]),
                status="ok",
                attempts=attempt,
                elapsed_seconds=elapsed,
                error="",
            )
        except Exception as exc:  # noqa: BLE001 - we want an unattended runner
            conn.rollback()
            last_error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
            log(f"{table}: ERROR attempt {attempt}/{retries + 1}: {last_error}")
            if attempt <= retries:
                sleep_for = min(60, 10 * attempt)
                log(f"{table}: retrying in {sleep_for}s")
                time.sleep(sleep_for)

    elapsed = time.monotonic() - started
    return TableResult(
        group=group,
        table=table,
        expected_local=expected_local,
        remote_total=None,
        unique_source=None,
        duplicate_sources=None,
        table_size="",
        total_size="",
        status="failed",
        attempts=retries + 1,
        elapsed_seconds=elapsed,
        error=last_error,
    )


def run(args: argparse.Namespace) -> int:
    sql_dir = args.sql_dir.resolve()
    tables = table_sequence(args.group, args.table)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    REPORT_DIR.mkdir(exist_ok=True)

    log("Starting unattended Railway raw load")
    log(f"SQL dir: {sql_dir}")
    log(f"Tables: {len(tables)}")
    log(f"Batch size: {args.batch_size}")
    log(f"Retries per table: {args.retries}")
    log("This runner is idempotent: completed rows are skipped by unique source key.")

    results: list[TableResult] = []
    with raw.connect() as conn:
        raw.create_support_tables(conn)
        raw.create_helpers(conn)
        for index, table in enumerate(tables, start=1):
            log(f"===== [{index}/{len(tables)}] {table} =====")
            result = load_one_table(
                conn=conn,
                table=table,
                sql_dir=sql_dir,
                batch_size=args.batch_size,
                log_every=args.log_every,
                retries=args.retries,
                skip_complete=not args.no_skip_complete,
            )
            results.append(result)
            csv_path, md_path = write_reports(results, stamp)
            log(f"Partial report updated: {csv_path}")
            if result.status != "ok" and args.fail_fast:
                log("Fail-fast enabled; stopping.")
                log(f"Markdown report: {md_path}")
                return 1

    csv_path, md_path = write_reports(results, stamp)
    failures = [result for result in results if result.status != "ok"]
    log("Finished unattended Railway raw load")
    log(f"CSV report: {csv_path}")
    log(f"Markdown report: {md_path}")
    if failures:
        log(f"Completed with {len(failures)} failed table(s). Re-run the same command to resume.")
        return 2
    log("All tables completed successfully.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the full Railway CAMMESA raw load unattended.")
    parser.add_argument(
        "--sql-dir",
        type=Path,
        default=raw.DEFAULT_SQL_DIR,
        help="Directory containing raw_*.sql files.",
    )
    parser.add_argument(
        "--group",
        action="append",
        choices=raw.RAW_GROUPS.keys(),
        help="Limit to one or more groups. Omit to run all groups.",
    )
    parser.add_argument(
        "--table",
        action="append",
        help="Limit to one or more tables. Omit to run all tables.",
    )
    parser.add_argument("--batch-size", type=int, default=5_000)
    parser.add_argument("--log-every", type=int, default=50_000)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument(
        "--no-skip-complete",
        action="store_true",
        help="Attempt loading even if audit says the table is already complete.",
    )
    parser.add_argument("--fail-fast", action="store_true")
    return parser


if __name__ == "__main__":
    sys.exit(run(build_parser().parse_args()))
