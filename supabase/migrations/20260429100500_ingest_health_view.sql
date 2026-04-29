-- T1.3 — Vistas ingest_health e ingest_runs_summary
-- Non-destructive: CREATE OR REPLACE VIEW
-- security_invoker = true: la vista corre con los permisos del que consulta.

-- ─── 1. ingest_health: cobertura real leyendo las raw_* directamente ─────────
-- Fuente de verdad = las tablas cargadas, no ingest_runs.
-- ingest_runs complementa con tiempos y errores.

create or replace view public.ingest_health
  with (security_invoker = true)
as
with

-- Periodos existentes por tabla, contados desde las raw_* reales
cobertura_real(tabla, anio, mes, filas) as (
  select 'raw_amat'                   , anio, mes, count(*) from public.raw_amat                    group by anio, mes
  union all
  select 'raw_agum'                   , anio, mes, count(*) from public.raw_agum                    group by anio, mes
  union all
  select 'raw_dte'                    , anio, mes, count(*) from public.raw_dte                     group by anio, mes
  union all
  select 'raw_dexc'                   , anio, mes, count(*) from public.raw_dexc                    group by anio, mes
  union all
  select 'raw_aexp'                   , anio, mes, count(*) from public.raw_aexp                    group by anio, mes
  union all
  select 'raw_agen'                   , anio, mes, count(*) from public.raw_agen                    group by anio, mes
  union all
  select 'raw_agfq'                   , anio, mes, count(*) from public.raw_agfq                    group by anio, mes
  union all
  select 'raw_aama'                   , anio, mes, count(*) from public.raw_aama                    group by anio, mes
  union all
  select 'raw_rscj'                   , anio, mes, count(*) from public.raw_rscj                    group by anio, mes
  union all
  select 'raw_gudi'                   , anio, mes, count(*) from public.raw_gudi                    group by anio, mes
  union all
  select 'raw_adis'                   , anio, mes, count(*) from public.raw_adis                    group by anio, mes
  union all
  select 'raw_adco'                   , anio, mes, count(*) from public.raw_adco                    group by anio, mes
  union all
  select 'raw_auto'                   , anio, mes, count(*) from public.raw_auto                    group by anio, mes
  union all
  select 'raw_game'                   , anio, mes, count(*) from public.raw_game                    group by anio, mes
  union all
  select 'raw_atra'                   , anio, mes, count(*) from public.raw_atra                    group by anio, mes
  union all
  select 'raw_anexo_gen111'           , anio, mes, count(*) from public.raw_anexo_gen111            group by anio, mes
  union all
  select 'raw_anexo_gen112'           , anio, mes, count(*) from public.raw_anexo_gen112            group by anio, mes
  union all
  select 'raw_anexo_gen113'           , anio, mes, count(*) from public.raw_anexo_gen113            group by anio, mes
  union all
  select 'raw_anexo_gen114'           , anio, mes, count(*) from public.raw_anexo_gen114            group by anio, mes
  union all
  select 'raw_anexo_gen115'           , anio, mes, count(*) from public.raw_anexo_gen115            group by anio, mes
  union all
  select 'raw_anexo_gen116'           , anio, mes, count(*) from public.raw_anexo_gen116            group by anio, mes
  union all
  select 'raw_anexo_gen117'           , anio, mes, count(*) from public.raw_anexo_gen117            group by anio, mes
  union all
  select 'raw_anexo_gen118'           , anio, mes, count(*) from public.raw_anexo_gen118            group by anio, mes
  union all
  select 'raw_anexo_gen119'           , anio, mes, count(*) from public.raw_anexo_gen119            group by anio, mes
  union all
  select 'raw_anexo_gen12'            , anio, mes, count(*) from public.raw_anexo_gen12             group by anio, mes
  union all
  select 'raw_anexo_gen13'            , anio, mes, count(*) from public.raw_anexo_gen13             group by anio, mes
  union all
  select 'raw_anexo_gen_disp_mejora'  , anio, mes, count(*) from public.raw_anexo_gen_disp_mejora   group by anio, mes
  union all
  select 'raw_anexo_generacion_forzada',anio, mes, count(*) from public.raw_anexo_generacion_forzada group by anio, mes
  union all
  select 'raw_anexo_gen_294pot'       , anio, mes, count(*) from public.raw_anexo_gen_294pot        group by anio, mes
  union all
  select 'raw_anexo_gen_294ene'       , anio, mes, count(*) from public.raw_anexo_gen_294ene        group by anio, mes
  union all
  select 'raw_anexo_genmovil'         , anio, mes, count(*) from public.raw_anexo_genmovil          group by anio, mes
  union all
  select 'raw_anexo_gennuc'           , anio, mes, count(*) from public.raw_anexo_gennuc            group by anio, mes
  union all
  select 'raw_anexo_mat'              , anio, mes, count(*) from public.raw_anexo_mat               group by anio, mes
  union all
  select 'raw_anexo_mat_plus'         , anio, mes, count(*) from public.raw_anexo_mat_plus          group by anio, mes
  union all
  select 'raw_anexo_mat_renovable'    , anio, mes, count(*) from public.raw_anexo_mat_renovable     group by anio, mes
  union all
  select 'raw_anexo_mat_cvt'          , anio, mes, count(*) from public.raw_anexo_mat_cvt           group by anio, mes
  union all
  select 'raw_anexo_mat_cvt_plus'     , anio, mes, count(*) from public.raw_anexo_mat_cvt_plus      group by anio, mes
  union all
  select 'raw_anexo_mat_compromiso'   , anio, mes, count(*) from public.raw_anexo_mat_compromiso    group by anio, mes
  union all
  select 'raw_anexo_mat_cont_delivery', anio, mes, count(*) from public.raw_anexo_mat_cont_delivery group by anio, mes
  union all
  select 'raw_anexo_mat_cequip724'    , anio, mes, count(*) from public.raw_anexo_mat_cequip724     group by anio, mes
  union all
  select 'raw_anexo_guma'             , anio, mes, count(*) from public.raw_anexo_guma              group by anio, mes
  union all
  select 'raw_anexo_gume'             , anio, mes, count(*) from public.raw_anexo_gume              group by anio, mes
),

