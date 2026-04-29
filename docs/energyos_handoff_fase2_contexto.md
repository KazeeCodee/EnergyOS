# EnergyOS CAMMESA - Handoff tecnico Fase 1/Fase 2

Fecha de corte: 2026-04-29
Repo local: `E:\Proyectos\GitHub\EnergyOS`
Rama actual observada: `codex/audit-calculation-engine`

Este documento resume el estado real del trabajo CAMMESA para que otro programador pueda continuar sin depender del chat anterior.

## 1. Objetivo general

EnergyOS esta incorporando cruces de datos CAMMESA en tres capas:

- **L1 Raw:** tablas `raw_*` espejo de los SQL/TXT/HTML de CAMMESA, con columnas posicionales `col_001...col_NNN`.
- **L2 Semantica:** tablas tipadas y parseadas, por ejemplo `mater_contrato_mensual`, `guma_detalle_mensual`, `transporte_concepto_mensual`, `dte_resumen_agente`.
- **L3 Marts:** agregados consumibles por producto/UI, por ejemplo `factura_sombra_mensual`, `peer_benchmark_mensual`, `mater_pricing_index_mensual`.

La regla de union canonica definida en Fase 0 es:

```sql
periodo = (anio, mes)
agente_nemo = left(col_001, 8) / public.nemo_from(col_001)
```

## 2. Roadmap por fases

### Fase 0 - Fundaciones

Estado: **terminada**.

Entregables creados:

- `docs/cammesa_dictionary.md`
- `docs/cammesa_supabase_gap.md`
- `docs/cammesa_target_model.md`
- tambien existe carpeta `docs/cammesa/` con versiones T0.*.

Contenido importante:

- Diccionario de `raw_*` con mapeo `col_NNN -> campo negocio`.
- Gap Supabase/local.
- Modelo target L1/L2/L3.
- Decision clave: L2 se refresca con funciones SQL versionadas `refresh_<tabla>(_anio, _mes)`.

### Fase 1 - Ingesta historica completa

Estado: **terminada y auditada**.

Se crearon/aplicaron migraciones para las tablas raw faltantes y se cargo historico 2021-01 a 2026-03.

Archivos importantes:

- `pipeline/ingest_sql_historico.py`
- `pipeline/load_grupo_d.py`
- `pipeline/load_grupo_e.py`
- `pipeline/load_grupo_f.py`
- `pipeline/load_grupo_g.py`
- `pipeline/audit_fase1_raw.py`
- `docs/cammesa_phase1_audit.md`
- `docs/cammesa_phase1_closeout_runbook.md`

Migraciones principales:

- `supabase/migrations/20260429100000_raw_dte_base_tables.sql`
- `supabase/migrations/20260429100100_raw_anexo_gen_tables.sql`
- `supabase/migrations/20260429100200_raw_anexo_mat_tables.sql`
- `supabase/migrations/20260429100300_raw_anexo_guma_gume_tables.sql`
- `supabase/migrations/20260429100400_ingest_runs.sql`
- `supabase/migrations/20260429100500_ingest_health_view.sql`
- `supabase/migrations/20260429100600_raw_amat_agum_source_unique.sql`

Auditoria final:

- Archivo: `docs/cammesa_phase1_audit.md`
- Resultado: 42/42 tablas raw auditadas.
- Todas las tablas quedaron con `local == parser == remoto`, `dupes = 0`, `health = ok`.
- Unico warning aceptado: `raw_adco` con `warn_prior_errors`, por errores historicos del parser anterior. Los datos finales cuadran exacto.

Tablas masivas cerradas:

- `raw_dexc`: 1.327.948 filas, 0 duplicados.
- `raw_dte`: 1.148.753 filas, 0 duplicados.

Conclusion: **no hay que reabrir Fase 1 salvo que se quiera limpiar logs o mejorar auditoria.**

### Fase 2 - Parsers L2

Estado: **en curso**.

T2.0 helpers esta aplicado:

- `public.parse_es_number(text)`
- `public.parse_es_date(text)`
- `public.nemo_from(text)`

Migraciones:

- `supabase/migrations/20260429024649_t2_sql_helpers.sql`
- `supabase/migrations/20260429025751_fix_t2_sql_helpers_formats.sql`

Validacion conocida de helpers:

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

#### Batch 1 de Fase 2

Estado: **implementado parcialmente, aplicado, pero NO cerrado**.

Se implementaron estas tablas L2:

