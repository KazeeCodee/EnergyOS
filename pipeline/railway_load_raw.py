"""
Load CAMMESA raw SQL dumps into Railway Postgres.

This script is intentionally independent from Supabase. It reads the local
raw_*.sql files, creates Railway-compatible raw tables, and loads rows through
direct Postgres inserts with ON CONFLICT DO NOTHING.

Examples:
    python pipeline/railway_load_raw.py inventory --count-rows
    railway run python pipeline/railway_load_raw.py prepare
    railway run python pipeline/railway_load_raw.py load --tabla raw_aexp --limit 500
    railway run python pipeline/railway_load_raw.py load --all
    railway run python pipeline/railway_load_raw.py audit
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Iterable

try:
    import psycopg
    from psycopg import sql
except ImportError as exc:  # pragma: no cover - user-facing dependency guard
    raise SystemExit(
        "Missing dependency: psycopg. Run `pip install -r pipeline/requirements.txt`."
    ) from exc

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


ROOT = Path(__file__).resolve().parents[1]
if load_dotenv:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env.railway.local")

DEFAULT_SQL_DIR = Path(
    os.getenv(
        "CAMMESA_SQL_DIR",
        r"C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03",
    )
)

BATCH_SIZE_DEFAULT = 5_000
LOG_EVERY_DEFAULT = 50_000
IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
COL_RE = re.compile(r"^col_(\d{3})$")


RAW_GROUPS: dict[str, list[str]] = {
    "A_small_smoke": ["raw_aexp", "raw_agfq", "raw_auto", "raw_game"],
    "B_medium": ["raw_aama", "raw_atra", "raw_adco", "raw_adis", "raw_gudi", "raw_rscj"],
    "C_generation": ["raw_agen"],
    "D_anexo_gen": [
        "raw_anexo_gen111",
        "raw_anexo_gen112",
        "raw_anexo_gen113",
        "raw_anexo_gen114",
        "raw_anexo_gen115",
        "raw_anexo_gen116",
        "raw_anexo_gen117",
        "raw_anexo_gen118",
        "raw_anexo_gen119",
        "raw_anexo_gen12",
        "raw_anexo_gen13",
        "raw_anexo_gen_disp_mejora",
        "raw_anexo_generacion_forzada",
        "raw_anexo_gen_294pot",
        "raw_anexo_gen_294ene",
        "raw_anexo_genmovil",
        "raw_anexo_gennuc",
    ],
    "E_anexo_mat": [
        "raw_anexo_mat",
        "raw_anexo_mat_plus",
        "raw_anexo_mat_renovable",
        "raw_anexo_mat_cvt",
        "raw_anexo_mat_cvt_plus",
        "raw_anexo_mat_compromiso",
        "raw_anexo_mat_cont_delivery",
        "raw_anexo_mat_cequip724",
    ],
    "F_anexo_guma_gume": ["raw_anexo_guma", "raw_anexo_gume"],
    "G_massive": ["raw_dexc", "raw_dte"],
}

LOAD_ORDER = [table for tables in RAW_GROUPS.values() for table in tables]

ENVELOPE_COLS = [
    "anio",
    "mes",
    "source_zip",
    "source_file",
    "source_row",
    "section_index",
    "col_count",
    "raw_text",
]

INSERT_STMT_RE = re.compile(
    r"INSERT\s+INTO\s+(?:public\.)?(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+)\s*;",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class TableManifest:
    table: str
    group: str
    path: Path
    size_mb: float
    columns: tuple[str, ...]
    max_col: int
    row_count: int | None = None

    @property
    def insert_columns(self) -> tuple[str, ...]:
        return tuple(col for col in self.columns if col != "id")


def validate_ident(name: str) -> str:
    if not IDENT_RE.match(name):
        raise ValueError(f"Unsafe identifier: {name!r}")
    return name


def group_for(table: str) -> str:
    for group, tables in RAW_GROUPS.items():
        if table in tables:
            return group
    return "unknown"


def database_url() -> str:
    url = (
        os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("RAILWAY_DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. Add Railway Postgres, then run this with "
            "`railway run ...` or create `.env.railway.local` with DATABASE_URL."
        )
    return url


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url(), autocommit=False)


def parse_value(value: str) -> str | None:
    value = value.strip()
    if value.upper() == "NULL":
        return None
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def split_values(raw: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_str = False
    depth = 0
    i = 0
    while i < len(raw):
        char = raw[i]
        if char == "'" and not in_str:
            in_str = True
            buf.append(char)
        elif char == "'" and in_str:
            if i + 1 < len(raw) and raw[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            in_str = False
            buf.append(char)
        elif char == "," and not in_str and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(char)
        i += 1
    if buf:
        parts.append("".join(buf).strip())
    return parts


def iter_insert_statements(path: Path, table: str) -> Generator[str, None, None]:
    start_re = re.compile(
        rf"INSERT\s+INTO\s+(?:public\.)?{re.escape(table)}\b", re.IGNORECASE
    )
    buf: list[str] = []
    in_str = False

    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not buf and not start_re.search(line):
                continue

            buf.append(line)
            i = 0
            while i < len(line):
                char = line[i]
                if char == "'" and not in_str:
                    in_str = True
                elif char == "'" and in_str:
                    if i + 1 < len(line) and line[i + 1] == "'":
                        i += 2
                        continue
                    in_str = False
                elif char == ";" and not in_str:
                    yield "".join(buf)
                    buf = []
                    break
                i += 1


def iter_value_tuples(values_sql: str) -> Generator[str, None, None]:
    depth = 0
    in_str = False
    buf: list[str] = []
    i = 0
    while i < len(values_sql):
        char = values_sql[i]
        if char == "'" and not in_str:
            in_str = True
            if depth > 0:
                buf.append(char)
        elif char == "'" and in_str:
            if i + 1 < len(values_sql) and values_sql[i + 1] == "'":
                if depth > 0:
                    buf.append("''")
                i += 2
                continue
            in_str = False
            if depth > 0:
                buf.append(char)
        elif char == "(" and not in_str:
            if depth > 0:
                buf.append(char)
            depth += 1
        elif char == ")" and not in_str:
            depth -= 1
            if depth == 0:
                yield "".join(buf)
                buf = []
            elif depth > 0:
                buf.append(char)
        elif depth > 0:
            buf.append(char)
        i += 1


def iter_rows_from_sql(path: Path, table: str) -> Generator[dict[str, object], None, None]:
    for statement in iter_insert_statements(path, table):
        match = INSERT_STMT_RE.match(statement.strip())
        if not match:
            raise ValueError(f"Cannot parse INSERT statement in {path}")
        statement_table = match.group(1)
        if statement_table.lower() != table.lower():
            continue
        columns = [col.strip().strip('"') for col in match.group(2).split(",")]
        values_sql = match.group(3)
        for tuple_sql in iter_value_tuples(values_sql):
            values = [parse_value(value) for value in split_values(tuple_sql)]
            if len(columns) != len(values):
                raise ValueError(
                    f"Column/value mismatch in {path}: {len(columns)} cols, {len(values)} values"
                )
            row = dict(zip(columns, values, strict=True))
            row.pop("id", None)
            yield row


def discover_table(path: Path, table: str, count_rows: bool = False) -> TableManifest:
    columns: set[str] = set()
    max_col = 0
    row_count = 0

    for statement in iter_insert_statements(path, table):
        match = INSERT_STMT_RE.match(statement.strip())
        if not match:
            raise ValueError(f"Cannot parse INSERT statement in {path}")
        statement_columns = [col.strip().strip('"') for col in match.group(2).split(",")]
        columns.update(col for col in statement_columns if col != "id")
        for col in statement_columns:
            col_match = COL_RE.match(col)
            if col_match:
                max_col = max(max_col, int(col_match.group(1)))
        if count_rows:
            row_count += sum(1 for _ in iter_value_tuples(match.group(3)))

    ordered_columns: list[str] = []
    for col in ENVELOPE_COLS:
        if col in columns:
            ordered_columns.append(col)
    for index in range(1, max_col + 1):
        col = f"col_{index:03d}"
        if col in columns:
            ordered_columns.append(col)
    for col in sorted(columns - set(ordered_columns)):
        ordered_columns.append(col)

    if not ordered_columns:
        raise FileNotFoundError(f"No INSERT rows found for {table} in {path}")

    return TableManifest(
        table=table,
        group=group_for(table),
        path=path,
        size_mb=path.stat().st_size / 1024 / 1024,
        columns=tuple(ordered_columns),
        max_col=max_col,
        row_count=row_count if count_rows else None,
    )


def discover_manifests(sql_dir: Path, tables: Iterable[str], count_rows: bool = False) -> list[TableManifest]:
    manifests: list[TableManifest] = []
    for table in tables:
        path = sql_dir / f"{table}.sql"
        if not path.exists():
            raise FileNotFoundError(f"Missing SQL file: {path}")
        manifests.append(discover_table(path, table, count_rows=count_rows))
    return manifests


def create_support_tables(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            create table if not exists public.ingest_runs (
              id bigint generated by default as identity primary key,
              tabla text not null,
              source_file text,
              status text not null default 'running',
              started_at timestamptz not null default now(),
              finished_at timestamptz,
              rows_seen bigint not null default 0,
              rows_attempted bigint not null default 0,
              rows_inserted_estimate bigint not null default 0,
              error text
            )
            """
        )
        cur.execute(
            """
            create table if not exists public.railway_load_audit (
              id bigint generated by default as identity primary key,
              checked_at timestamptz not null default now(),
              tabla text not null,
              total_filas bigint not null,
              unique_source bigint not null,
              duplicate_sources bigint not null,
              table_size text,
              total_size text
            )
            """
        )
    conn.commit()


