from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_historia_energetica.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecutá con `railway run -s Postgres python scripts/apply_railway_historia_energetica.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            print("Aplicando resumen de historia energética...")
            cur.execute(sql)

            print("Resumen por tipo:")
            cur.execute(
                """
                select tipo_agente, count(*) as agentes,
                       min(meses_disponibles), max(meses_disponibles),
                       sum(demanda_total_mwh)
                from public.vw_historia_resumen_agente
                group by tipo_agente
                order by tipo_agente;
                """
            )
            for row in cur.fetchall():
                print("  ", row)

            print("ACINVCSZ:")
            cur.execute(
                """
                select nemo, tipo_agente, meses_disponibles,
                       primer_anio, primer_mes, ultimo_anio, ultimo_mes,
                       demanda_total_mwh, mes_mayor_consumo_anio, mes_mayor_consumo_mes,
                       mes_mayor_consumo_mwh, variacion_yoy_ultimo_mes_pct,
                       variacion_ultimos_12m_pct
                from public.vw_historia_resumen_agente
                where nemo = 'ACINVCSZ';
                """
            )
            print("  ", cur.fetchone())


if __name__ == "__main__":
    main()