- `public.mater_contrato_mensual` - T2.1
- `public.guma_detalle_mensual` - T2.2
- `public.transporte_concepto_mensual` - T2.3
- `public.cuenta_corriente_agente` - T2.6

Con funciones:

- `public.refresh_mater_contrato_mensual(_anio int, _mes int)`
- `public.refresh_guma_detalle_mensual(_anio int, _mes int)`
- `public.refresh_transporte_concepto_mensual(_anio int, _mes int)`
- `public.refresh_cuenta_corriente_agente(_anio int, _mes int)`

Migracion base:

- `supabase/migrations/20260429102000_l2_phase2_batch1_parsers.sql`

Fixes incrementales aplicados:

- `supabase/migrations/20260429102100_l2_phase2_batch1_fix_rscj_nullable_distribuidor.sql`
- `supabase/migrations/20260429102200_l2_phase2_fix_mater_html_partial_threshold.sql`
- `supabase/migrations/20260429102300_l2_phase2_fix_mater_ignore_tiny_html.sql`
- `supabase/migrations/20260429102400_l2_phase2_fix_batch1_parser_quality.sql`

Importante: estas migraciones ya se empujaron a Supabase remoto con `npx supabase db push --linked --yes`.

## 3. Estado exacto al cortar

El usuario interrumpio mientras se estaba re-procesando MATER despues de aplicar fixes de calidad.

No asumir que Batch 1 esta cerrado.

Ultimo conteo observado despues del corte:

```text
mater_contrato_mensual      38.989 filas, 62 periodos
guma_detalle_mensual        23.743 filas, 63 periodos
transporte_concepto_mensual  9.240 filas, 63 periodos
cuenta_corriente_agente     86.754 filas, 57 periodos
```

Estos conteos prueban que las tablas existen y tienen datos, pero no prueban cierre final.

## 4. Bugs/decisiones detectadas durante Fase 2

### 4.1 MATER: `raw_anexo_mat` parcial

Problema:

- `raw_anexo_mat` existe en meses antiguos, pero a veces trae cobertura parcial.
- Primer criterio usaba HTML si habia >= 10 filas; eso fue demasiado permisivo.
- Meses como 2025-08/09/10 quedaban con 10 filas desde HTML, cuando `raw_amat` tenia ~700 filas.

Decision:

- Usar `raw_anexo_mat` solo si trae cobertura suficiente:
  - minimo 100 filas HTML, y
  - si existe TXT, HTML debe cubrir >= 90% de filas TXT.
- Si no, caer a `raw_amat`.

### 4.2 MATER: filas de otros sublayouts de `raw_amat`

Problema:

- `raw_amat` tiene varios sublayouts.
- Algunos registros con `col_count in (11,12)` no son contratos MAT normales; `col_003` puede ser numerico en vez de NEMO.
- Esto genero filas absurdas, por ejemplo `demandante_nemo = '9 542,84'`.

Fix aplicado:

- Exigir que `col_001` y `col_003` matcheen NEMO real:

```sql
trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
```

Pero: despues de aplicar el fix hay que repoblar MATER completo y revalidar.

### 4.3 GUMA: layout nuevo con y sin distribuidor

Problema:

- `raw_anexo_guma` layout nuevo suele ser `col_count=31` con `col_002 = distribuidor`.
- Pero algunos meses/filas vienen con `col_count=30` y sin distribuidor: `col_002` ya es `demanda_real_total`.
- El parser inicial asumio siempre distribuidor en `col_002`, corriendo una columna y generando datos malos.

Ejemplo detectado:

```text
source_id=97, 2026-02, CEMAOL3Z:
col_001=CEMAOL3Z
col_002=3912,179
col_003=738,572
...
```

Fix aplicado:

- `guma_detalle_mensual.distribuidor_nemo` ahora permite `NULL`.
- La funcion `refresh_guma_detalle_mensual` debe detectar si `col_002` es NEMO o numero.
- Si `col_002` es numero, debe desplazar todas las metricas una columna a la izquierda.

Pero: despues de aplicar el fix hay que repoblar GUMA completo y revalidar.

### 4.4 Cuenta corriente RSCJ: distribuidor faltante

Problema:

- Algunas filas historicas de `raw_rscj.col_001` traen solo un NEMO, sin distribuidor.
- La tabla `cuenta_corriente_agente` exigia `distribuidor_nemo not null`.

Fix aplicado:

- `distribuidor_nemo` permite `NULL` en `cuenta_corriente_agente`.

### 4.5 Transporte

Estado:

