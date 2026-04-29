-- Módulo 1: Exposición Spot vs Cobertura Contractual.
-- Ejecutar en Railway Postgres. No depende de Supabase.

create or replace function public.refresh_exposicion_spot_mat()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_consumo_gu_mensual;
  refresh materialized view public.vw_exposicion_spot_mensual;
end;
$$;

drop materialized view if exists public.vw_exposicion_spot_mensual;
drop materialized view if exists public.vw_consumo_gu_mensual;

create materialized view public.vw_consumo_gu_mensual as
with guma_new as (
  select
    'GUMA'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then public.nemo_from(r.col_002) end as distribuidor_nemo,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_003 else r.col_002 end) as demanda_real_total_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_004 else r.col_003 end) as demanda_real_pico_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_005 else r.col_004 end) as demanda_real_valle_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_006 else r.col_005 end) as demanda_real_resto_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_007 else r.col_006 end) as demanda_contratada_total_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_011 else r.col_010 end) as compra_spot_pico_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_012 else r.col_011 end) as compra_spot_valle_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_013 else r.col_012 end) as compra_spot_resto_mwh,
    public.parse_es_number(case when public.nemo_from(r.col_002) ~ '^[A-Z0-9.&-]{8}$' then r.col_014 else r.col_013 end) as compra_spot_pesos,
    'guma_new_' || r.col_count::text as source_layout
  from public.raw_anexo_guma r
  where r.col_count in (30, 31)
),
guma_legacy as (
  select
    'GUMA'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_003) as demanda_real_total_mwh,
    null::numeric as demanda_real_pico_mwh,
    null::numeric as demanda_real_valle_mwh,
    null::numeric as demanda_real_resto_mwh,
    public.parse_es_number(r.col_004) as demanda_contratada_total_mwh,
    null::numeric as compra_spot_pico_mwh,
    null::numeric as compra_spot_valle_mwh,
    public.parse_es_number(r.col_005) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_006) as compra_spot_pesos,
    'guma_legacy_' || r.col_count::text as source_layout
  from public.raw_anexo_guma r
  where r.col_count in (51, 52)
),
gume_23 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_003) as demanda_real_total_mwh,
    public.parse_es_number(r.col_004) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_005) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_006) as demanda_real_resto_mwh,
    greatest(public.parse_es_number(r.col_003) - coalesce(public.parse_es_number(r.col_007), 0), 0) as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_008) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_009) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_010) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_011) as compra_spot_pesos,
    'gume_new_23'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 23
),
gume_22 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_007) as demanda_real_total_mwh,
    public.parse_es_number(r.col_006) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_004) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_005) as demanda_real_resto_mwh,
    0::numeric as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_006) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_004) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_005) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_011) as compra_spot_pesos,
    'gume_legacy_22'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 22
),
gume_31 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_007) as demanda_real_total_mwh,
    public.parse_es_number(r.col_006) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_004) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_005) as demanda_real_resto_mwh,
    0::numeric as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_006) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_004) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_005) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_011) as compra_spot_pesos,
    'gume_legacy_31'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 31
),
gume_32 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_008) as demanda_real_total_mwh,
    public.parse_es_number(r.col_007) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_005) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_006) as demanda_real_resto_mwh,
    0::numeric as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_007) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_005) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_006) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_013) as compra_spot_pesos,
    'gume_legacy_32'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 32
),
gume_33 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_009) as demanda_real_total_mwh,
    public.parse_es_number(r.col_008) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_006) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_007) as demanda_real_resto_mwh,
    0::numeric as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_008) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_006) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_007) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_014) as compra_spot_pesos,
    'gume_legacy_33'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 33
),
gume_34 as (
  select
    'GUME'::text as tipo_agente,
    public.nemo_from(r.col_001) as nemo,
    r.anio,
    r.mes,
    public.nemo_from(r.col_002) as distribuidor_nemo,
    public.parse_es_number(r.col_010) as demanda_real_total_mwh,
    public.parse_es_number(r.col_009) as demanda_real_pico_mwh,
    public.parse_es_number(r.col_007) as demanda_real_valle_mwh,
    public.parse_es_number(r.col_008) as demanda_real_resto_mwh,
    0::numeric as demanda_contratada_total_mwh,
    public.parse_es_number(r.col_009) as compra_spot_pico_mwh,
    public.parse_es_number(r.col_007) as compra_spot_valle_mwh,
    public.parse_es_number(r.col_008) as compra_spot_resto_mwh,
    public.parse_es_number(r.col_014) as compra_spot_pesos,
    'gume_legacy_34'::text as source_layout
  from public.raw_anexo_gume r
  where r.col_count = 34
),
normalized as (
  select * from guma_new
  union all select * from guma_legacy
  union all select * from gume_23
  union all select * from gume_22
  union all select * from gume_31
  union all select * from gume_32
  union all select * from gume_33
  union all select * from gume_34
),
filtered as (
  select *
  from normalized
  where nemo is not null
    and nemo !~ '^\['
    and upper(nemo) not in ('AGENTE', 'GUMA', 'GUME', 'TOTAL', 'TOTALES')
    and demanda_real_total_mwh is not null
)
select
  tipo_agente,
  nemo,
  anio,
  mes,
  min(distribuidor_nemo) filter (where distribuidor_nemo is not null) as distribuidor_nemo,
  sum(demanda_real_total_mwh) as demanda_real_mwh,
  sum(coalesce(demanda_real_pico_mwh, 0)) as demanda_real_pico_mwh,
  sum(coalesce(demanda_real_valle_mwh, 0)) as demanda_real_valle_mwh,
  sum(coalesce(demanda_real_resto_mwh, 0)) as demanda_real_resto_mwh,
  sum(coalesce(demanda_contratada_total_mwh, 0)) as demanda_contratada_mwh,
  sum(coalesce(compra_spot_pico_mwh, 0) + coalesce(compra_spot_valle_mwh, 0) + coalesce(compra_spot_resto_mwh, 0)) as compra_spot_mwh,
  sum(coalesce(compra_spot_pico_mwh, 0)) as compra_spot_pico_mwh,
  sum(coalesce(compra_spot_valle_mwh, 0)) as compra_spot_valle_mwh,
  sum(coalesce(compra_spot_resto_mwh, 0)) as compra_spot_resto_mwh,
  sum(coalesce(compra_spot_pesos, 0)) as spot_pesos,
  count(*) as source_rows,
  string_agg(distinct source_layout, ', ' order by source_layout) as source_layouts
