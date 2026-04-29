"""
pipeline/ingest_sql_historico.py
T1.2 — Carga histórica de SQL locales hacia raw_* en Supabase.

USO:
    python pipeline/ingest_sql_historico.py --tabla raw_dte
    python pipeline/ingest_sql_historico.py --tabla raw_dexc --desde 2021-01 --hasta 2023-12
    python pipeline/ingest_sql_historico.py  # carga todas las tablas en LOAD_ORDER

VARIABLES DE ENTORNO requeridas (mismas que el resto del proyecto):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY   (necesario para bypass RLS durante carga masiva)

ESTRATEGIA:
    - Lee cada .sql del directorio local, detecta INSERT INTO <tabla> y lo reescribe
      a INSERT INTO public.<tabla> ... ON CONFLICT (source_zip, source_file, source_row) DO NOTHING
    - Envía en lotes de BATCH_SIZE filas via postgrest REST (no psycopg2).
    - Registra resultado en public.ingest_runs.
    - Idempotente: re-ejecutar es seguro.
"""
from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

# ─── Configuración ──────────────────────────────────────────────────────────

SQL_DIR = Path(os.getenv("CAMMESA_SQL_DIR",
    r"C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03"))

BATCH_SIZE = 7_500          # filas por request
WORKERS    = 4              # tablas en paralelo (usado desde CLI con xargs o ThreadPool)
LOG_EVERY  = 50_000         # loguear progreso cada N filas

# Orden de carga sugerido (grupo A→G del plan T1.2)
LOAD_ORDER = [
    # Grupo A — pequeñas, verifican pipeline
    "raw_aexp", "raw_agfq", "raw_auto", "raw_game",
    # Grupo B — medianas
    "raw_aama", "raw_atra", "raw_adco", "raw_adis", "raw_gudi", "raw_rscj",
    # Grupo C — grandes
    "raw_agen",
    # Grupo D — HTML Generación
    "raw_anexo_gen111","raw_anexo_gen112","raw_anexo_gen113","raw_anexo_gen114",
    "raw_anexo_gen115","raw_anexo_gen116","raw_anexo_gen117","raw_anexo_gen118",
    "raw_anexo_gen119","raw_anexo_gen12","raw_anexo_gen13",
    "raw_anexo_gen_disp_mejora","raw_anexo_generacion_forzada",
    "raw_anexo_gen_294pot","raw_anexo_gen_294ene",
    "raw_anexo_genmovil","raw_anexo_gennuc",
    # Grupo E — HTML MAT
    "raw_anexo_mat","raw_anexo_mat_plus","raw_anexo_mat_renovable",
    "raw_anexo_mat_cvt","raw_anexo_mat_cvt_plus","raw_anexo_mat_compromiso",
    "raw_anexo_mat_cont_delivery","raw_anexo_mat_cequip724",
    # Grupo F — HTML GUMA/GUME
    "raw_anexo_guma","raw_anexo_gume",
    # Grupo G — masivas
    "raw_dexc","raw_dte",
]

# ─── Supabase client (REST via httpx) ───────────────────────────────────────

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("VITE_SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or ""
).rstrip("/")
if not SUPABASE_URL:
    raise SystemExit("ERROR: define SUPABASE_URL, VITE_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal,resolution=ignore-duplicates",
}