-- Reglas de cobertura esperada por tabla (del T0.2)
cobertura_esperada(tabla, meses_esperados) as (
  values
    ('raw_amat',                    62),
    ('raw_agum',                    63),
    ('raw_aama',                    16),  -- solo meses con créditos/débitos
    ('raw_gudi',                    25),  -- desde 2024-03
    ('raw_rscj',                    57),  -- faltan 2025-02..07
    ('raw_anexo_gen_294ene',        16),  -- desde 2024-12
    ('raw_anexo_gen_294pot',        16),
    ('raw_anexo_gen_disp_mejora',   36),  -- desde 2023-04
    ('raw_anexo_gennuc',            38),  -- desde 2023-02
    -- resto: 63/63
    ('raw_dte',                     63), ('raw_dexc',                   63),
    ('raw_aexp',                    63), ('raw_agen',                   63),
    ('raw_agfq',                    63), ('raw_adis',                   63),
    ('raw_adco',                    63), ('raw_auto',                   63),
    ('raw_game',                    63), ('raw_atra',                   63),
    ('raw_anexo_gen111',            63), ('raw_anexo_gen112',           63),
    ('raw_anexo_gen113',            63), ('raw_anexo_gen114',           63),
    ('raw_anexo_gen115',            63), ('raw_anexo_gen116',           63),
    ('raw_anexo_gen117',            63), ('raw_anexo_gen118',           63),
    ('raw_anexo_gen119',            63), ('raw_anexo_gen12',            63),
    ('raw_anexo_gen13',             63), ('raw_anexo_generacion_forzada',63),
    ('raw_anexo_genmovil',          63), ('raw_anexo_mat',              63),
    ('raw_anexo_mat_plus',          63), ('raw_anexo_mat_renovable',    63),
    ('raw_anexo_mat_cvt',           63), ('raw_anexo_mat_cvt_plus',     63),
    ('raw_anexo_mat_compromiso',    63), ('raw_anexo_mat_cont_delivery',63),
    ('raw_anexo_mat_cequip724',     63), ('raw_anexo_guma',             63),
    ('raw_anexo_gume',              63)
),

-- Último run por tabla (para saber cuándo se cargó)
last_run as (
  select tabla, max(terminado_en) as ultima_corrida, max(estado) as ultimo_estado
  from public.ingest_runs
  group by tabla
)

select
  ce.tabla,
  count(distinct (cr.anio, cr.mes))                         as meses_cargados,
  ce.meses_esperados,
  coalesce(sum(cr.filas), 0)                                as total_filas,
  lr.ultima_corrida,
  lr.ultimo_estado,
  case
    when count(distinct (cr.anio, cr.mes)) = 0              then 'sin_datos'
    when count(distinct (cr.anio, cr.mes)) >= ce.meses_esperados then 'ok'
    else 'incompleto'
  end                                                        as estado_cobertura
from cobertura_esperada ce
left join cobertura_real cr on cr.tabla = ce.tabla
left join last_run lr       on lr.tabla = ce.tabla
group by ce.tabla, ce.meses_esperados, lr.ultima_corrida, lr.ultimo_estado
order by
  case when count(distinct (cr.anio, cr.mes)) = 0 then 1
       when count(distinct (cr.anio, cr.mes)) < ce.meses_esperados then 2
       else 3 end,
  ce.tabla;

-- ─── 2. ingest_runs_summary: resumen de corridas por tabla/periodo ────────────

create or replace view public.ingest_runs_summary
  with (security_invoker = true)
as
select
  tabla,
  anio,
  mes,
  sum(filas_insertadas)  as filas_insertadas,
  sum(filas_omitidas)    as filas_omitidas,
  sum(filas_error)       as filas_error,
  max(estado)            as estado,
  max(terminado_en)      as ultima_corrida,
  round(sum(duracion_seg)::numeric, 1) as duracion_seg_total
from public.ingest_runs
group by tabla, anio, mes
order by tabla, anio, mes;

-- ─── 3. Query: meses faltantes por tabla (ejecutar ad-hoc) ───────────────────
/*
select
  g.anio, g.mes,
  coalesce(h.total_filas, 0) as filas
from (
  select
    extract(year  from d)::int as anio,
    extract(month from d)::int as mes
  from generate_series('2021-01-01'::date,'2026-03-01'::date,interval '1 month') d
) g
left join (
  select anio, mes, count(*) as total_filas
  from public.raw_dte   -- cambiar por la tabla a auditar
  group by anio, mes
) h using (anio, mes)
where h.total_filas is null
order by g.anio, g.mes;
*/
