from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_compliance_27191.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecutá con `railway run -s Postgres python scripts/apply_railway_compliance_27191.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            print("Aplicando vistas de compliance Ley 27.191...")
            cur.execute(sql)

            print("Renovable contratado:")
            cur.execute(
                """
                select count(*) as filas, count(distinct nemo) as agentes,
                       sum(renovable_contratado_mwh) as mwh,
                       sum(importe_renovable_pesos) as pesos
                from public.vw_renovable_contratado_mensual;
                """
            )
            print("  ", cur.fetchone())

            print("Compliance por tipo:")
            cur.execute(
                """
                select tipo_agente, count(*) as filas, count(distinct nemo) as agentes,
                       count(*) filter (where cumple_mes) as cumple_mes,
                       count(*) filter (where not cumple_mes) as no_cumple_mes
                from public.vw_compliance_27191_mensual
                group by tipo_agente
                order by tipo_agente;
                """
            )
            for row in cur.fetchall():
                print("  ", row)

            print("Top brechas último período:")
            cur.execute(
                """
                select nemo, tipo_agente, anio, mes, demanda_real_mwh, renovable_contratado_mwh,
                       obligacion_pct, brecha_mwh, multa_estimada_pesos, multa_metodo
                from public.vw_compliance_27191_mensual
                where (anio, mes) = (
                  select anio, mes
                  from public.vw_compliance_27191_mensual
                  order by anio desc, mes desc
                  limit 1
                )
                order by brecha_mwh desc
                limit 10;
                """
            )
            for row in cur.fetchall():
                print("  ", row)


if __name__ == "__main__":
    main()