def create_raw_table(conn: psycopg.Connection, manifest: TableManifest) -> None:
    validate_ident(manifest.table)
    with conn.cursor() as cur:
        column_defs = [
            sql.SQL("id bigint generated by default as identity primary key"),
        ]
        for col in manifest.columns:
            validate_ident(col)
            if col in {"anio", "mes", "source_row", "section_index", "col_count"}:
                col_type = sql.SQL("integer")
            else:
                col_type = sql.SQL("text")
            not_null = sql.SQL(" not null") if col in {"source_zip", "source_file", "source_row"} else sql.SQL("")
            column_defs.append(
                sql.SQL("{} {}{}").format(sql.Identifier(col), col_type, not_null)
            )

        cur.execute(
            sql.SQL("create table if not exists public.{} ({})").format(
                sql.Identifier(manifest.table),
                sql.SQL(", ").join(column_defs),
            )
        )

        for col in manifest.columns:
            cur.execute(
                """
                select 1
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = %s
                  and column_name = %s
                """,
                (manifest.table, col),
            )
            if cur.fetchone() is None:
                col_type = sql.SQL("integer") if col in {"anio", "mes", "source_row", "section_index", "col_count"} else sql.SQL("text")
                cur.execute(
                    sql.SQL("alter table public.{} add column {} {}").format(
                        sql.Identifier(manifest.table),
                        sql.Identifier(col),
                        col_type,
                    )
                )

        cur.execute(
            sql.SQL(
                "create unique index if not exists {} on public.{} (source_zip, source_file, source_row)"
            ).format(
                sql.Identifier(f"{manifest.table}_source_uidx"),
                sql.Identifier(manifest.table),
            )
        )
        cur.execute(
            sql.SQL("create index if not exists {} on public.{} (anio, mes)").format(
                sql.Identifier(f"{manifest.table}_anio_mes_idx"),
                sql.Identifier(manifest.table),
            )
        )
        cur.execute(
            sql.SQL(
                "create index if not exists {} on public.{} (anio, mes, left(col_001, 8))"
            ).format(
                sql.Identifier(f"{manifest.table}_periodo_nemo_idx"),
                sql.Identifier(manifest.table),
            )
        )
    conn.commit()


