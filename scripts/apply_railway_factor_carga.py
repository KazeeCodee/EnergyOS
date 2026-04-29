from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_factor_carga.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecutá con `railway run -s Postgres python scripts/apply_railway_factor_carga.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            print("Aplicando vistas de perfil de carga P/V/R...")
            cur.execute(sql)

            print("Perfil por tipo:")
            cur.execute(
                """
                select tipo_agente, count(*) as filas, count(distinct nemo) as agentes,
                       count(*) filter (where calidad_dato = 'ok') as ok,
                       count(*) filter (where calidad_dato <> 'ok') as revisar
                from public.vw_factor_carga_mensual
                group by tipo_agente
                order by tipo_agente;
                """
            )
            for row in cur.fetchall():
                print("  ", row)

            print("Benchmark:")
            cur.execute(
                """
                select tipo_agente, count(*) as meses, min(anio * 100 + mes), max(anio * 100 + mes)
                from public.vw_factor_carga_benchmark
                group by tipo_agente
                order by tipo_agente;
                """
            )
            for row in cur.fetchall():
                print("  ", row)

            print("ACINVCSZ últimos meses:")
            cur.execute(
                """
                select nemo, anio, mes, pct_pico, pct_valle, pct_resto, ratio_pico_valle,
                       pct_pico_percentil, estacionalidad_yoy, calidad_dato
                from public.vw_factor_carga_mensual
                where nemo = 'ACINVCSZ'
                order by anio desc, mes desc
                limit 5;
                """
            )
            for row in cur.fetchall():
                print("  ", row)


if __name__ == "__main__":
    main()
