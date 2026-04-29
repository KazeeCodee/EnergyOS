-- Módulo 6: Informe energético / pantalla de inicio.

create or replace function public.refresh_dashboard_inicio()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_universo_demanda_mensual;
  refresh materialized view public.vw_mercado_resumen_mensual;
end;
$$;

drop materialized view if exists public.vw_mercado_resumen_mensual;
drop materialized view if exists public.vw_universo_demanda_mensual;

create materialized view public.vw_universo_demanda_mensual as
select
  tipo_agente,
  anio,
  mes,
  sum(demanda_real_mwh) as demanda_total_mwh,
  sum(demanda_contratada_mwh) as mater_estimado_mwh,
  sum(compra_spot_mwh) as spot_mwh,
  null::numeric as plus_mwh,
  false as plus_disponible,
  case when sum(demanda_real_mwh) > 0 then round(sum(demanda_contratada_mwh) / sum(demanda_real_mwh), 6) end as mater_estimado_pct,
  case when sum(demanda_real_mwh) > 0 then round(sum(compra_spot_mwh) / sum(demanda_real_mwh), 6) end as spot_pct,
  null::numeric as plus_pct,
  count(distinct nemo) as agentes_count,
  count(*) as filas_count
from public.vw_consumo_gu_mensual
group by tipo_agente, anio, mes
with data;

create unique index vw_universo_demanda_mensual_uidx
  on public.vw_universo_demanda_mensual (tipo_agente, anio, mes);

create index vw_universo_demanda_mensual_period_idx
  on public.vw_universo_demanda_mensual (anio, mes);

create materialized view public.vw_mercado_resumen_mensual as
with memnet_mes as (
  select
    extract(year from fecha)::int as anio,
    extract(month from fecha)::int as mes,
    avg(nuclear) as nuclear_mw_promedio,
    avg(termico) as termico_mw_promedio,
    avg(renovable_hidro_50mw) as renovable_hidro_50mw_mw_promedio,
    avg(renovable_ley_26190) as renovable_ley_26190_mw_promedio,
    avg(importacion) as importacion_mw_promedio,
    avg(total) as total_mw_promedio,
    count(*) as muestras,
    min(fecha) as fuente_desde,
    max(fecha) as fuente_hasta
  from public.cammesa_memnet_generacion
  group by extract(year from fecha)::int, extract(month from fecha)::int
),
calc as (
  select
    *,
    total_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as generacion_total_gwh,
    nuclear_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as nuclear_gwh,
    termico_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as termico_gwh,
    renovable_hidro_50mw_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as renovable_hidro_50mw_gwh,
    renovable_ley_26190_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as renovable_ley_26190_gwh,
    importacion_mw_promedio * 24 * extract(day from (date_trunc('month', make_date(anio, mes, 1)) + interval '1 month - 1 day')) / 1000 as importacion_gwh
  from memnet_mes
)
select
  anio,
  mes,
  'memnet_intradiario_extrapolado'::text as fuente,
  false as periodo_completo,
  muestras,
  fuente_desde,
  fuente_hasta,
  generacion_total_gwh,
  null::numeric as generacion_total_mom_pct,
  null::numeric as generacion_total_yoy_pct,
  null::numeric as generacion_mater_gwh,
  null::numeric as generacion_mater_mom_pct,
  null::numeric as generacion_mater_yoy_pct,
  nuclear_gwh,
  termico_gwh,
  renovable_hidro_50mw_gwh,
  renovable_ley_26190_gwh,
  importacion_gwh,
  case when generacion_total_gwh > 0 then round(nuclear_gwh / generacion_total_gwh, 6) end as nuclear_pct,
  case when generacion_total_gwh > 0 then round(termico_gwh / generacion_total_gwh, 6) end as termico_pct,
  case when generacion_total_gwh > 0 then round(renovable_hidro_50mw_gwh / generacion_total_gwh, 6) end as renovable_hidro_50mw_pct,
  case when generacion_total_gwh > 0 then round(renovable_ley_26190_gwh / generacion_total_gwh, 6) end as renovable_ley_26190_pct,
  case when generacion_total_gwh > 0 then round(importacion_gwh / generacion_total_gwh, 6) end as importacion_pct
from calc
with data;

create unique index vw_mercado_resumen_mensual_uidx
  on public.vw_mercado_resumen_mensual (anio, mes, fuente);

analyze public.vw_universo_demanda_mensual;
analyze public.vw_mercado_resumen_mensual;
