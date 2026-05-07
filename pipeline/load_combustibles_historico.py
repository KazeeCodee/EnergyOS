r"""
Carga el histórico de Consumos y precios Combustibles a Railway.

Lee el CSV producido por:
    C:\Users\quime\Documents\Energyos\Informes de Combustibles\
    build_combustibles_historico.py
y lo inserta en la tabla public.combustibles_precios_mensual de Railway.

USO:
    # 1. Aplicar primero la migración SQL (una sola vez):
    railway run psql $DATABASE_URL -f scripts/sql/railway_combustibles_precios_mensual.sql

    # 2. Cargar el CSV (idempotente — se puede correr N veces):
    railway run python pipeline/load_combustibles_historico.py

    # Opcional — pasar una ruta CSV distinta:
    railway run python pipeline/load_combustibles_historico.py --csv "C:\path\to\alt.csv"

    # Modo dry-run: lee y valida sin insertar:
    railway run python pipeline/load_combustibles_historico.py --dry-run

ESTRATEGIA DE INSERT:
    - Idempotente vía UPSERT por (anio, mes).
    - Cada corrida actualiza filas existentes y agrega nuevas.
    - No borra datos: si un mes desaparece del CSV, queda viejo en la tabla
      (intencional, evita pérdida accidental).
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

# Forzar UTF-8 en stdout (Windows cp1252 no soporta caracteres no-ASCII)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_CSV = Path(
    r"C:\Users\quime\Documents\Energyos\Informes de Combustibles"
    r"\combustibles_historico_serie_mensual.csv"
)
TABLE = "combustibles_precios_mensual"

# Columnas de datos (no incluye id que es bigserial autoincremental)
DATA_COLUMNS = (
    "anio", "mes", "n_dias",
    "consumo_mm3_d_gn", "consumo_mm3_d_alt", "consumo_mm3_d_total",
    "precio_comb_usd_mmbtu_gn", "precio_comb_usd_mmbtu_alt", "precio_comb_usd_mmbtu_total",
    "monto_comb_mmusd_gn", "monto_comb_mmusd_alt", "monto_comb_mmusd_total",
    "generacion_mwh_gn", "generacion_mwh_alt", "generacion_mwh_total",
    "costo_oym_usd_mwh_gn", "costo_oym_usd_mwh_alt", "costo_oym_usd_mwh_total",
    "costo_comb_usd_mwh_gn", "costo_comb_usd_mwh_alt", "costo_comb_usd_mwh_total",
    "costo_total_usd_mwh_gn", "costo_total_usd_mwh_alt", "costo_total_usd_mwh_total",
    "source_file", "parser_version",
)

INT_COLUMNS = {"anio", "mes", "n_dias"}
TEXT_COLUMNS = {"source_file", "parser_version"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def database_url() -> str:
    """Mismo orden de prioridad que los otros scripts de Railway del proyecto."""
    url = (
        os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("RAILWAY_DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not url:
        raise SystemExit(
            "DATABASE_URL no está seteada. Corré con `railway run python ...` "
            "o creá .env.railway.local con DATABASE_URL."
        )
    return url


def parse_value(col: str, raw: str) -> Any:
    """Convierte el string crudo del CSV al tipo correcto para psycopg."""
    if raw is None or raw == "":
        return None
    if col in TEXT_COLUMNS:
        return raw
    if col in INT_COLUMNS:
        try:
            return int(float(raw))
        except (ValueError, TypeError):
            return None
    # numeric
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def read_csv(csv_path: Path) -> list[dict]:
    if not csv_path.exists():
        raise SystemExit(f"CSV no encontrado: {csv_path}")
    rows = []
    with csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cleaned = {col: parse_value(col, row.get(col, "")) for col in DATA_COLUMNS}
            rows.append(cleaned)
    return rows


def build_upsert_query() -> sql.Composed:
    """
    INSERT ... ON CONFLICT (anio, mes) DO UPDATE.
    Idempotente: re-ejecutar la carga actualiza las filas existentes
    sin perder el id ni borrar otras.
    """
    cols = sql.SQL(", ").join(sql.Identifier(c) for c in DATA_COLUMNS)
    placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in DATA_COLUMNS)

    update_cols = [c for c in DATA_COLUMNS if c not in ("anio", "mes")]
    update_set = sql.SQL(", ").join(
        sql.SQL("{col} = EXCLUDED.{col}").format(col=sql.Identifier(c)) for c in update_cols
    )
    # también actualizamos procesado_en para auditoría
    update_set = sql.SQL("{}, procesado_en = now()").format(update_set)

    return sql.SQL(
        "INSERT INTO public.{table} ({cols}) VALUES ({vals}) "
        "ON CONFLICT (anio, mes) DO UPDATE SET {updates}"
    ).format(
        table=sql.Identifier(TABLE),
        cols=cols,
        vals=placeholders,
        updates=update_set,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Carga combustibles_historico_serie_mensual.csv a Railway"
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV,
                        help=f"Ruta al CSV (default: {DEFAULT_CSV})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Lee y valida sin insertar")
    args = parser.parse_args()

    print(f"=== Carga combustibles_precios_mensual a Railway ===\n")
    print(f"CSV: {args.csv}")
    rows = read_csv(args.csv)
    print(f"Filas leídas: {len(rows)}")

    if not rows:
        print("CSV vacío. Nada que cargar.")
        return 1

    # validaciones básicas
    sin_anio = sum(1 for r in rows if r["anio"] is None)
    sin_mes = sum(1 for r in rows if r["mes"] is None)
    if sin_anio or sin_mes:
        print(f"⚠ {sin_anio} filas sin anio, {sin_mes} sin mes — se ignorarán")
        rows = [r for r in rows if r["anio"] is not None and r["mes"] is not None]

    print(f"Filas válidas a cargar: {len(rows)}")
    rango = sorted({(r["anio"], r["mes"]) for r in rows})
    if rango:
        print(f"Rango: {rango[0][0]}-{rango[0][1]:02d}  →  {rango[-1][0]}-{rango[-1][1]:02d}")

    if args.dry_run:
        print("\n[DRY RUN] No se insertó nada. Para cargar de verdad: quitá --dry-run.")
        return 0

    url = database_url()
    print(f"\nConectando a Railway Postgres...")

    upsert_q = build_upsert_query()
    inserted = 0
    updated = 0

    with psycopg.connect(url, autocommit=False) as conn:
        with conn.cursor() as cur:
            # contar filas previas para reportar diff
            cur.execute(f"SELECT COUNT(*) FROM public.{TABLE}")
            count_before = cur.fetchone()[0]
            print(f"Filas previas en la tabla: {count_before}")

            # cargar
            for r in rows:
                values = tuple(r[c] for c in DATA_COLUMNS)
                cur.execute(upsert_q, values)

            cur.execute(f"SELECT COUNT(*) FROM public.{TABLE}")
            count_after = cur.fetchone()[0]
            inserted = count_after - count_before
            updated = len(rows) - inserted

        conn.commit()

    print(f"\n=== Resultado ===")
    print(f"  Filas nuevas insertadas: {inserted}")
    print(f"  Filas actualizadas (UPSERT): {updated}")
    print(f"  Total en la tabla ahora: {count_after}")
    print(f"\n✓ Carga exitosa. La tabla public.{TABLE} está lista.")
    print(f"  Probá:  SELECT anio, mes, costo_total_usd_mwh_alt FROM public.{TABLE} ORDER BY anio, mes;")
    return 0


if __name__ == "__main__":
    sys.exit(main())