def rest_insert(tabla: str, rows: list[dict]) -> tuple[int, int]:
    """
    POST /rest/v1/<tabla>?on_conflict=source_zip,source_file,source_row
    con Prefer: resolution=ignore-duplicates,count=exact.
    El campo 'id' local se elimina de cada fila para que Supabase use bigserial.
    Retorna (insertadas, omitidas).
    """
    # Quitar 'id' local — la PK remota es bigserial autogenerado
    clean = [{k: v for k, v in row.items() if k != "id"} for row in rows]
    url = (
        f"{SUPABASE_URL}/rest/v1/{tabla}"
        f"?on_conflict=source_zip,source_file,source_row"
    )
    with httpx.Client(timeout=120) as client:
        r = client.post(url, json=clean, headers={
            **HEADERS,
            "Prefer": "resolution=ignore-duplicates,count=exact",
        })
    if r.status_code not in (200, 201):
        raise RuntimeError(f"REST error {r.status_code}: {r.text[:300]}")
    cr = r.headers.get("Content-Range", "")
    m = re.search(r"\*/(\d+)", cr)
    inserted = int(m.group(1)) if m else len(clean)
    omitted  = len(clean) - inserted
    return inserted, omitted


def log_run(run_id: int | None, tabla: str, **kwargs) -> int | None:
    """Inserta o actualiza un registro en ingest_runs."""
    url = f"{SUPABASE_URL}/rest/v1/ingest_runs"
    with httpx.Client(timeout=30) as client:
        if run_id is None:
            r = client.post(url, json={"tabla": tabla, **kwargs},
                            headers={**HEADERS, "Prefer": "return=representation"})
            if r.status_code in (200, 201):
                data = r.json()
                return data[0]["id"] if isinstance(data, list) else data.get("id")
        else:
            r = client.patch(f"{url}?id=eq.{run_id}", json=kwargs, headers=HEADERS)
    return run_id


# ─── Parser de INSERT VALUES ─────────────────────────────────────────────────

# Columnas del envelope comunes a todas las tablas (en orden)
ENVELOPE_COLS = [
    "id","anio","mes","source_zip","source_file","source_row",
    "section_index","col_count","raw_text",
]

_RE_INSERT = re.compile(
    r"INSERT\s+INTO\s+(?:public\.)?(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)\s*;",
    re.IGNORECASE | re.DOTALL,
)

_RE_INSERT_STMT = re.compile(
    r"INSERT\s+INTO\s+(?:public\.)?(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+)\s*;",
    re.IGNORECASE | re.DOTALL,
)


def parse_value(v: str) -> str | None:
    """Convierte un token SQL VALUE a Python str o None."""
    v = v.strip()
    if v.upper() == "NULL":
        return None
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    return v


def split_values(raw: str) -> list[str]:
    """Divide la lista de valores de un VALUES(...) respetando strings con comas."""
    parts: list[str] = []
    depth = 0
    buf: list[str] = []
    in_str = False
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == "'" and not in_str:
            in_str = True
            buf.append(c)
        elif c == "'" and in_str:
            if i + 1 < len(raw) and raw[i + 1] == "'":  # escaped ''
                buf.append("''")
                i += 2
                continue
            in_str = False
            buf.append(c)
        elif c == "," and not in_str and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1
    if buf:
        parts.append("".join(buf).strip())
    return parts


def iter_insert_statements(sql_path: Path, tabla: str) -> Generator[str, None, None]:
    """Genera statements INSERT completos sin cortar por ';' dentro de strings."""
    insert_start = re.compile(rf"INSERT\s+INTO\s+(?:public\.)?{re.escape(tabla)}\b", re.IGNORECASE)
    buf: list[str] = []
    in_str = False

    with sql_path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not buf and not insert_start.search(line):
                continue

            buf.append(line)
            i = 0
            while i < len(line):
                c = line[i]
                if c == "'" and not in_str:
                    in_str = True
                elif c == "'" and in_str:
                    if i + 1 < len(line) and line[i + 1] == "'":
                        i += 2
                        continue
                    in_str = False
                elif c == ";" and not in_str:
                    yield "".join(buf)
                    buf = []
                    break
                i += 1


