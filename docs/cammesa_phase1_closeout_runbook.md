# CAMMESA Phase 1 Closeout Runbook

## Objetivo

Cerrar Fase 1 con evidencia reproducible y lista para auditoria.

## Paso 1 - Confirmar que no hay cargas vivas

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*load_grupo_g*' -or $_.CommandLine -like '*ingest_sql_historico*raw_d*' } |
  Select-Object ProcessId,Name,CommandLine
```

Debe devolver vacio o procesos no relacionados.

## Paso 2 - Correr auditor global

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --fail-on-mismatch --output docs\cammesa_phase1_audit.md
```

## Paso 3 - Interpretar estados

| Estado | Decision |
|---|---|
| `ok` | aceptar |
| `warn_prior_errors` | aceptar si conteos cuadran y hay nota del incidente |
| `pending` | esperar/reintentar tabla |
| `fail` | bloquear Fase 2 |
| `missing_*` | bloquear Fase 2 |

## Paso 4 - Smoke T2.0

```powershell
npx supabase db query --linked --output csv "select public.parse_es_number('1.234,56') as n1, public.parse_es_number('1 234,56') as n2, public.parse_es_number('1234.56') as n3, public.parse_es_date('13-12-2025') as d1, public.parse_es_date('08-02-24') as d2, public.nemo_from('ABCDEFGH resto') as nemo;"
```

Esperado:

```csv
n1,n2,n3,d1,d2,nemo
1234.56,1234.56,1234.56,2025-12-13,2024-02-08,ABCDEFGH
```

## Paso 5 - Congelar evidencia

Guardar:

- `docs/cammesa_phase1_audit.md`
- reporte final de Grupo G
- listado de migrations aplicadas

## Paso 6 - Autorizar Fase 2

Despachar briefs desde `docs/briefs/cammesa_t2_readme.md`.
