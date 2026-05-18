from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "scripts" / "sql" / "railway_client_private_data_room.sql"


def database_url() -> str:
    for key in ("RAILWAY_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL"):
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Falta DATABASE_URL. Ejecuta con `railway run -s Postgres python scripts/apply_railway_client_private_data_room.py`."
    )


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=False) as conn:
        with conn.cursor() as cur:
            print("Aplicando Data Room privado de cliente en Railway...")
            cur.execute(sql)
            cur.execute(
                """
                select count(*)
                from information_schema.tables
                where table_schema = 'client_private'
                  and table_type = 'BASE TABLE';
                """
            )
            table_count = cur.fetchone()[0]
            cur.execute("select to_regclass('client_private.v_contracts_latest') is not null;")
            has_view = cur.fetchone()[0]
        conn.commit()

    print(f"Tablas client_private: {table_count}")
    print(f"Vista contratos: {has_view}")


if __name__ == "__main__":
    main()
