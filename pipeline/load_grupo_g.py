import sys
import os
import re
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import ingest_sql_historico as p

GRUPO_G = ["raw_dte"]
SQL_DIR = Path(os.getenv("CAMMESA_SQL_DIR", r"C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03"))

def get_remote_counts(tabla):
    cmd = f'npx supabase db query --linked --output csv "select count(*) as total, count(distinct (source_zip, source_file, source_row)) as unique_source, count(*) - count(distinct (source_zip, source_file, source_row)) as duplicate_sources from public.{tabla};"'
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        raise Exception(f"Error querying {tabla}: {res.stderr}")
    
    lines = [line.strip() for line in res.stdout.split('\n') if line.strip() and not line.startswith('Initialising')]
    if len(lines) < 2:
        return 0, 0, 0
    vals = lines[1].split(',')
    return int(vals[0]), int(vals[1]), int(vals[2])

def get_health_status(tabla):
    cmd = f'npx supabase db query --linked --output csv "select estado_cobertura from public.ingest_health where tabla = \'{tabla}\';"'
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    lines = [line.strip() for line in res.stdout.split('\n') if line.strip() and not line.startswith('Initialising')]
    if len(lines) < 2:
        return None
    return lines[1]

def get_runs_status(tabla):
    cmd = f'npx supabase db query --linked --output csv "select sum(filas_error) as errores, bool_or(terminado_en is null) as tiene_abiertos from public.ingest_runs where tabla = \'{tabla}\';"'
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    lines = [line.strip() for line in res.stdout.split('\n') if line.strip() and not line.startswith('Initialising')]
    if len(lines) < 2:
        return 0, False
    vals = lines[1].split(',')
    errores = 0 if vals[0] == '' else int(vals[0])
    tiene_abiertos = vals[1].lower() == 't'
    return errores, tiene_abiertos

def main():
    reporte = []
    
    for tabla in GRUPO_G:
        print(f"\n[{tabla}] Iniciando validación y carga (STREAMING)...")
        sql_path = SQL_DIR / f"{tabla}.sql"
        if not sql_path.exists():
            print(f"WARN: Archivo {sql_path} no encontrado, saltando.")
            continue
            
        print(f"[{tabla}] 1. Contando local (streaming)...")
        rx = re.compile(rf'INSERT\s+INTO\s+(?:public\.)?{tabla}\b', re.IGNORECASE)
        regex_count = 0
        with sql_path.open(encoding='utf-8', errors='replace') as f:
            for line in f:
                if rx.search(line):
                    regex_count += 1
        print(f"[{tabla}] -> Local count: {regex_count}")
        
        print(f"[{tabla}] 2. Contando con parser...")
        parser_count = sum(1 for _ in p.iter_rows_from_sql(sql_path, tabla))
        print(f"[{tabla}] -> Parser count: {parser_count}")
        
        if regex_count != parser_count:
            print(f"❌ FALLA: Conteo regex ({regex_count}) != conteo parser ({parser_count})")
            sys.exit(1)
            
        print(f"[{tabla}] 3. Cargando datos...")
        load_cmd = f"python pipeline/ingest_sql_historico.py --tabla {tabla}"
        res = subprocess.run(load_cmd, shell=True)
        if res.returncode != 0:
            print(f"❌ FALLA: Error durante ingest_sql_historico.py para {tabla}")
            sys.exit(1)
            
        print(f"[{tabla}] 4. Verificando resultados remotos...")
        total, unique, dups = get_remote_counts(tabla)
        print(f"[{tabla}] -> Remoto: Total={total}, Unique={unique}, Duplicates={dups}")
        
        if total != regex_count:
            print(f"❌ FALLA: Total remoto ({total}) != Local count ({regex_count})")
            sys.exit(1)
            
        if total != unique:
            print(f"❌ FALLA: Total remoto ({total}) != Unique source ({unique})")
            sys.exit(1)
            
        if dups != 0:
            print(f"❌ FALLA: Duplicados detectados: {dups}")
            sys.exit(1)
            
        status = get_health_status(tabla)
        print(f"[{tabla}] -> Estado ingest_health: {status}")
        if status != "ok":
            print(f"❌ FALLA: estado_cobertura = '{status}' (esperado 'ok')")
            sys.exit(1)
            
        errores, tiene_abiertos = get_runs_status(tabla)
        print(f"[{tabla}] -> Runs Status: errores={errores}, abiertos={tiene_abiertos}")
        if errores > 0 or tiene_abiertos:
            print(f"❌ FALLA: ingest_runs tiene errores ({errores}) o runs abiertos ({tiene_abiertos})")
            sys.exit(1)
            
        print(f"✅ [{tabla}] Carga y validación exitosa.")
        reporte.append(f"{tabla} | {regex_count} | {parser_count} | {total} | {unique} | {dups} | {status} | Err:{errores} | Open:{tiene_abiertos}")

    print("\n\n--- REPORTE FINAL GRUPO G ---")
    print("tabla | local_count | parser_count | remote_total | unique_source | duplicate_sources | ingest_health | runs_err | runs_open")
    for r in reporte:
        print(r)

if __name__ == "__main__":
    main()