from filtered
group by tipo_agente, nemo, anio, mes
with data;

create unique index vw_consumo_gu_mensual_uidx
  on public.vw_consumo_gu_mensual (tipo_agente, nemo, anio, mes);

create index vw_consumo_gu_mensual_nemo_period_idx
  on public.vw_consumo_gu_mensual (nemo, anio, mes);

create materialized view public.vw_exposicion_spot_mensual as
select
  tipo_agente,
  nemo,
  anio,
  mes,
  distribuidor_nemo,
  demanda_real_mwh,
  demanda_real_pico_mwh,
  demanda_real_valle_mwh,
  demanda_real_resto_mwh,
  demanda_contratada_mwh,
  compra_spot_mwh,
  compra_spot_pico_mwh,
  compra_spot_valle_mwh,
  compra_spot_resto_mwh,
  spot_pesos,
  case when demanda_real_mwh > 0 then round(compra_spot_mwh / demanda_real_mwh, 6) end as pct_spot,
  case when demanda_real_mwh > 0 then round(demanda_contratada_mwh / demanda_real_mwh, 6) end as pct_mat,
  greatest(demanda_contratada_mwh - demanda_real_mwh, 0) as sobre_contrato_mwh,
  greatest(demanda_real_mwh - demanda_contratada_mwh, 0) as sub_contrato_mwh,
  case when compra_spot_mwh > 0 then round(spot_pesos / compra_spot_mwh, 6) end as costo_spot_promedio_pesos_mwh,
  source_rows,
  source_layouts,
  case
    when demanda_real_mwh is null or demanda_real_mwh <= 0 then 'sin_demanda'
    when compra_spot_mwh > demanda_real_mwh * 1.05 then 'spot_mayor_demanda'
    when tipo_agente = 'GUME' and demanda_contratada_mwh = 0 then 'gume_spot_only'
    else 'ok'
  end as calidad_dato
from public.vw_consumo_gu_mensual
with data;

create unique index vw_exposicion_spot_mensual_uidx
  on public.vw_exposicion_spot_mensual (tipo_agente, nemo, anio, mes);

create index vw_exposicion_spot_mensual_nemo_period_idx
  on public.vw_exposicion_spot_mensual (nemo, anio, mes);

analyze public.vw_consumo_gu_mensual;
analyze public.vw_exposicion_spot_mensual;
