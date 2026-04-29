import sys
import os
import re
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import ingest_sql_historico as p

GRUPO_E = [
    "raw_anexo_mat",
    "raw_anexo_mat_plus",
    "raw_anexo_mat_renovable",
    "raw_anexo_mat_cvt",
    "raw_anexo_mat_cvt_plus",
    "raw_anexo_mat_compromiso",
    "raw_anexo_mat_cont_delivery",
    "raw_anexo_mat_cequip724"
]

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

def main():
    for tabla in GRUPO_E:
        print(f"\n[{tabla}] Iniciando validación y carga...")
        sql_path = SQL_DIR / f"{tabla}.sql"
        if not sql_path.exists():
            print(f"WARN: Archivo {sql_path} no encontrado, saltando.")
            continue
            
        print(f"[{tabla}] 1. Contando con regex...")
        with open(sql_path, encoding='utf-8', errors='replace') as f:
            content = f.read()
        regex_pattern = re.compile(rf'INSERT\s+INTO\s+(?:public\.)?{tabla}\b', re.IGNORECASE)
        regex_count = len(regex_pattern.findall(content))
        print(f"[{tabla}] -> Regex count: {regex_count}")
        
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
        
        if total != parser_count:
            print(f"❌ FALLA: Total remoto ({total}) != Conteo parser ({parser_count})")
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
            
        print(f"✅ [{tabla}] Carga y validación exitosa.")

if __name__ == "__main__":
    main()
