from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_exposicion_spot_mat.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecutá con `railway run -s Postgres python scripts/apply_railway_exposicion_spot.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            print("Aplicando vistas materializadas de exposición spot vs MAT...")
            cur.execute(sql)
            print("Validando conteos...")
            cur.execute(
                """
                select tipo_agente, count(*) as filas, count(distinct nemo) as agentes
                from public.vw_exposicion_spot_mensual
                group by tipo_agente
                order by tipo_agente;
                """
            )
            for tipo, filas, agentes in cur.fetchall():
                print(f"  {tipo}: {filas:,} filas mensuales / {agentes:,} agentes")

            cur.execute(
                """
                select calidad_dato, count(*)
                from public.vw_exposicion_spot_mensual
                group by calidad_dato
                order by count(*) desc;
                """
            )
            print("Calidad:")
            for calidad, filas in cur.fetchall():
                print(f"  {calidad}: {filas:,}")

            cur.execute(
                """
                select nemo, tipo_agente, count(*) as meses, min(anio * 100 + mes), max(anio * 100 + mes)
                from public.vw_exposicion_spot_mensual
                group by nemo, tipo_agente
                order by meses desc, nemo
                limit 10;
                """
            )
            print("Top cobertura histórica:")
            for nemo, tipo, meses, desde, hasta in cur.fetchall():
                print(f"  {nemo} ({tipo}): {meses} meses, {desde}..{hasta}")


if __name__ == "__main__":
    main()
