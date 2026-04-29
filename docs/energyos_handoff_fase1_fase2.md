# EnergyOS CAMMESA - Handoff operativo Fase 1 y Fase 2

Fecha de corte: 2026-04-29
Repo local: `E:\Proyectos\GitHub\EnergyOS`
Rama observada: `codex/audit-calculation-engine`

Este documento es para continuar el trabajo inmediatamente. Se concentra solo en Fase 1 y Fase 2.

## 1. Estado ejecutivo

- **Fase 1 esta terminada y auditada.**
- **Fase 2 esta empezada, pero no terminada.**
- El batch inicial de Fase 2 (`T2.1`, `T2.2`, `T2.3`, `T2.6`) ya tiene tablas, funciones y migraciones aplicadas en Supabase.
- Falta cerrar la repoblacion y validacion final de `mater_contrato_mensual` y `guma_detalle_mensual` despues de fixes de calidad.

No empezar trabajo dependiente de L2 hasta cerrar esos checks.

## 2. Fase 1 - Ingesta historica raw

Estado: **cerrada**.

Objetivo de Fase 1:

- Crear las tablas `raw_*` faltantes.
- Cargar historico local CAMMESA 2021-01 a 2026-03.
- Garantizar idempotencia.
- Validar conteos local/parser/remoto.
- Validar duplicados por `(source_zip, source_file, source_row)`.

## 3. Archivos importantes de Fase 1

Scripts:

- `pipeline/ingest_sql_historico.py`
- `pipeline/load_grupo_d.py`
- `pipeline/load_grupo_e.py`
- `pipeline/load_grupo_f.py`
- `pipeline/load_grupo_g.py`
- `pipeline/audit_fase1_raw.py`
- `tests/test_audit_fase1_raw.py`

Docs:

- `docs/cammesa_phase1_audit.md`
- `docs/cammesa_phase1_closeout_runbook.md`
- `docs/cammesa_dictionary.md`
- `docs/cammesa_supabase_gap.md`
- `docs/cammesa_target_model.md`
- `docs/preflight_t11_check.sql`

Migraciones principales:

- `supabase/migrations/20260429100000_raw_dte_base_tables.sql`
- `supabase/migrations/20260429100100_raw_anexo_gen_tables.sql`
- `supabase/migrations/20260429100200_raw_anexo_mat_tables.sql`
- `supabase/migrations/20260429100300_raw_anexo_guma_gume_tables.sql`
- `supabase/migrations/20260429100400_ingest_runs.sql`
- `supabase/migrations/20260429100500_ingest_health_view.sql`
- `supabase/migrations/20260429100600_raw_amat_agum_source_unique.sql`

## 4. Resultado final de Fase 1

La auditoria global quedo en:

```text
docs/cammesa_phase1_audit.md
```

Resultado:

- 42/42 tablas raw auditadas.
- `local_count == parser_count == remote_total`.
- `duplicate_sources = 0`.
- `ingest_health = ok`.
- No hay runs abiertos.

Tablas masivas cerradas:

- `raw_dexc`: 1.327.948 filas, 0 duplicados.
- `raw_dte`: 1.148.753 filas, 0 duplicados.

Unico warning aceptado:

- `raw_adco = warn_prior_errors`.
- Motivo: errores historicos de runs anteriores durante el fix del parser.
- No bloquea porque el conteo final remoto/local/parser cuadra exacto.

Conclusion: **no recargar Fase 1 ni tocar raw salvo evidencia nueva.**

## 5. Fase 2 - Capa semantica L2

Estado: **en curso**.

Objetivo:

Convertir las tablas `raw_*` posicionales en tablas L2 tipadas, auditables y reutilizables por marts/UI.

Convencion:

- Cada tabla L2 tiene una funcion SQL:

```sql
public.refresh_<tabla_l2>(_anio int, _mes int)
```

- Cada fila L2 guarda:
  - `source_table`
  - `source_id`
  - `parser_version`
  - `procesado_en`

## 6. T2.0 Helpers

Estado: **cerrado y aplicado**.

Funciones:

- `public.parse_es_number(text)`
- `public.parse_es_date(text)`
- `public.nemo_from(text)`

Migraciones:

- `supabase/migrations/20260429024649_t2_sql_helpers.sql`
- `supabase/migrations/20260429025751_fix_t2_sql_helpers_formats.sql`

