# Brief T5.1 - Observabilidad

## Objetivo

Extender tracking de ingesta y refresh L2/L3.

## Entregables

- Tabla o extension de `ingest_runs` para `job_type`: `l1_ingest`, `l2_refresh`, `l3_refresh`.
- Campos: `tabla`, `anio`, `mes`, `filas_leidas`, `filas_insertadas`, `filas_omitidas`, `filas_error`, `duracion_seg`, `estado`, `mensaje_error`.
- Vista `pipeline_runs_health`.

## Reglas

- No tocar runs activos de Grupo G.
- Mantener compatibilidad con `pipeline/audit_fase1_raw.py`.

## Checks

```sql
select job_type, estado, count(*)
from public.pipeline_runs_health
group by job_type, estado;
```
