from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any, Iterator

from supabase import Client, create_client


DEFAULT_SQL_DIR = Path(r"C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03")
TARGET_FILES = {
    "raw_amat": "raw_amat.sql",
    "raw_agum": "raw_agum.sql",
    "raw_atra": "raw_atra.sql",
}


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno obligatoria {name}")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa tablas raw historicas CAMMESA a Supabase por lotes.")
    parser.add_argument(
        "--sql-dir",
        type=Path,
        default=DEFAULT_SQL_DIR,
        help="Directorio donde viven los raw_*.sql historicos.",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        choices=sorted(TARGET_FILES),
        default=sorted(TARGET_FILES),
        help="Tablas raw a importar.",
    )
    parser.add_argument("--batch-size", type=int, default=500, help="Cantidad de filas por insert REST.")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Borra todo el contenido actual de la tabla antes de importar.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Limita la cantidad de filas importadas por tabla. Util para pruebas.",
    )
    return parser.parse_args()


def split_sql_values(raw: str) -> list[str]:
    values: list[str] = []
    token_chars: list[str] = []
    in_string = False
    i = 0
    while i < len(raw):
        char = raw[i]
        if in_string:
            if char == "'":
                if i + 1 < len(raw) and raw[i + 1] == "'":
                    token_chars.append("'")
                    i += 2
                    continue
                in_string = False
                i += 1
                continue
            token_chars.append(char)
            i += 1
            continue
        if char == "'":
            in_string = True
            i += 1
            continue
        if char == ",":
            values.append("".join(token_chars).strip())
            token_chars = []
            i += 1
            continue
        token_chars.append(char)
        i += 1
    values.append("".join(token_chars).strip())
    return values


def parse_sql_scalar(token: str) -> Any:
    if token == "NULL":
        return None
    if token == "":
        return ""
    compact = token.replace(" ", "")
    if compact.isdigit() or (compact.startswith("-") and compact[1:].isdigit()):
        try:
            return int(compact)
        except ValueError:
            return token
    return token


def extract_insert_columns(line: str, table_name: str) -> list[str]:
    marker = f"INSERT INTO {table_name} ("
    if marker not in line:
        raise ValueError(f"No pude detectar columnas en INSERT de {table_name}")
    start = line.index(marker) + len(marker)
    end = line.index(") VALUES", start)
    return [column.strip() for column in line[start:end].split(",")]


def extract_insert_values(line: str) -> list[Any]:
    values_marker = " VALUES ("
    start = line.index(values_marker) + len(values_marker)
    end = line.rfind(");")
    raw_values = line[start:end]
    return [parse_sql_scalar(token) for token in split_sql_values(raw_values)]


def iter_insert_rows(sql_path: Path, table_name: str) -> Iterator[dict[str, Any]]:
    with sql_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.startswith(f"INSERT INTO {table_name} "):
                continue
            columns = extract_insert_columns(line, table_name)
            values = extract_insert_values(line)
            if len(values) != len(columns):
                raise ValueError(
                    f"Cantidad de valores distinta a columnas en {sql_path.name}:{line_number} "
                    f"({len(values)} vs {len(columns)})"
                )
            yield dict(zip(columns, values, strict=True))


def batched_rows(rows: Iterator[dict[str, Any]], batch_size: int, max_rows: int | None) -> Iterator[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    count = 0
    for row in rows:
        batch.append(row)
        count += 1
        if max_rows is not None and count >= max_rows:
            yield batch
            return
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def delete_all_rows(supabase: Client, table_name: str) -> None:
    supabase.table(table_name).delete().neq("id", -1).execute()


def import_table(
    supabase: Client,
    sql_dir: Path,
    table_name: str,
    batch_size: int,
    truncate: bool,
    max_rows: int | None,
) -> int:
    sql_path = sql_dir / TARGET_FILES[table_name]
    if not sql_path.exists():
        raise FileNotFoundError(f"No existe {sql_path}")

    if truncate:
        logging.info("[%s] limpiando tabla antes de importar", table_name)
        delete_all_rows(supabase, table_name)

    total = 0
    for batch_index, batch in enumerate(
        batched_rows(iter_insert_rows(sql_path, table_name), batch_size=batch_size, max_rows=max_rows),
        start=1,
    ):
        supabase.table(table_name).insert(batch).execute()
        total += len(batch)
        logging.info("[%s] batch %s insertado (%s filas acumuladas)", table_name, batch_index, total)
    return total


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    supabase = create_client(
        get_required_env("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY") or get_required_env("SUPABASE_SERVICE_KEY"),
    )

    for table_name in args.tables:
        imported = import_table(
            supabase,
            sql_dir=args.sql_dir,
            table_name=table_name,
            batch_size=args.batch_size,
            truncate=args.truncate,
            max_rows=args.max_rows,
        )
        logging.info("[%s] importacion finalizada con %s filas", table_name, imported)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
