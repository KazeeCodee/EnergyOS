# CAMMESA Phase 2 Readiness

Estado operativo para pasar de Fase 1 (raw historico) a Fase 2 (L2 semantica).

## Gate final de Fase 1

Antes de arrancar parsers T2.x, correr:

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --fail-on-mismatch --output docs\cammesa_phase1_audit.md
```

Para una corrida rapida durante cargas en curso:

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --skip-parser --output docs\cammesa_phase1_audit.md
```

Interpretacion:

| estado | Significado | Accion |
|---|---|---|
| `ok` | local/parser/remoto/unique/health cuadran | Aceptar tabla |
| `warn_prior_errors` | los datos cuadran, pero `ingest_runs` conserva errores de intentos anteriores | Aceptable si el incidente esta documentado |
| `pending` | carga incompleta o runs abiertos | Esperar o re-ejecutar tabla idempotente |
| `fail` | discrepancia de datos, duplicados, health incorrecto o remoto mayor al local | Parar y diagnosticar |
| `missing_local` / `missing_remote` / `missing_parser` | falta archivo, tabla o conteo | Parar |

## Estado por familias

| Familia | Tablas | Estado |
|---|---|---|
| Base M1/M2/M3/M4 | `raw_amat`, `raw_agum`, `raw_atra` | cargadas |
| Grupo A | `raw_aexp`, `raw_agfq`, `raw_auto`, `raw_game` | cargadas |
| Grupo B | `raw_aama`, `raw_adco`, `raw_adis`, `raw_gudi`, `raw_rscj` | cargadas |
| Grupo C | `raw_agen` | cargada |
| Grupo D | `raw_anexo_gen*` | cargadas |
| Grupo E | `raw_anexo_mat*` | cargadas |
| Grupo F | `raw_anexo_guma`, `raw_anexo_gume` | cargadas por implementador |
| Grupo G | `raw_dexc`, `raw_dte` | pendiente / en curso |

## T2.0 Helpers

Helpers aplicados:

| Funcion | Casos minimos verificados |
|---|---|
| `public.parse_es_number(text)` | `1.234,56`, `1 234,56`, `1234.56` |
| `public.parse_es_date(text)` | `13-12-2025`, `08-02-24` |
| `public.nemo_from(text)` | primeros 8 caracteres trimmeados |

Query de smoke test:

```sql
select
  public.parse_es_number('1.234,56') as n1,
  public.parse_es_number('1 234,56') as n2,
  public.parse_es_number('1234.56') as n3,
  public.parse_es_date('13-12-2025') as d1,
  public.parse_es_date('08-02-24') as d2,
  public.nemo_from('ABCDEFGH resto') as nemo;
```

Resultado esperado:

```csv
n1,n2,n3,d1,d2,nemo
1234.56,1234.56,1234.56,2025-12-13,2024-02-08,ABCDEFGH
```

## Orden recomendado de Fase 2

No poblar ninguna L2 hasta que el gate final de Fase 1 de `ok` o `warn_prior_errors` para todas las tablas.

Una vez cerrado Grupo G:

| Prioridad | Tarea | Output L2 | Raw requeridas | Estado de insumos |
|---|---|---|---|---|
| 1 | T2.1 | `mater_contrato_mensual` | `raw_anexo_mat`, fallback `raw_amat` | listo |
| 2 | T2.2 | `guma_detalle_mensual` | `raw_anexo_guma`, fallback `raw_agum` | listo |
| 3 | T2.3 | `transporte_concepto_mensual` | `raw_atra`, `raw_anexo_guma`, `raw_anexo_gume` | listo |
| 4 | T2.6 | `cuenta_corriente_agente` | `raw_rscj` | listo |
| 5 | T2.4 | `excedente_mensual` | `raw_dexc` | bloqueado por Grupo G |
| 6 | T2.5 | `dte_resumen_agente` | `raw_dte` | bloqueado por Grupo G |

Despues de esos seis, seguir con:

| Tarea | Output L2 | Raw requeridas |
|---|---|---|
| T2.10 | `generacion_maquina_mensual` | `raw_agen`, `raw_game`, `raw_anexo_gen111...119`, `raw_anexo_gen12`, `raw_anexo_gen13` |
| T2.11 | `disponibilidad_maquina_mensual` | `raw_anexo_gen_disp_mejora`, `raw_anexo_generacion_forzada`, `raw_anexo_gen_294*` |
| T2.12 | `imp_exp_mensual` | `raw_aexp` |
| T2.13 | `auto_mensual` | `raw_auto` |
| T2.14 | `mater_cvt_mensual`, `mater_renovable_mensual` | `raw_anexo_mat*` |
| T2.15 | `cargos_comerc_mensual` | `raw_adco`, `raw_agfq` |

## Brief base para cada parser T2.x

Cada parser debe entregar:

1. Migration que crea tabla L2 tipada.
2. Funcion `public.refresh_<tabla_l2>(_anio int, _mes int)`.
3. Indices por `(anio, mes)` y por `(anio, mes, agente_nemo)` si aplica.
4. Uso obligatorio de `public.parse_es_number`, `public.parse_es_date`, `public.nemo_from`.
5. Test SQL con tres periodos representativos: uno 2021, uno 2024, uno 2026.
6. Query de reconciliacion contra L1: cantidad de filas fuente usadas, filas descartadas por header/total, y filas insertadas en L2.

Regla: una fila L2 no puede depender de `raw_text` parseado ad hoc si el diccionario ya define `col_NNN`.