Query de validacion conocida:

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

```text
1234.56, 1234.56, 1234.56, 2025-12-13, 2024-02-08, ABCDEFGH
```

## 7. Batch inicial de Fase 2

Estado: **aplicado, pero no cerrado**.

Tablas creadas:

- `public.mater_contrato_mensual` - T2.1
- `public.guma_detalle_mensual` - T2.2
- `public.transporte_concepto_mensual` - T2.3
- `public.cuenta_corriente_agente` - T2.6

Funciones creadas:

- `public.refresh_mater_contrato_mensual(_anio int, _mes int)`
- `public.refresh_guma_detalle_mensual(_anio int, _mes int)`
- `public.refresh_transporte_concepto_mensual(_anio int, _mes int)`
- `public.refresh_cuenta_corriente_agente(_anio int, _mes int)`

Migracion base:

- `supabase/migrations/20260429102000_l2_phase2_batch1_parsers.sql`

Fixes aplicados:

- `supabase/migrations/20260429102100_l2_phase2_batch1_fix_rscj_nullable_distribuidor.sql`
- `supabase/migrations/20260429102200_l2_phase2_fix_mater_html_partial_threshold.sql`
- `supabase/migrations/20260429102300_l2_phase2_fix_mater_ignore_tiny_html.sql`
- `supabase/migrations/20260429102400_l2_phase2_fix_batch1_parser_quality.sql`

Estas migraciones ya fueron empujadas al Supabase remoto.

## 8. Estado exacto al cortar

El corte ocurrio mientras se reprocesaba MATER despues de aplicar fixes de calidad.

Ultimo conteo observado:

```text
mater_contrato_mensual       38.989 filas, 62 periodos
guma_detalle_mensual         23.743 filas, 63 periodos
transporte_concepto_mensual   9.240 filas, 63 periodos
cuenta_corriente_agente      86.754 filas, 57 periodos
```

Estos conteos prueban que el batch esta poblado, pero **no prueban cierre final**.

## 9. Problemas encontrados y decisiones

### 9.1 MATER - HTML parcial

Problema:

- `raw_anexo_mat` existe en meses antiguos pero a veces trae muy pocas filas.
- Usar HTML siempre podia dejar meses con 10 filas cuando `raw_amat` tenia ~700.

Decision:

- Usar `raw_anexo_mat` solo si:
  - tiene al menos 100 filas validas, y
  - si existe `raw_amat`, HTML cubre al menos 90% de TXT.
- Si no, usar `raw_amat`.

### 9.2 MATER - sublayouts mezclados en `raw_amat`

Problema:

- `raw_amat` tiene sublayouts con `col_count` parecido.
- Algunas filas no son contratos normales y `col_003` no es NEMO.

Fix:

- Exigir:

```sql
trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
```

Pendiente:

- Reprocesar MATER completo y verificar que no queden `bad_nemo`.

### 9.3 GUMA - layout nuevo con/sin distribuidor

Problema:

- En `raw_anexo_guma`, algunos registros nuevos tienen `col_count=30`.
- En esos registros `col_002` no es distribuidor; ya es `demanda_real_total`.
- El parser inicial desplazaba mal las columnas.

Fix:

- `guma_detalle_mensual.distribuidor_nemo` permite `NULL`.
- La funcion debe detectar si `col_002` es NEMO o numero.
- Si `col_002` es numero, desplaza las metricas una columna.

Pendiente:

- Reprocesar GUMA completo y validar suma de bandas.

### 9.4 RSCJ - distribuidor faltante

Problema:

- Algunas filas de `raw_rscj.col_001` traen solo agente y no distribuidor.

Fix:

- `cuenta_corriente_agente.distribuidor_nemo` permite `NULL`.

Estado:

- Cuenta corriente ya esta poblada para 57 periodos.

### 9.5 Transporte

Estado:

- `transporte_concepto_mensual` poblada para 63 periodos.
- Conteo observado: 9.240 filas.
- No se detectaron duplicados por `(source_table, source_id, concepto_transporte)` en la verificacion previa.

## 10. Instrucciones para retomar

### Paso 1 - Verificar que no haya procesos colgados

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like '*refresh_mater_contrato_mensual*' -or
    $_.CommandLine -like '*refresh_guma_detalle_mensual*' -or
    $_.CommandLine -like '*supabase db query*'
  } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