- `transporte_concepto_mensual` poblo 63 periodos.
- Conteo observado: 9.240 filas.
- Sin duplicados por `(source_table, source_id, concepto_transporte)` en la verificacion previa.

## 5. Instrucciones precisas para continuar

Trabajar con cuidado. No arrancar Fase 3 todavia.

### Paso 1 - Verificar que no hay procesos colgados

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like '*refresh_mater_contrato_mensual*' -or
    $_.CommandLine -like '*refresh_guma_detalle_mensual*' -or
    $_.CommandLine -like '*supabase db query*'
  } |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine
```

Si hay un proceso del refresh anterior todavia vivo, esperar a que termine. No matar nada salvo que este claramente colgado.

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

Validar despues:

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
- `periodos = 62` es aceptable porque `raw_amat` falta 2023-01.

No usar como gate duro que `energia_total = valle + resto + pico`, porque `raw_amat` tiene sublayouts donde algunas columnas pueden representar abastecida/contratada. Si se usa, hacerlo como warning y revisar muestra, no bloquear automaticamente.

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

Validar:

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
- `bad_new_total_sum = 0` o revisar cualquier remanente.

### Paso 4 - Verificar Transporte y Cuenta Corriente

No hace falta repoblar si no se cambiaron sus funciones, pero conviene correr checks:

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
- Cuenta corriente: 57 periodos, 0 duplicados. 57 periodos es normal por cobertura parcial de `raw_rscj`.

### Paso 5 - Actualizar documento de cierre de Fase 2 batch 1

Crear o actualizar:

- `docs/cammesa_phase2_batch1_status.md`

Debe incluir:

- tablas L2 creadas
- funciones refresh
- conteos finales
- queries de validacion
- warnings aceptados
- pendientes para T2.4/T2.5

## 6. Que NO hacer todavia

- No empezar Fase 3.
- No crear `factura_sombra_mensual` todavia.
- No migrar UI.
- No asumir que `dte_resumen_agente` y `excedente_mensual` existen; todavia faltan.
- No tocar Fase 1 ni recargar raw si no hay evidencia de problema.

## 7. Proximas tareas de Fase 2 despues del batch 1

Cuando batch 1 quede cerrado:

1. **T2.4 `excedente_mensual` desde `raw_dexc`**
   - Requiere profiling de secciones A11.1/A11.2.
   - No mezclar con otros cambios.
   - Fuente masiva: 1.327.948 filas.

2. **T2.5 `dte_resumen_agente` desde `raw_dte`**
   - Requiere profiling de sub-secciones DTE.
   - Long format por concepto.
   - Fuente masiva: 1.148.753 filas.

3. Luego seguir con:
   - T2.7 reliquidaciones (`raw_aama`)
   - T2.8 GUME (`raw_anexo_gume`)
   - T2.9 GUDI (`raw_gudi`, `raw_adis`)
   - T2.10 generacion maquina
   - T2.14 MATER tecnologia/CVT
   - T2.15 cargos comerciales (`raw_adco`)

## 8. Archivos de briefs disponibles

Los briefs para despachar trabajo estan en:

- `docs/briefs/cammesa_t2_readme.md`
- `docs/briefs/cammesa_t2_1_mater_contrato_mensual.md`
- `docs/briefs/cammesa_t2_2_guma_detalle_mensual.md`
- `docs/briefs/cammesa_t2_3_transporte_concepto_mensual.md`
- `docs/briefs/cammesa_t2_4_excedente_mensual.md`
- `docs/briefs/cammesa_t2_5_dte_resumen_agente.md`
- `docs/briefs/cammesa_t2_6_cuenta_corriente_agente.md`

Tambien hay briefs para Fase 3/4/5, pero no usarlos hasta cerrar L2.

## 9. Estado resumido para el siguiente programador

Resumen corto:

- Fase 0: cerrada.
- Fase 1: cerrada, auditada, 42/42 raw OK.
- Fase 2: en curso.
- T2.0: cerrado.
- T2.1/T2.2/T2.3/T2.6: implementados y aplicados, pero T2.1/T2.2 requieren repoblacion final tras fixes de calidad.
- T2.4/T2.5: no empezados.
- Fase 3/4/5: pendientes.

Primera tarea concreta al retomar:

1. Confirmar que no hay proceso colgado.
2. Reprocesar `refresh_mater_contrato_mensual` para todos los periodos.
3. Reprocesar `refresh_guma_detalle_mensual` para todos los periodos.
4. Correr validaciones del punto 5.
5. Documentar `docs/cammesa_phase2_batch1_status.md`.

