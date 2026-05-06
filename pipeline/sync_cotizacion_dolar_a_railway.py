"""
Sincroniza cotizacion_dolar_mayorista_bcra desde cammesa_parametros_mensuales
(Supabase) hacia Railway. Crea/actualiza la tabla cotizacion_dolar_mensual.

Idempotente: UPSERT por (anio, mes).

USO:
    railway run python pipeline/sync_cotizacion_dolar_a_railway.py
"""
from __future__ import annotations

import os
import sys

import psycopg
from supabase import create_client

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


DDL = """
CREATE TABLE IF NOT EXISTS public.cotizacion_dolar_mensual (
  anio int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cotizacion_ars numeric NOT NULL,
  fuente text NOT NULL DEFAULT 'BCRA mayorista (via DTE/ADCO)',
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);
"""


def supabase_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SB_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def database_url() -> str:
    url = (
        os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("RAILWAY_DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not url:
        raise SystemExit("DATABASE_URL no esta seteada (Railway)")
    return url


def main() -> int:
    print("=== Sync cotizacion dolar -> Railway ===\n")

    sb = supabase_client()
    res = (
        sb.table("cammesa_parametros_mensuales")
        .select("anio,mes,valor")
        .eq("parametro", "cotizacion_dolar_mayorista_bcra")
        .execute()
    )
    rows = res.data or []
    print(f"Filas obtenidas de Supabase: {len(rows)}")
    if not rows:
        print("Nada que sincronizar.")
        return 0

    url = database_url()
    print("Conectando a Railway Postgres...")
    inserted_or_updated = 0
    with psycopg.connect(url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            for r in rows:
                cur.execute(
                    """
                    INSERT INTO public.cotizacion_dolar_mensual
                        (anio, mes, cotizacion_ars)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (anio, mes) DO UPDATE SET
                        cotizacion_ars = EXCLUDED.cotizacion_ars,
                        procesado_en = now()
                    """,
                    (r["anio"], r["mes"], r["valor"]),
                )
                inserted_or_updated += 1
            cur.execute("SELECT COUNT(*) FROM public.cotizacion_dolar_mensual")
            total = cur.fetchone()[0]
        conn.commit()

    print(f"\nFilas procesadas: {inserted_or_updated}")
    print(f"Total en tabla: {total}")
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
