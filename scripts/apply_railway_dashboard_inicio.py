from __future__ import annotations

import os
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_dashboard_inicio.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecutá con `railway run -s Postgres python scripts/apply_railway_dashboard_inicio.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            print("Aplicando vistas de dashboard de inicio...")
            cur.execute(sql)
            cur.execute(
                """
                select tipo_agente, count(*) as meses_tipo, min(anio * 100 + mes), max(anio * 100 + mes)
                from public.vw_universo_demanda_mensual
                group by tipo_agente
                order by tipo_agente;
                """
            )
            print("Universo:")
            for row in cur.fetchall():
                print("  ", row)
            cur.execute("select * from public.vw_mercado_resumen_mensual order by anio desc, mes desc limit 1")
            print("Mercado:", cur.fetchone())


if __name__ == "__main__":
    main()