def iter_value_tuples(values_sql: str) -> Generator[str, None, None]:
    """Extrae cada tupla VALUES(...) respetando paréntesis dentro de strings."""
    depth = 0
    in_str = False
    buf: list[str] = []
    i = 0

    while i < len(values_sql):
        c = values_sql[i]
        if c == "'" and not in_str:
            in_str = True
            if depth > 0:
                buf.append(c)
        elif c == "'" and in_str:
            if i + 1 < len(values_sql) and values_sql[i + 1] == "'":
                if depth > 0:
                    buf.append("''")
                i += 2
                continue
            in_str = False
            if depth > 0:
                buf.append(c)
        elif c == "(" and not in_str:
            if depth > 0:
                buf.append(c)
            depth += 1
        elif c == ")" and not in_str:
            depth -= 1
            if depth == 0:
                yield "".join(buf)
                buf = []
            elif depth > 0:
                buf.append(c)
        elif depth > 0:
            buf.append(c)
        i += 1


def iter_rows_from_sql(sql_path: Path, tabla: str) -> Generator[dict, None, None]:
    """
    Lee un archivo .sql y genera dicts por cada fila INSERT.
    Soporta tanto INSERT ... VALUES (...); por línea
    como bloques multi-valor INSERT ... VALUES (...), (...), ...;
    Soporta que la cantidad de columnas cambie entre distintos INSERTs.
    """
    for stmt in iter_insert_statements(sql_path, tabla):
        m = _RE_INSERT_STMT.match(stmt.strip())
        if not m:
            continue
        active_cols = [c.strip().strip('"') for c in m.group(2).split(",")]

        for raw_vals in iter_value_tuples(m.group(3)):
            vals = split_values(raw_vals)
            if len(vals) != len(active_cols):
                raise ValueError(
                    f"{sql_path.name}: INSERT con {len(vals)} valores para "
                    f"{len(active_cols)} columnas en {tabla}"
                )

            row = {active_cols[i]: parse_value(vals[i]) for i in range(len(active_cols))}
            # source_zip puede venir vacío en SQLs viejos — usar nombre del archivo
            if not row.get("source_zip"):
                row["source_zip"] = sql_path.stem
            yield row


# ─── Carga de una tabla ──────────────────────────────────────────────────────

def _flush(tabla: str, batch: list[dict],
          period_runs: dict[tuple, int],
          counters: dict[tuple, dict]) -> None:
    """Envía un batch y actualiza contadores por (anio, mes)."""
    if not batch:
        return
    ins, omit = rest_insert(tabla, batch)
    # Distribuir proporcionalmente por periodo en el batch
    per_period: dict[tuple, list] = {}
    for row in batch:
        key = (row.get("anio"), row.get("mes"))
        per_period.setdefault(key, []).append(row)
    for key, rows_p in per_period.items():
        frac = len(rows_p) / len(batch)
        c = counters.setdefault(key, {"read": 0, "ins": 0, "omit": 0})
        c["ins"]  += round(ins  * frac)
        c["omit"] += round(omit * frac)


