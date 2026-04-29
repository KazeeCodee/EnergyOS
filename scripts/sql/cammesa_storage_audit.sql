-- Auditoria de storage CAMMESA / EnergyOS
-- Correr en Supabase SQL Editor apenas la DB vuelva a aceptar queries.
-- Objetivo: identificar tablas grandes, indices pesados, L2 parciales y tablas
-- candidatas a archivar antes de subir de plan o seguir cargando.

-- 1) Ranking de tablas por tamano total (datos + indices + toast)
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  pg_size_pretty(pg_relation_size(relid)) as table_size,
  pg_size_pretty(pg_indexes_size(relid)) as index_size,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_total_relation_size(relid) as total_bytes
from pg_catalog.pg_statio_user_tables s
join pg_catalog.pg_stat_user_tables t
  on t.relid = s.relid
where schemaname = 'public'
order by pg_total_relation_size(relid) desc;

-- 2) Totales por familia
select
  case
    when relname like 'raw_%' then 'L1 raw'
    when relname in (
      'mater_contrato_mensual',
      'guma_detalle_mensual',
      'transporte_concepto_mensual',
      'cuenta_corriente_agente',
      'cammesa_parametros_mensuales',
      'excedente_mensual',
      'dte_resumen_agente',
      'reliquidacion_mensual',
      'gume_detalle_mensual',
      'gudi_detalle_mensual',
      'generacion_maquina_mensual',
      'disponibilidad_maquina_mensual',
      'imp_exp_mensual',
      'auto_mensual',
      'mater_cvt_mensual',
      'mater_renovable_mensual',
      'cargos_comerc_mensual'
    ) then 'L2 semantic'
    when relname like 'cammesa_%' then 'CAMMESA csv/api'
    when relname in ('datos_mensuales', 'datos_mercado') then 'legacy marts'
    else 'app/admin/other'
  end as family,
  count(*) as tables,
  pg_size_pretty(sum(pg_total_relation_size(relid))) as total_size,
  sum(pg_total_relation_size(relid)) as total_bytes
from pg_catalog.pg_statio_user_tables
where schemaname = 'public'
group by 1
order by sum(pg_total_relation_size(relid)) desc;

-- 3) Indices mas caros. Si alguno parece redundante, revisar antes de borrar.
select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_relation_size(indexrelid) as index_bytes
from pg_catalog.pg_stat_user_indexes
where schemaname = 'public'
order by pg_relation_size(indexrelid) desc;

-- 4) Estado de L2 clave
select 'mater_contrato_mensual' as table_name, count(*) rows, count(distinct (anio, mes)) periods from public.mater_contrato_mensual
union all select 'guma_detalle_mensual', count(*), count(distinct (anio, mes)) from public.guma_detalle_mensual
union all select 'transporte_concepto_mensual', count(*), count(distinct (anio, mes)) from public.transporte_concepto_mensual
union all select 'cuenta_corriente_agente', count(*), count(distinct (anio, mes)) from public.cuenta_corriente_agente
union all select 'cammesa_parametros_mensuales', count(*), count(distinct (anio, mes)) from public.cammesa_parametros_mensuales
union all select 'excedente_mensual', count(*), count(distinct (anio, mes)) from public.excedente_mensual
union all select 'dte_resumen_agente', count(*), count(distinct (anio, mes)) from public.dte_resumen_agente
order by table_name;

-- 5) Tamano exacto de tablas candidatas a limpiar/archivar.
select
  table_name,
  pg_size_pretty(pg_total_relation_size(format('public.%I', table_name))) as total_size,
  pg_total_relation_size(format('public.%I', table_name)) as total_bytes
from (values
  ('dte_resumen_agente'),
  ('raw_dte'),
  ('raw_dexc'),
  ('raw_agum'),
  ('raw_agen'),
  ('raw_game'),
  ('raw_anexo_gume'),
  ('raw_amat'),
  ('raw_rscj'),
  ('raw_adco'),
  ('raw_gudi'),
  ('raw_adis'),
  ('excedente_mensual')
) as v(table_name)
where to_regclass(format('public.%I', table_name)) is not null
order by total_bytes desc;

-- 6) Tablas posiblemente creadas pero vacias.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_stat_user_tables
where schemaname = 'public'
  and n_live_tup = 0
order by pg_total_relation_size(relid) desc;

-- 7) Bloat aproximado. Si hay mucho espacio muerto, VACUUM FULL puede recuperar,
-- pero bloquea tabla y necesita espacio temporal.
select
  schemaname,
  relname as table_name,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) as dead_pct,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_stat_user_tables
where schemaname = 'public'
order by n_dead_tup desc nulls last;

