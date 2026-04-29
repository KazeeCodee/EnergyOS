-- Módulo 4: Mi historia energética.
-- Resumen compacto por agente. La serie mensual se consulta directo desde vw_consumo_gu_mensual.

create or replace function public.refresh_historia_resumen()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_historia_resumen_agente;
end;
$$;

drop materialized view if exists public.vw_historia_resumen_agente;

create materialized view public.vw_historia_resumen_agente as
with base as (
  select
    c.tipo_agente,
    c.nemo,
    c.anio,
    c.mes,
    c.demanda_real_mwh,
    c.demanda_real_pico_mwh,
    c.demanda_real_valle_mwh,
    c.demanda_real_resto_mwh,
    make_date(c.anio, c.mes, 1) as periodo_date
  from public.vw_consumo_gu_mensual c
  where c.demanda_real_mwh is not null
),
ranked as (
  select
    b.*,
    row_number() over (partition by tipo_agente, nemo order by periodo_date asc) as rn_first,
    row_number() over (partition by tipo_agente, nemo order by periodo_date desc) as rn_last,
    row_number() over (partition by tipo_agente, nemo order by demanda_real_mwh desc nulls last, periodo_date desc) as rn_max,
    row_number() over (partition by tipo_agente, nemo order by demanda_real_mwh asc nulls last, periodo_date desc) as rn_min,
    max(periodo_date) over (partition by tipo_agente, nemo) as ultimo_periodo_date
  from base b
),
agg as (
  select
    tipo_agente,
    nemo,
    count(*) as meses_disponibles,
    min(periodo_date) as primer_periodo_date,
    max(periodo_date) as ultimo_periodo_date,
    sum(demanda_real_mwh) as demanda_total_mwh,
    avg(demanda_real_mwh) as demanda_promedio_mensual_mwh
  from ranked
  group by tipo_agente, nemo
),
rollups as (
  select
    r.tipo_agente,
    r.nemo,
    sum(r.demanda_real_mwh) filter (where r.periodo_date > r.ultimo_periodo_date - interval '12 months') as demanda_ultimos_12m_mwh,
    avg(r.demanda_real_mwh) filter (where r.periodo_date > r.ultimo_periodo_date - interval '12 months') as demanda_promedio_ultimos_12m_mwh,
    sum(r.demanda_real_mwh) filter (
      where r.periodo_date <= r.ultimo_periodo_date - interval '12 months'
        and r.periodo_date > r.ultimo_periodo_date - interval '24 months'
    ) as demanda_12m_previos_mwh
  from ranked r
  group by r.tipo_agente, r.nemo
),
picked as (
  select
    a.tipo_agente,
    a.nemo,
    a.meses_disponibles,
    a.primer_periodo_date,
    a.ultimo_periodo_date,
    a.demanda_total_mwh,
    a.demanda_promedio_mensual_mwh,
    ro.demanda_ultimos_12m_mwh,
    ro.demanda_promedio_ultimos_12m_mwh,
    ro.demanda_12m_previos_mwh,
    first_row.demanda_real_mwh as primer_mes_demanda_mwh,
    last_row.demanda_real_mwh as ultimo_mes_demanda_mwh,
    max_row.anio as mes_mayor_consumo_anio,
    max_row.mes as mes_mayor_consumo_mes,
    max_row.demanda_real_mwh as mes_mayor_consumo_mwh,
    min_row.anio as mes_menor_consumo_anio,
    min_row.mes as mes_menor_consumo_mes,
    min_row.demanda_real_mwh as mes_menor_consumo_mwh,
    yoy_row.demanda_real_mwh as mismo_mes_anio_anterior_mwh
  from agg a
  join rollups ro
    on ro.tipo_agente = a.tipo_agente
   and ro.nemo = a.nemo
  left join ranked first_row
    on first_row.tipo_agente = a.tipo_agente
   and first_row.nemo = a.nemo
   and first_row.rn_first = 1
  left join ranked last_row
    on last_row.tipo_agente = a.tipo_agente
   and last_row.nemo = a.nemo
   and last_row.rn_last = 1
  left join ranked max_row
    on max_row.tipo_agente = a.tipo_agente
   and max_row.nemo = a.nemo
   and max_row.rn_max = 1
  left join ranked min_row
    on min_row.tipo_agente = a.tipo_agente
   and min_row.nemo = a.nemo
   and min_row.rn_min = 1
  left join ranked yoy_row
    on yoy_row.tipo_agente = last_row.tipo_agente
   and yoy_row.nemo = last_row.nemo
   and yoy_row.anio = last_row.anio - 1
   and yoy_row.mes = last_row.mes
)
select
  tipo_agente,
  nemo,
  meses_disponibles,
  extract(year from primer_periodo_date)::int as primer_anio,
  extract(month from primer_periodo_date)::int as primer_mes,
  extract(year from ultimo_periodo_date)::int as ultimo_anio,
  extract(month from ultimo_periodo_date)::int as ultimo_mes,
  demanda_total_mwh,
  demanda_promedio_mensual_mwh,
  demanda_ultimos_12m_mwh,
  demanda_promedio_ultimos_12m_mwh,
  demanda_12m_previos_mwh,
  case
    when demanda_12m_previos_mwh > 0
      then round((demanda_ultimos_12m_mwh - demanda_12m_previos_mwh) / demanda_12m_previos_mwh, 6)
  end as variacion_ultimos_12m_pct,
  primer_mes_demanda_mwh,
  ultimo_mes_demanda_mwh,
  mismo_mes_anio_anterior_mwh,
  case
    when mismo_mes_anio_anterior_mwh > 0
      then round((ultimo_mes_demanda_mwh - mismo_mes_anio_anterior_mwh) / mismo_mes_anio_anterior_mwh, 6)
  end as variacion_yoy_ultimo_mes_pct,
  mes_mayor_consumo_anio,
  mes_mayor_consumo_mes,
  mes_mayor_consumo_mwh,
  mes_menor_consumo_anio,
  mes_menor_consumo_mes,
  mes_menor_consumo_mwh
from picked
with data;

create unique index vw_historia_resumen_agente_uidx
  on public.vw_historia_resumen_agente (tipo_agente, nemo);

create index vw_historia_resumen_agente_nemo_idx
  on public.vw_historia_resumen_agente (nemo);

analyze public.vw_historia_resumen_agente;