def load_tabla(tabla: str, sql_dir: Path,
               desde: tuple[int, int] | None = None,
               hasta: tuple[int, int] | None = None,
               limit: int | None = None) -> None:
    """Carga un archivo SQL consolidado por tabla registrando runs por (anio,mes)."""
    log = logging.getLogger(tabla)

    # Los SQLs locales son 1 archivo por tabla (no por mes)
    sql_files = sorted(sql_dir.glob(f"{tabla}*.sql"))
    if not sql_files:
        log.warning("No se encontraron archivos SQL para %s en %s", tabla, sql_dir)
        return

    for sql_path in sql_files:
        log.info("Cargando %s", sql_path.name)
        t0 = time.time()
        batch: list[dict] = []
        period_runs: dict[tuple, int] = {}   # (anio,mes) -> run_id
        counters:    dict[tuple, dict] = {}  # (anio,mes) -> {read,ins,omit}
        total_read = 0

        try:
            for row in iter_rows_from_sql(sql_path, tabla):
                anio = row.get("anio")
                mes  = row.get("mes")
                key  = (anio, mes)

                # Filtro por rango si aplica
                if desde and anio and mes and (int(anio), int(mes)) < desde:
                    continue
                if hasta and anio and mes and (int(anio), int(mes)) > hasta:
                    continue

                # Si cambian las columnas, hacer flush porque PostgREST exige que 
                # todos los objetos del array JSON tengan exactamente los mismos keys
                if batch and batch[0].keys() != row.keys():
                    _flush(tabla, batch, period_runs, counters)
                    batch = []

                # Abrir run_id para este periodo si no existe
                if key not in period_runs:
                    run_id = log_run(None, tabla, anio=anio, mes=mes,
                                     source_zip=sql_path.stem, estado="iniciado")
                    period_runs[key] = run_id
                    counters[key] = {"read": 0, "ins": 0, "omit": 0}

                counters[key]["read"] += 1
                batch.append(row)
                total_read += 1

                if len(batch) >= BATCH_SIZE:
                    _flush(tabla, batch, period_runs, counters)
                    batch = []

                if total_read % LOG_EVERY == 0:
                    total_ins  = sum(c["ins"]  for c in counters.values())
                    total_omit = sum(c["omit"] for c in counters.values())
                    log.info("  %s filas leídas, %s insertadas, %s omitidas",
                             total_read, total_ins, total_omit)

                if limit and total_read >= limit:
                    log.info("Limite de %s filas alcanzado — parando", limit)
                    break

            _flush(tabla, batch, period_runs, counters)

            duracion = round(time.time() - t0, 2)
            total_ins  = sum(c["ins"]  for c in counters.values())
            total_omit = sum(c["omit"] for c in counters.values())
            log.info("OK %s: %s ins / %s omit / %.1fs",
                     sql_path.name, total_ins, total_omit, duracion)

            # Cerrar cada run_id de periodo
            for key, run_id in period_runs.items():
                c = counters[key]
                log_run(run_id, tabla,
                        filas_leidas=c["read"], filas_insertadas=c["ins"],
                        filas_omitidas=c["omit"], filas_error=0,
                        duracion_seg=duracion, estado="completo",
                        terminado_en=datetime.now(timezone.utc).isoformat())

        except Exception as exc:
            duracion = round(time.time() - t0, 2)
            log.error("ERROR %s: %s", sql_path.name, exc)
            for key, run_id in period_runs.items():
                c = counters.get(key, {"read": 0, "ins": 0, "omit": 0})
                log_run(run_id, tabla,
                        filas_leidas=c["read"], filas_insertadas=c["ins"],
                        filas_omitidas=c["omit"], filas_error=1,
                        duracion_seg=duracion, estado="error",
                        mensaje_error=str(exc)[:500],
                        terminado_en=datetime.now(timezone.utc).isoformat())


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_period(s: str) -> tuple[int, int]:
    try:
        dt = datetime.strptime(s, "%Y-%m")
        return dt.year, dt.month
    except ValueError:
        raise argparse.ArgumentTypeError(f"Formato inválido '{s}'. Usar YYYY-MM.")


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    parser = argparse.ArgumentParser(
        description="T1.2 — Carga SQL históricos locales → Supabase raw_*"
    )
    parser.add_argument("--tabla", help="Tabla a cargar (ej: raw_dte). Omitir = todas.")
    parser.add_argument("--desde", type=parse_period, help="Periodo inicial YYYY-MM")
    parser.add_argument("--hasta", type=parse_period, help="Periodo final YYYY-MM")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limitar a N filas (para pruebas de smoke)")
    parser.add_argument("--sql-dir", type=Path, default=SQL_DIR,
                        help=f"Directorio con los .sql. Default: {SQL_DIR}")
    args = parser.parse_args()

    tablas = [args.tabla] if args.tabla else LOAD_ORDER
    for tabla in tablas:
        load_tabla(tabla, args.sql_dir, args.desde, args.hasta, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