def create_helpers(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            create or replace function public.nemo_from(value text)
            returns text
            language sql
            immutable
            as $$
              select nullif(trim(left(coalesce(value, ''), 8)), '')
            $$;
            """
        )
        cur.execute(
            """
            create or replace function public.parse_es_number(value text)
            returns numeric
            language plpgsql
            immutable
            as $$
            declare
              cleaned text;
            begin
              if value is null or btrim(value) = '' then
                return null;
              end if;
              cleaned := regexp_replace(btrim(value), '\\s+', '', 'g');
              if cleaned like '%,%' then
                cleaned := replace(replace(cleaned, '.', ''), ',', '.');
              end if;
              cleaned := regexp_replace(cleaned, '[^0-9.\\-]', '', 'g');
              if cleaned = '' or cleaned = '-' then
                return null;
              end if;
              return cleaned::numeric;
            exception when invalid_text_representation then
              return null;
            end;
            $$;
            """
        )
        cur.execute(
            """
            create or replace function public.parse_es_date(value text)
            returns date
            language plpgsql
            immutable
            as $$
            declare
              parts text[];
              year_text text;
              year_int int;
            begin
              if value is null or btrim(value) = '' then
                return null;
              end if;
              parts := regexp_split_to_array(replace(btrim(value), '-', '/'), '/');
              if array_length(parts, 1) <> 3 then
                return null;
              end if;
              year_text := parts[3];
              year_int := year_text::int;
              if length(year_text) = 2 then
                year_int := 2000 + year_int;
              end if;
              return make_date(year_int, parts[2]::int, parts[1]::int);
            exception when others then
              return null;
            end;
            $$;
            """
        )
    conn.commit()


def insert_run_start(conn: psycopg.Connection, manifest: TableManifest) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.ingest_runs (tabla, source_file, status)
            values (%s, %s, 'running')
            returning id
            """,
            (manifest.table, str(manifest.path)),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return int(run_id)


def finish_run(
    conn: psycopg.Connection,
    run_id: int,
    status: str,
    rows_seen: int,
    rows_attempted: int,
    rows_inserted_estimate: int,
    error: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update public.ingest_runs
            set status = %s,
                finished_at = now(),
                rows_seen = %s,
                rows_attempted = %s,
                rows_inserted_estimate = %s,
                error = %s
            where id = %s
            """,
            (status, rows_seen, rows_attempted, rows_inserted_estimate, error, run_id),
        )
    conn.commit()


def table_count(conn: psycopg.Connection, table: str) -> int:
    validate_ident(table)
    with conn.cursor() as cur:
        cur.execute(sql.SQL("select count(*) from public.{}").format(sql.Identifier(table)))
        return int(cur.fetchone()[0])


def load_table(
    conn: psycopg.Connection,
    manifest: TableManifest,
    batch_size: int,
    log_every: int,
    limit: int | None = None,
) -> None:
    print(f"\n==> {manifest.table} ({manifest.group})")
    print(f"    file={manifest.path}")
    print(f"    size={manifest.size_mb:.1f} MB max_col={manifest.max_col} cols={len(manifest.columns)}")

    create_raw_table(conn, manifest)
    before = table_count(conn, manifest.table)
    run_id = insert_run_start(conn, manifest)
    started = time.monotonic()

    columns = list(manifest.insert_columns)
    placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in columns)
    insert_sql = sql.SQL(
        "insert into public.{} ({}) values ({}) "
        "on conflict (source_zip, source_file, source_row) do nothing"
    ).format(
        sql.Identifier(manifest.table),
        sql.SQL(", ").join(sql.Identifier(col) for col in columns),
        placeholders,
    )

    batch: list[tuple[object, ...]] = []
    rows_seen = 0
    rows_attempted = 0
    last_log = 0

    def flush() -> None:
        nonlocal batch, rows_attempted
        if not batch:
            return
        with conn.cursor() as cur:
            cur.executemany(insert_sql, batch)
        conn.commit()
        rows_attempted += len(batch)
        batch = []

    try:
        for row in iter_rows_from_sql(manifest.path, manifest.table):
            rows_seen += 1
            batch.append(tuple(row.get(col) for col in columns))
            if len(batch) >= batch_size:
                flush()
            if rows_seen - last_log >= log_every:
                elapsed = max(time.monotonic() - started, 1)
                print(
                    f"    {rows_seen:,} rows read | {rows_attempted:,} sent | "
                    f"{rows_seen / elapsed:,.0f} rows/sec"
                )
                last_log = rows_seen
            if limit and rows_seen >= limit:
                break

        flush()
        after = table_count(conn, manifest.table)
        inserted_estimate = max(after - before, 0)
        finish_run(conn, run_id, "success", rows_seen, rows_attempted, inserted_estimate)
        elapsed = max(time.monotonic() - started, 1)
        print(
            f"    done: read={rows_seen:,} sent={rows_attempted:,} "
            f"inserted_estimate={inserted_estimate:,} total={after:,} "
            f"elapsed={elapsed/60:.1f} min"
        )
    except Exception as exc:
        conn.rollback()
        finish_run(conn, run_id, "error", rows_seen, rows_attempted, 0, str(exc)[:1000])
        raise


def audit_table(conn: psycopg.Connection, table: str) -> dict[str, object]:
    validate_ident(table)
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                """
                select
                  count(*)::bigint as total,
                  count(distinct (source_zip, source_file, source_row))::bigint as unique_source,
                  (count(*) - count(distinct (source_zip, source_file, source_row)))::bigint as duplicate_sources,
                  pg_size_pretty(pg_relation_size(to_regclass(%s))) as table_size,
                  pg_size_pretty(pg_total_relation_size(to_regclass(%s))) as total_size
                from public.{}
                """
            ).format(
                sql.Identifier(table)
            ),
            (f"public.{table}", f"public.{table}"),
        )
        total, unique_source, duplicate_sources, table_size, total_size = cur.fetchone()
        cur.execute(
            """
            insert into public.railway_load_audit
              (tabla, total_filas, unique_source, duplicate_sources, table_size, total_size)
            values (%s, %s, %s, %s, %s, %s)
            """,
            (table, total, unique_source, duplicate_sources, table_size, total_size),
        )
    conn.commit()
    return {
        "tabla": table,
        "total_filas": int(total),
        "unique_source": int(unique_source),
        "duplicate_sources": int(duplicate_sources),
        "table_size": table_size,
        "total_size": total_size,
    }


def cmd_inventory(args: argparse.Namespace) -> None:
    manifests = discover_manifests(args.sql_dir, selected_tables(args), count_rows=args.count_rows)
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["grupo", "tabla", "archivo_mb", "max_col", "columnas", "filas_locales"],
    )
    writer.writeheader()
    for manifest in manifests:
        writer.writerow(
            {
                "grupo": manifest.group,
                "tabla": manifest.table,
                "archivo_mb": f"{manifest.size_mb:.2f}",
                "max_col": manifest.max_col,
                "columnas": len(manifest.columns),
                "filas_locales": "" if manifest.row_count is None else manifest.row_count,
            }
        )


def cmd_prepare(args: argparse.Namespace) -> None:
    manifests = discover_manifests(args.sql_dir, selected_tables(args), count_rows=False)
    with connect() as conn:
        create_support_tables(conn)
        create_helpers(conn)
        for manifest in manifests:
            print(f"creating {manifest.table} ({manifest.group})")
            create_raw_table(conn, manifest)
    print("Railway schema is ready.")


def cmd_load(args: argparse.Namespace) -> None:
    manifests = discover_manifests(args.sql_dir, selected_tables(args), count_rows=False)
    log_dir = ROOT / "logs"
    log_dir.mkdir(exist_ok=True)
    print(f"Starting Railway raw load at {datetime.now(timezone.utc).isoformat()}")
    print(f"Tables: {', '.join(m.table for m in manifests)}")
    print(f"SQL dir: {args.sql_dir}")
    with connect() as conn:
        create_support_tables(conn)
        create_helpers(conn)
        for manifest in manifests:
            load_table(conn, manifest, args.batch_size, args.log_every, args.limit)
    print("Load finished.")


def cmd_audit(args: argparse.Namespace) -> None:
    tables = selected_tables(args)
    with connect() as conn:
        create_support_tables(conn)
        rows = []
        for table in tables:
            try:
                rows.append(audit_table(conn, table))
            except psycopg.errors.UndefinedTable:
                conn.rollback()
                rows.append(
                    {
                        "tabla": table,
                        "total_filas": 0,
                        "unique_source": 0,
                        "duplicate_sources": "missing",
                        "table_size": "",
                        "total_size": "",
                    }
                )
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=[
            "tabla",
            "total_filas",
            "unique_source",
            "duplicate_sources",
            "table_size",
            "total_size",
        ],
    )
    writer.writeheader()
    writer.writerows(rows)


def selected_tables(args: argparse.Namespace) -> list[str]:
    if getattr(args, "tabla", None):
        table = validate_ident(args.tabla)
        return [table]
    if getattr(args, "grupo", None):
        if args.grupo not in RAW_GROUPS:
            raise SystemExit(f"Unknown group {args.grupo!r}. Valid: {', '.join(RAW_GROUPS)}")
        return RAW_GROUPS[args.grupo]
    if getattr(args, "all", False):
        return LOAD_ORDER
    return LOAD_ORDER


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Railway Postgres raw CAMMESA loader")
    parser.add_argument("--sql-dir", type=Path, default=DEFAULT_SQL_DIR)

    sub = parser.add_subparsers(dest="command", required=True)

    for name in ("inventory", "prepare", "load", "audit"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--tabla")
        cmd.add_argument("--grupo", choices=RAW_GROUPS.keys())
        cmd.add_argument("--all", action="store_true")

    sub.choices["inventory"].add_argument("--count-rows", action="store_true")
    sub.choices["load"].add_argument("--limit", type=int)
    sub.choices["load"].add_argument("--batch-size", type=int, default=BATCH_SIZE_DEFAULT)
    sub.choices["load"].add_argument("--log-every", type=int, default=LOG_EVERY_DEFAULT)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.sql_dir = args.sql_dir.resolve()
    if args.command == "inventory":
        cmd_inventory(args)
    elif args.command == "prepare":
        cmd_prepare(args)
    elif args.command == "load":
        cmd_load(args)
    elif args.command == "audit":
        cmd_audit(args)
    else:  # pragma: no cover
        raise SystemExit(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
