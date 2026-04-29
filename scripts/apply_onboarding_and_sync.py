"""
Bootstrap del flujo de onboarding (paso a paso, idempotente).

Uso:
    SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
    python scripts/apply_onboarding_and_sync.py

La URL hay que sacarla de Supabase Studio:
    Settings -> Database -> Connection string -> Session pooler (recomendado)
    [Mostrar password] y reemplazarlo en la cadena.

Para Railway usa la pública por defecto (DATABASE_PUBLIC_URL del servicio Postgres).
Podés overridear con RAILWAY_DB_URL.

Etapas:
    1) Verifica estado actual de ambas bases
    2) Aplica supabase/migrations/20260429180000_user_onboarding_flow.sql
    3) Sincroniza cammesa_agentes_mem desde Railway -> Supabase (UPSERT)
    4) Smoke test de las RPCs
"""
import os
import sys
from pathlib import Path
import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260429180000_user_onboarding_flow.sql"

SUPA_URL = os.environ.get("SUPABASE_DB_URL")
RAIL_URL = os.environ.get(
    "RAILWAY_DB_URL",
    "postgresql://postgres:lhEePshmcYcoevoyCbmkKlvPiOrRiApn@shuttle.proxy.rlwy.net:12224/railway",
)

if not SUPA_URL:
    print(
        "ERROR: definí SUPABASE_DB_URL en el entorno.\n"
        "  Sacalo de Supabase Studio -> Settings -> Database -> Connection string\n"
        "  Recomendado: Session pooler (IPv4, password de Postgres)\n"
        "Ejemplo:\n"
        "  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
    )
    sys.exit(2)


def hr(t):
    print(f"\n{'=' * 70}\n  {t}\n{'=' * 70}")


def fetch_one(conn, sql, params=()):
    with conn.cursor() as c:
        c.execute(sql, params)
        return c.fetchone()


def fetch_all(conn, sql, params=()):
    with conn.cursor() as c:
        c.execute(sql, params)
        return c.fetchall()


# ============================================================================
# 1) ESTADO ACTUAL
# ============================================================================
hr("1) ESTADO ACTUAL")

with psycopg.connect(SUPA_URL, connect_timeout=20) as supa:
    r = fetch_one(
        supa,
        """SELECT EXISTS(
             SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cammesa_agentes_mem'
           );""",
    )
    print(f"  Supabase.cammesa_agentes_mem existe? : {r[0]}")
    if r[0]:
        rc = fetch_one(supa, "SELECT COUNT(*) FROM public.cammesa_agentes_mem;")
        print(f"  Supabase.cammesa_agentes_mem filas    : {rc[0]}")
    for tn in ("user_profiles", "user_agentes", "user_onboarding_audit"):
        r = fetch_one(
            supa,
            f"SELECT EXISTS(SELECT 1 FROM information_schema.tables "
            f"WHERE table_schema='public' AND table_name='{tn}');",
        )
        print(f"  {tn:<24} existe? : {r[0]}")
    r = fetch_one(supa, "SELECT COUNT(*) FROM auth.users;")
    print(f"  auth.users                           : {r[0]} usuarios")

with psycopg.connect(RAIL_URL, connect_timeout=20) as rail:
    r = fetch_one(rail, "SELECT COUNT(*) FROM public.cammesa_agentes_mem;")
    print(f"  Railway.cammesa_agentes_mem  filas   : {r[0]}")


# ============================================================================
# 2) APLICAR MIGRACIÓN
# ============================================================================
hr("2) APLICAR MIGRACION en Supabase")

sql = MIGRATION.read_text(encoding="utf-8")
with psycopg.connect(SUPA_URL, connect_timeout=30) as supa:
    with supa.cursor() as cur:
        cur.execute(sql)
    supa.commit()
print(f"  aplicada: {MIGRATION.name}")

