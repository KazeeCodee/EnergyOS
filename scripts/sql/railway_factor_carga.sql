-- Módulo 3: Perfil de carga Pico/Valle/Resto + benchmark.
-- Nota: no calcula factor de carga clásico porque no hay potencia máxima mensual.

create or replace function public.refresh_factor_carga()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_factor_carga_mensual;
  refresh materialized view public.vw_factor_carga_benchmark;
end;
$$;

drop materialized view if exists public.vw_factor_carga_benchmark;
drop materialized view if exists public.vw_factor_carga_mensual;

create materialized view public.vw_factor_carga_mensual as
with base as (
  select
    c.tipo_agente,
    c.nemo,
    c.anio,
    c.mes,
    (extract(day from (date_trunc('month', make_date(c.anio, c.mes, 1)) + interval '1 month - 1 day'))::int * 24) as horas_mes,
    c.demanda_real_mwh,
    c.demanda_real_pico_mwh,
    c.demanda_real_valle_mwh,
    c.demanda_real_resto_mwh,
    (coalesce(c.demanda_real_pico_mwh, 0) + coalesce(c.demanda_real_valle_mwh, 0) + coalesce(c.demanda_real_resto_mwh, 0)) as demanda_pvr_mwh
  from public.vw_consumo_gu_mensual c
),
metrics as (
  select
    b.*,
    null::numeric as factor_carga_pct,
    'no_disponible_sin_potencia_maxima'::text as factor_carga_metodo,
    case when b.demanda_real_mwh > 0 and b.demanda_pvr_mwh > 0 then round(b.demanda_real_pico_mwh / b.demanda_real_mwh, 6) end as pct_pico,
    case when b.demanda_real_mwh > 0 and b.demanda_pvr_mwh > 0 then round(b.demanda_real_valle_mwh / b.demanda_real_mwh, 6) end as pct_valle,
    case when b.demanda_real_mwh > 0 and b.demanda_pvr_mwh > 0 then round(b.demanda_real_resto_mwh / b.demanda_real_mwh, 6) end as pct_resto,
    case when b.demanda_real_valle_mwh > 0 then round(b.demanda_real_pico_mwh / b.demanda_real_valle_mwh, 6) end as ratio_pico_valle,
    case when b.demanda_real_mwh > 0 and b.demanda_pvr_mwh > 0 then round(b.demanda_real_pico_mwh / b.demanda_real_mwh, 6) end as concentracion_pico_score,
    case
      when b.demanda_real_mwh is null or b.demanda_real_mwh <= 0 then 'sin_demanda'
      when b.demanda_pvr_mwh <= 0 then 'sin_apertura_pvr'
      when abs(b.demanda_pvr_mwh - b.demanda_real_mwh) / nullif(b.demanda_real_mwh, 0) > 0.05 then 'pvr_no_cierra'
      else 'ok'
    end as calidad_dato
  from base b
),
with_yoy as (
  select
    m.*,
    prev.demanda_real_mwh as demanda_real_yoy_base_mwh,
    case
      when prev.demanda_real_mwh > 0 then round((m.demanda_real_mwh - prev.demanda_real_mwh) / prev.demanda_real_mwh, 6)
    end as estacionalidad_yoy
  from metrics m
  left join metrics prev
    on prev.nemo = m.nemo
   and prev.tipo_agente = m.tipo_agente
   and prev.anio = m.anio - 1
   and prev.mes = m.mes
)
select
  *,
  case when pct_pico is not null then round(percent_rank() over (partition by tipo_agente, anio, mes order by pct_pico)::numeric, 6) end as pct_pico_percentil,
  case when ratio_pico_valle is not null then round(percent_rank() over (partition by tipo_agente, anio, mes order by ratio_pico_valle)::numeric, 6) end as ratio_pico_valle_percentil
from with_yoy
with data;

create unique index vw_factor_carga_mensual_uidx
  on public.vw_factor_carga_mensual (tipo_agente, nemo, anio, mes);

create index vw_factor_carga_mensual_nemo_period_idx
  on public.vw_factor_carga_mensual (nemo, anio, mes);

create materialized view public.vw_factor_carga_benchmark as
select
  tipo_agente,
  anio,
  mes,
  count(*) as agentes_total,
  count(*) filter (where pct_pico is not null) as agentes_con_pvr,
  percentile_cont(0.25) within group (order by pct_pico) filter (where pct_pico is not null) as pct_pico_p25,
  percentile_cont(0.50) within group (order by pct_pico) filter (where pct_pico is not null) as pct_pico_p50,
  percentile_cont(0.75) within group (order by pct_pico) filter (where pct_pico is not null) as pct_pico_p75,
  percentile_cont(0.25) within group (order by pct_valle) filter (where pct_valle is not null) as pct_valle_p25,
  percentile_cont(0.50) within group (order by pct_valle) filter (where pct_valle is not null) as pct_valle_p50,
  percentile_cont(0.75) within group (order by pct_valle) filter (where pct_valle is not null) as pct_valle_p75,
  percentile_cont(0.25) within group (order by pct_resto) filter (where pct_resto is not null) as pct_resto_p25,
  percentile_cont(0.50) within group (order by pct_resto) filter (where pct_resto is not null) as pct_resto_p50,
  percentile_cont(0.75) within group (order by pct_resto) filter (where pct_resto is not null) as pct_resto_p75,
  percentile_cont(0.25) within group (order by ratio_pico_valle) filter (where ratio_pico_valle is not null) as ratio_pico_valle_p25,
  percentile_cont(0.50) within group (order by ratio_pico_valle) filter (where ratio_pico_valle is not null) as ratio_pico_valle_p50,
  percentile_cont(0.75) within group (order by ratio_pico_valle) filter (where ratio_pico_valle is not null) as ratio_pico_valle_p75,
  percentile_cont(0.25) within group (order by concentracion_pico_score) filter (where concentracion_pico_score is not null) as concentracion_pico_p25,
  percentile_cont(0.50) within group (order by concentracion_pico_score) filter (where concentracion_pico_score is not null) as concentracion_pico_p50,
  percentile_cont(0.75) within group (order by concentracion_pico_score) filter (where concentracion_pico_score is not null) as concentracion_pico_p75
from public.vw_factor_carga_mensual
group by tipo_agente, anio, mes
with data;

create unique index vw_factor_carga_benchmark_uidx
  on public.vw_factor_carga_benchmark (tipo_agente, anio, mes);

analyze public.vw_factor_carga_mensual;
analyze public.vw_factor_carga_benchmark;
