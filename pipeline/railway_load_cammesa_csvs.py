r"""
Load CAMMESA CSV/catalog files into Railway Postgres.

This complements the raw_*.sql historical load. It is focused on the files in:
    C:\Users\quime\Downloads\CAMMESA

Run:
    railway run python pipeline/railway_load_cammesa_csvs.py inventory
    railway run python pipeline/railway_load_cammesa_csvs.py load --critical
    railway run python pipeline/railway_load_cammesa_csvs.py load --all
    railway run python pipeline/railway_load_cammesa_csvs.py audit --all
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

import railway_load_raw as raw


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV_DIR = Path(r"C:\Users\quime\Downloads\CAMMESA")


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    source: str
    pg_type: str
    parser: str = "text"


@dataclass(frozen=True)
class Dataset:
    key: str
    table: str
    relative_path: str
    delimiter: str
    conflict_cols: tuple[str, ...]
    columns: tuple[ColumnSpec, ...]
    importance: str
    reason: str


MANUFACTURER_COLUMNS = (
    ColumnSpec("periodo", "periodo", "date", "date"),
    ColumnSpec("molienda_cereales_y_oleaginosas", "molienda_cereales_y_oleaginosas", "numeric", "numeric"),
    ColumnSpec("resto_de_alimentos", "resto_de_alimentos", "numeric", "numeric"),
    ColumnSpec("bebidas", "bebidas", "numeric", "numeric"),
    ColumnSpec("tabaco", "tabaco", "numeric", "numeric"),
    ColumnSpec("textil_indumentaria_y_cuero", "textil_indumentaria_y_cuero", "numeric", "numeric"),
    ColumnSpec("madera_papel_y_edicion", "madera_papel_y_edicion", "numeric", "numeric"),
    ColumnSpec("refinacion_de_petroleo", "refinacion_de_petroleo", "numeric", "numeric"),
    ColumnSpec("quimicos", "quimicos", "numeric", "numeric"),
    ColumnSpec("caucho_y_plastico", "caucho_y_plastico", "numeric", "numeric"),
    ColumnSpec("minerales_no_metalicos", "minerales_no_metalicos", "numeric", "numeric"),
    ColumnSpec("metales_basicos", "metales_basicos", "numeric", "numeric"),
    ColumnSpec("metalmecanica", "metalmecanica", "numeric", "numeric"),
    ColumnSpec("automotriz", "automotriz", "numeric", "numeric"),
    ColumnSpec("resto_de_industria", "resto_de_industria", "numeric", "numeric"),
    ColumnSpec("total_industria", "total_industria", "numeric", "numeric"),
)

DEMANDA_TEMPERATURA_COLUMNS = (
    ColumnSpec("fecha", "fecha", "timestamp without time zone", "timestamp"),
    ColumnSpec("prevista", "Prevista", "numeric", "numeric"),
    ColumnSpec("semana_ant", "Semana Ant", "numeric", "numeric"),
    ColumnSpec("ayer", "Ayer", "numeric", "numeric"),
    ColumnSpec("hoy", "Hoy", "numeric", "numeric"),
    ColumnSpec("tem_prevista", "Tem. Prevista", "numeric", "numeric"),
    ColumnSpec("tem_semana_ant", "Tem. Semana Ant.", "numeric", "numeric"),
    ColumnSpec("tem_ayer", "Tem. Ayer", "numeric", "numeric"),
    ColumnSpec("tem_hoy", "Tem. Hoy", "numeric", "numeric"),
)

GENERACION_COLUMNS = (
    ColumnSpec("fecha", "fecha", "timestamp without time zone", "timestamp"),
    ColumnSpec("nuclear", "Nuclear", "numeric", "numeric"),
    ColumnSpec("termico", "Térmico", "numeric", "numeric"),
    ColumnSpec("renovable_hidro_50mw", "Renovable Hidro>50MW", "numeric", "numeric"),
    ColumnSpec("renovable_ley_26190", "Renovable Ley 26.190", "numeric", "numeric"),
    ColumnSpec("importacion", "Importación", "numeric", "numeric"),
    ColumnSpec("total", "Total", "numeric", "numeric"),
)

PORCENTAJE_GENERACION_COLUMNS = tuple(col for col in GENERACION_COLUMNS if col.name != "total")

DATASETS: tuple[Dataset, ...] = (
    Dataset(
        key="agentes_mem",
        table="cammesa_agentes_mem",
        relative_path="agentes-mem.csv",
        delimiter=",",
        conflict_cols=("id",),
        importance="critico",
        reason="Catalogo maestro para buscar/vincular empresas por NEMO en onboarding.",
        columns=(
            ColumnSpec("id", "id", "bigint", "integer"),
            ColumnSpec("nemo", "nemo", "text", "text"),
            ColumnSpec("descripcion", "descipcion", "text", "text"),
            ColumnSpec("agrupacion", "agrupacion", "text", "text"),
            ColumnSpec("tipo_agente", "tipo_agente", "text", "text"),
            ColumnSpec("fecha_proceso", "fecha_proceso", "timestamp without time zone", "timestamp"),
            ColumnSpec("lote_id_log", "lote_id_log", "bigint", "integer"),
        ),
    ),
    Dataset(
        key="consumo_manufacturero_desestacionalizado",
        table="cammesa_consumo_manufacturero_desestacionalizado",
        relative_path="consumo_electrico_sectores_manufactureros_desestacionalizado.csv",
        delimiter=",",
        conflict_cols=("periodo",),
        importance="util",
        reason="Serie macro para contexto industrial/benchmark, no bloquea onboarding.",
        columns=MANUFACTURER_COLUMNS,
    ),
    Dataset(
        key="consumo_manufacturero_original",
        table="cammesa_consumo_manufacturero_original",
        relative_path="consumo_electrico_sectores_manufactureros_original.csv",
        delimiter=",",
        conflict_cols=("periodo",),
        importance="util",
        reason="Serie macro original para contexto industrial/benchmark, no bloquea onboarding.",
        columns=MANUFACTURER_COLUMNS,
    ),
    Dataset(
        key="operaciones_demanda_temperatura",
        table="cammesa_operaciones_demanda_temperatura",
        relative_path=r"Operaciones del Mercado Eléctrico Mayorista\DemandaYTemperatura_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="util",
        reason="Serie intradiaria de demanda/temperatura para dashboards operativos.",
        columns=DEMANDA_TEMPERATURA_COLUMNS,
    ),
    Dataset(
        key="operaciones_generacion",
        table="cammesa_operaciones_generacion",
        relative_path=r"Operaciones del Mercado Eléctrico Mayorista\Generación_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="util",
        reason="Serie intradiaria de mix/generacion para dashboards operativos.",
        columns=GENERACION_COLUMNS,
    ),
    Dataset(
        key="operaciones_porcentaje_generacion",
        table="cammesa_operaciones_porcentaje_generacion",
        relative_path=r"Operaciones del Mercado Eléctrico Mayorista\PorcentajeGeneración_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="util",
        reason="Serie intradiaria de porcentajes de generacion.",
        columns=PORCENTAJE_GENERACION_COLUMNS,
    ),
    Dataset(
        key="memnet_demanda_temperatura",
        table="cammesa_memnet_demanda_temperatura",
        relative_path=r"Publicaciones MEMnet\DemandaYTemperatura_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="duplicado_util",
        reason="Misma familia que operaciones; se guarda separado para comparar fuentes.",
        columns=DEMANDA_TEMPERATURA_COLUMNS,
    ),
    Dataset(
        key="memnet_generacion",
        table="cammesa_memnet_generacion",
        relative_path=r"Publicaciones MEMnet\Generación_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="duplicado_util",
        reason="Misma familia que operaciones; se guarda separado para comparar fuentes.",
        columns=GENERACION_COLUMNS,
    ),
    Dataset(
        key="memnet_porcentaje_generacion",
        table="cammesa_memnet_porcentaje_generacion",
        relative_path=r"Publicaciones MEMnet\PorcentajeGeneración_23042026.csv",
        delimiter=";",
        conflict_cols=("fecha",),
        importance="duplicado_util",
        reason="Misma familia que operaciones; se guarda separado para comparar fuentes.",
        columns=PORCENTAJE_GENERACION_COLUMNS,
    ),
)


def parse_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def parse_numeric(value: str | None) -> str | None:
    cleaned = parse_text(value)
    if cleaned is None:
        return None
    cleaned = cleaned.replace(" ", "")
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
    return cleaned or None


def parse_integer(value: str | None) -> int | None:
    cleaned = parse_numeric(value)
    if cleaned is None:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def parse_value(value: str | None, parser: str) -> Any:
    if parser == "numeric":
        return parse_numeric(value)
    if parser == "integer":
        return parse_integer(value)
    if parser in {"date", "timestamp", "text"}:
        return parse_text(value)
    raise ValueError(f"Unknown parser: {parser}")


def dataset_path(csv_dir: Path, dataset: Dataset) -> Path:
    return csv_dir / dataset.relative_path


def selected_datasets(args: argparse.Namespace) -> list[Dataset]:
    selected = list(DATASETS)
    if args.critical:
        selected = [dataset for dataset in selected if dataset.importance == "critico"]
    if args.dataset:
        wanted = set(args.dataset)
        selected = [dataset for dataset in selected if dataset.key in wanted or dataset.table in wanted]
    return selected


def read_records(csv_dir: Path, dataset: Dataset) -> list[dict[str, Any]]:
    path = dataset_path(csv_dir, dataset)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=dataset.delimiter)
        records: list[dict[str, Any]] = []
        for row in reader:
            record = {col.name: parse_value(row.get(col.source), col.parser) for col in dataset.columns}
            record["source_file"] = str(path)
            records.append(record)
    return records


def create_table(conn: psycopg.Connection, dataset: Dataset) -> None:
    raw.validate_ident(dataset.table)
    for col in dataset.columns:
        raw.validate_ident(col.name)
    with conn.cursor() as cur:
        defs = [
            sql.SQL("{} {}").format(sql.Identifier(col.name), sql.SQL(col.pg_type))
            for col in dataset.columns
        ]
        defs.append(sql.SQL("source_file text not null"))
        defs.append(sql.SQL("loaded_at timestamptz not null default now()"))
        if dataset.conflict_cols:
            defs.append(
                sql.SQL("primary key ({})").format(
                    sql.SQL(", ").join(sql.Identifier(col) for col in dataset.conflict_cols)
                )
            )
        cur.execute(
            sql.SQL("create table if not exists public.{} ({})").format(
                sql.Identifier(dataset.table),
                sql.SQL(", ").join(defs),
            )
        )
        for col in dataset.conflict_cols:
            cur.execute(
                sql.SQL("create index if not exists {} on public.{} ({})").format(
                    sql.Identifier(f"{dataset.table}_{col}_idx"),
                    sql.Identifier(dataset.table),
                    sql.Identifier(col),
                )
            )
        if dataset.table == "cammesa_agentes_mem":
            cur.execute("create index if not exists cammesa_agentes_mem_nemo_idx on public.cammesa_agentes_mem(nemo)")
            cur.execute("create index if not exists cammesa_agentes_mem_tipo_idx on public.cammesa_agentes_mem(tipo_agente)")
    conn.commit()


def upsert_records(conn: psycopg.Connection, dataset: Dataset, records: list[dict[str, Any]], batch_size: int) -> int:
    columns = [col.name for col in dataset.columns] + ["source_file"]
    update_cols = [col for col in columns if col not in dataset.conflict_cols]
    statement = sql.SQL(
        "insert into public.{} ({}) values ({}) on conflict ({}) do update set {}"
    ).format(
        sql.Identifier(dataset.table),
        sql.SQL(", ").join(sql.Identifier(col) for col in columns),
        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
        sql.SQL(", ").join(sql.Identifier(col) for col in dataset.conflict_cols),
        sql.SQL(", ").join(
            sql.SQL("{} = excluded.{}").format(sql.Identifier(col), sql.Identifier(col))
            for col in update_cols
        ),
    )
    imported = 0
    with conn.cursor() as cur:
        for index in range(0, len(records), batch_size):
            batch = records[index : index + batch_size]
            rows = [tuple(record.get(col) for col in columns) for record in batch]
            cur.executemany(statement, rows)
            conn.commit()
            imported += len(batch)
            print(f"[{dataset.key}] {imported:,}/{len(records):,} rows loaded", flush=True)
    return imported


def count_table(conn: psycopg.Connection, table: str) -> int | None:
    try:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("select count(*) from public.{}").format(sql.Identifier(table)))
            return int(cur.fetchone()[0])
    except psycopg.errors.UndefinedTable:
        conn.rollback()
        return None


def cmd_inventory(args: argparse.Namespace) -> None:
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["key", "table", "importance", "rows_local", "size_kb", "exists", "reason", "path"],
    )
    writer.writeheader()
    with raw.connect() as conn:
        for dataset in selected_datasets(args):
            path = dataset_path(args.csv_dir, dataset)
            rows_local = ""
            if path.exists():
                with path.open("r", encoding="utf-8-sig", newline="") as handle:
                    rows_local = max(sum(1 for _ in handle) - 1, 0)
            remote_count = count_table(conn, dataset.table)
            writer.writerow(
                {
                    "key": dataset.key,
                    "table": dataset.table,
                    "importance": dataset.importance,
                    "rows_local": rows_local,
                    "size_kb": f"{path.stat().st_size / 1024:.1f}" if path.exists() else "missing",
                    "exists": "no" if remote_count is None else f"yes rows={remote_count}",
                    "reason": dataset.reason,
                    "path": path,
                }
            )


def cmd_load(args: argparse.Namespace) -> None:
    started = time.monotonic()
    datasets = selected_datasets(args)
    with raw.connect() as conn:
        for dataset in datasets:
            path = dataset_path(args.csv_dir, dataset)
            if not path.exists():
                raise FileNotFoundError(f"Missing CSV for {dataset.key}: {path}")
            print(f"==> {dataset.key} -> {dataset.table}", flush=True)
            create_table(conn, dataset)
            records = read_records(args.csv_dir, dataset)
            print(f"[{dataset.key}] {len(records):,} local rows from {path}", flush=True)
            upsert_records(conn, dataset, records, args.batch_size)
            remote_count = count_table(conn, dataset.table)
            print(f"[{dataset.key}] remote rows={remote_count:,}", flush=True)
    print(f"CSV load finished in {(time.monotonic() - started) / 60:.1f} min", flush=True)


def cmd_audit(args: argparse.Namespace) -> None:
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["key", "table", "importance", "rows_local", "rows_remote", "status"],
    )
    writer.writeheader()
    with raw.connect() as conn:
        for dataset in selected_datasets(args):
            path = dataset_path(args.csv_dir, dataset)
            rows_local = None
            if path.exists():
                with path.open("r", encoding="utf-8-sig", newline="") as handle:
                    rows_local = max(sum(1 for _ in handle) - 1, 0)
            rows_remote = count_table(conn, dataset.table)
            status = "missing_table" if rows_remote is None else "ok" if rows_local == rows_remote else "mismatch"
            writer.writerow(
                {
                    "key": dataset.key,
                    "table": dataset.table,
                    "importance": dataset.importance,
                    "rows_local": rows_local,
                    "rows_remote": rows_remote,
                    "status": status,
                }
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Load CAMMESA CSV/catalog files into Railway Postgres.")
    parser.add_argument("--csv-dir", type=Path, default=DEFAULT_CSV_DIR)
    parser.add_argument("--dataset", action="append", help="Dataset key or table name. Repeatable.")
    parser.add_argument("--critical", action="store_true", help="Only load critical product datasets.")
    parser.add_argument("--batch-size", type=int, default=2_000)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("inventory")
    sub.add_parser("load")
    sub.add_parser("audit")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.csv_dir = args.csv_dir.resolve()
    if args.command == "inventory":
        cmd_inventory(args)
    elif args.command == "load":
        cmd_load(args)
    elif args.command == "audit":
        cmd_audit(args)


if __name__ == "__main__":
    main()