```

Si hay un refresh activo, esperar. No matar procesos salvo que este claramente colgado.

### Paso 2 - Reprocesar MATER completo

```powershell
$env:PYTHONIOENCODING='utf-8'
npx supabase db query --linked --output csv "
with periods as (
  select distinct anio, mes from public.raw_amat
  union
  select distinct anio, mes from public.raw_anexo_mat
)
select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version
from periods p
cross join lateral public.refresh_mater_contrato_mensual(p.anio, p.mes) r
order by p.anio, p.mes;
" 2>&1
```

Validar MATER:

```powershell
npx supabase db query --linked --output csv "
select
  count(*) as rows,
  count(distinct (anio,mes)) as periodos,
  count(*) - count(distinct (source_table, source_id)) as dupes_source
from public.mater_contrato_mensual;

select source_table, count(*) rows, count(distinct (anio,mes)) periodos
from public.mater_contrato_mensual
group by source_table
order by source_table;

select count(*) as bad_nemo
from public.mater_contrato_mensual
where generador_nemo !~ '^[A-Z0-9-]{8}$'
   or demandante_nemo !~ '^[A-Z0-9-]{8}$';
"
```

Esperado:

- `dupes_source = 0`
- `bad_nemo = 0`
- `periodos = 62` es aceptable porque `raw_amat` no tiene 2023-01.

### Paso 3 - Reprocesar GUMA completo

```powershell
$env:PYTHONIOENCODING='utf-8'
npx supabase db query --linked --output csv "
with periods as (
  select distinct anio, mes from public.raw_anexo_guma
)
select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version
from periods p
cross join lateral public.refresh_guma_detalle_mensual(p.anio, p.mes) r
order by p.anio, p.mes;
" 2>&1
```

Validar GUMA:

```powershell
npx supabase db query --linked --output csv "
select
  count(*) as rows,
  count(distinct (anio,mes)) as periodos,
  count(*) - count(distinct (source_table, source_id)) as dupes_source
from public.guma_detalle_mensual;

select source_layout, count(*) rows, count(distinct (anio,mes)) periodos
from public.guma_detalle_mensual
group by source_layout
order by source_layout;

select count(*) as bad_new_total_sum
from public.guma_detalle_mensual
where source_layout='html_new'
  and demanda_real_pico_mwh is not null
  and demanda_real_valle_mwh is not null
  and demanda_real_resto_mwh is not null
  and abs((demanda_real_pico_mwh + demanda_real_valle_mwh + demanda_real_resto_mwh) - demanda_real_total_mwh) > 1;
"
```

Esperado:

- `dupes_source = 0`
- `periodos = 63`
- `bad_new_total_sum = 0` o revisar muestra si queda algun caso.

### Paso 4 - Verificar Transporte y Cuenta Corriente

```powershell
npx supabase db query --linked --output csv "
select
  'transporte' as tabla,
  count(*) rows,
  count(distinct (anio,mes)) periodos,
  count(*) - count(distinct (source_table, source_id, concepto_transporte)) dupes
from public.transporte_concepto_mensual
union all
select
  'cuenta_corriente',
  count(*),
  count(distinct (anio,mes)),
  count(*) - count(distinct (source_table, source_id, mes_in_semestre))
from public.cuenta_corriente_agente;
"
```

Esperado:

- Transporte: 63 periodos, 0 duplicados.
- Cuenta corriente: 57 periodos, 0 duplicados.

### Paso 5 - Documentar cierre de batch

Crear:

```text
docs/cammesa_phase2_batch1_status.md
```

Debe incluir:

- tablas L2 cerradas
- funciones refresh
- conteos finales
- queries usadas para validar
- warnings aceptados
- pendientes inmediatos

## 11. Que no hacer todavia

- No empezar marts ni UI.
- No asumir que toda Fase 2 esta lista.
- No tocar `raw_*` ni recargar Fase 1.
- No implementar `dte_resumen_agente` o `excedente_mensual` en el mismo cambio que el cierre de batch 1.

## 12. Proximo paso despues de cerrar batch 1

Una vez cerrado `T2.1/T2.2/T2.3/T2.6`, avanzar con parsers masivos:

- `T2.4 excedente_mensual` desde `raw_dexc`
- `T2.5 dte_resumen_agente` desde `raw_dte`

Hacerlos en migraciones separadas, con profiling previo de secciones y validaciones propias.