with psycopg.connect(SUPA_URL, connect_timeout=20) as supa:
    rows = fetch_all(
        supa,
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema='public'
             AND table_name IN ('user_profiles','user_agentes','user_onboarding_audit','cammesa_agentes_mem')
           ORDER BY table_name;""",
    )
    print("  tablas:", [r[0] for r in rows])

    rows = fetch_all(
        supa,
        """SELECT routine_name FROM information_schema.routines
           WHERE routine_schema='public'
             AND routine_name IN (
               'set_user_role','link_user_agente','unlink_user_agente',
               'me_profile','me_agentes','current_user_nemos',
               'accept_terms','search_cammesa_agentes','handle_new_user'
             )
           ORDER BY routine_name;""",
    )
    print("  RPCs  :", sorted({r[0] for r in rows}))

    r = fetch_one(supa, "SELECT COUNT(*) FROM public.user_profiles;")
    print(f"  user_profiles (post-backfill): {r[0]} filas")


# ============================================================================
# 3) SYNC catalogo Railway -> Supabase
# ============================================================================
hr("3) SYNC cammesa_agentes_mem  Railway -> Supabase")

with psycopg.connect(RAIL_URL, connect_timeout=30) as rail:
    rail_rows = fetch_all(
        rail,
        """SELECT nemo, descripcion, agrupacion, tipo_agente
           FROM public.cammesa_agentes_mem
           WHERE nemo IS NOT NULL;""",
    )
print(f"  leídos de Railway: {len(rail_rows)} filas")

# Detectar UNIQUE/PK sobre nemo
with psycopg.connect(SUPA_URL, connect_timeout=20) as supa:
    has_unique_nemo = fetch_one(
        supa,
        """SELECT EXISTS(
             SELECT 1 FROM pg_indexes
             WHERE schemaname='public' AND tablename='cammesa_agentes_mem'
               AND indexdef ILIKE '%%UNIQUE%%' AND indexdef ILIKE '%%(nemo%%'
           );""",
    )[0]
    if not has_unique_nemo:
        # Puede ser PK directo
        has_unique_nemo = fetch_one(
            supa,
            """SELECT EXISTS(
                 SELECT 1 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kc USING (constraint_name, table_name, table_schema)
                 WHERE tc.table_schema='public' AND tc.table_name='cammesa_agentes_mem'
                   AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE') AND kc.column_name='nemo'
               );""",
        )[0]
print(f"  unique/pk en nemo: {has_unique_nemo}")

with psycopg.connect(SUPA_URL, connect_timeout=120) as supa:
    with supa.cursor() as cur:
        if has_unique_nemo:
            cur.executemany(
                """INSERT INTO public.cammesa_agentes_mem (nemo, descripcion, agrupacion, tipo_agente)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (nemo) DO UPDATE
                     SET descripcion = EXCLUDED.descripcion,
                         agrupacion  = EXCLUDED.agrupacion,
                         tipo_agente = EXCLUDED.tipo_agente,
                         synced_at   = NOW();""",
                rail_rows,
            )
        else:
            print("  -> sin unique(nemo); usando TRUNCATE+INSERT en una transaccion")
            cur.execute("TRUNCATE TABLE public.cammesa_agentes_mem RESTART IDENTITY CASCADE;")
            cur.executemany(
                "INSERT INTO public.cammesa_agentes_mem (nemo, descripcion, agrupacion, tipo_agente) VALUES (%s, %s, %s, %s);",
                rail_rows,
            )
    supa.commit()

with psycopg.connect(SUPA_URL, connect_timeout=20) as supa:
    rc = fetch_one(supa, "SELECT COUNT(*) FROM public.cammesa_agentes_mem;")
    print(f"  Supabase.cammesa_agentes_mem post-sync: {rc[0]} filas")
    rows = fetch_all(
        supa,
        """SELECT tipo_agente, COUNT(*)
           FROM public.cammesa_agentes_mem
           GROUP BY tipo_agente
           ORDER BY 2 DESC LIMIT 10;""",
    )
    print("  Top tipos:")
    for r in rows:
        print(f"     {r[0]:<35} {r[1]:>5}")


# ============================================================================
# 4) SMOKE TEST RPCs (sin auth, security definer las deja correr)
# ============================================================================
hr("4) SMOKE TEST")

with psycopg.connect(SUPA_URL, connect_timeout=20) as supa:
    rows = fetch_all(
        supa,
        "SELECT nemo, descripcion, tipo_agente FROM public.search_cammesa_agentes(%s, %s, %s);",
        ("ACINDAR", 5, ["Gran Usuario Mayor (GUMA)"]),
    )
    print(f"  search('ACINDAR', tipos=[GUMA]) -> {len(rows)} filas")
    for r in rows:
        print(f"     {r[0]:<10} {r[1][:48]:<48} {r[2]}")

    rows = fetch_all(supa, "SELECT * FROM public.me_profile();")
    print(f"  me_profile() sin auth -> {len(rows)} filas (esperado 0)")

    rows = fetch_all(supa, "SELECT * FROM public.current_user_nemos();")
    print(f"  current_user_nemos() sin auth -> {len(rows)} filas (esperado 0)")

    try:
        with supa.cursor() as cur:
            cur.execute("SELECT public.set_user_role(%s);", ("gran_consumidor",))
        supa.rollback()
        print("  set_user_role sin auth -> NO falló (BUG)")
    except psycopg.errors.RaiseException as e:
        supa.rollback()
        msg = str(e).strip().split("\n")[0]
        print(f"  set_user_role sin auth -> {msg!r} (esperado 'unauthenticated')")

print("\nDONE")
