-- Módulo 2: Cumplimiento Ley 27.191.
-- Ejecutar en Railway Postgres. Depende de vw_consumo_gu_mensual del Módulo 1.

create table if not exists public.compliance_27191_obligacion (
  anio int primary key,
  pct_minimo numeric(8, 6) not null check (pct_minimo >= 0 and pct_minimo <= 1),
  multa_pesos_mwh numeric null,
  fuente text not null default 'Ley 27.191 / Res. 281-E/2017',
  updated_at timestamptz not null default now()
);

insert into public.compliance_27191_obligacion (anio, pct_minimo, fuente)
values
  (2021, 0.16, 'Ley 27.191 / Res. 281-E/2017: 2021-2022 16%'),
  (2022, 0.16, 'Ley 27.191 / Res. 281-E/2017: 2021-2022 16%'),
  (2023, 0.18, 'Ley 27.191 / Res. 281-E/2017: 2023-2024 18%'),
  (2024, 0.18, 'Ley 27.191 / Res. 281-E/2017: 2023-2024 18%'),
  (2025, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%'),
  (2026, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%'),
  (2027, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%'),
  (2028, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%'),
  (2029, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%'),
  (2030, 0.20, 'Ley 27.191 / Res. 281-E/2017: 2025-2030 20%')
on conflict (anio) do update
  set pct_minimo = excluded.pct_minimo,
      fuente = excluded.fuente,
      updated_at = now();

create or replace function public.refresh_compliance_27191()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_renovable_contratado_mensual;
  refresh materialized view public.vw_compliance_27191_mensual;
end;
$$;

drop materialized view if exists public.vw_compliance_27191_mensual;
drop materialized view if exists public.vw_renovable_contratado_mensual;

create materialized view public.vw_renovable_contratado_mensual as
with normalized as (
  select
    r.anio,
    r.mes,
    public.nemo_from(r.col_001) as generador_nemo,
    nullif(trim(r.col_002), '') as conjunto_generador,
    public.nemo_from(r.col_003) as demandante_nemo,
    case when r.col_count = 6 then public.nemo_from(r.col_004) end as comercializador_nemo,
    public.parse_es_number(case when r.col_count = 6 then r.col_005 else r.col_004 end) as energia_contrato_mwh,
    public.parse_es_number(case when r.col_count = 6 then r.col_006 else r.col_005 end) as importe_contrato_pesos,
    r.col_count,
    r.source_file
  from public.raw_anexo_mat_renovable r
  where r.col_count in (5, 6)
),
filtered as (
  select *
  from normalized
  where demandante_nemo is not null
    and demandante_nemo !~ '^\['
    and upper(demandante_nemo) not in ('AGENTE', 'TOTAL', 'TOTALES')
    and energia_contrato_mwh is not null
    and importe_contrato_pesos is not null
)
select
  demandante_nemo as nemo,
  anio,
  mes,
  sum(coalesce(energia_contrato_mwh, 0)) as renovable_contratado_mwh,
  sum(coalesce(importe_contrato_pesos, 0)) as importe_renovable_pesos,
  case
    when sum(coalesce(energia_contrato_mwh, 0)) > 0
      then round(sum(coalesce(importe_contrato_pesos, 0)) / sum(coalesce(energia_contrato_mwh, 0)), 6)
  end as precio_implicito_pesos_mwh,
  count(distinct generador_nemo) filter (where generador_nemo is not null) as generadores_unicos,
  count(distinct comercializador_nemo) filter (where comercializador_nemo is not null) as comercializadores_unicos,
  count(*) as source_rows,
  string_agg(distinct 'cols_' || col_count::text, ', ' order by 'cols_' || col_count::text) as source_layouts
from filtered
group by demandante_nemo, anio, mes
with data;

create unique index vw_renovable_contratado_mensual_uidx
  on public.vw_renovable_contratado_mensual (nemo, anio, mes);

create index vw_renovable_contratado_mensual_period_idx
  on public.vw_renovable_contratado_mensual (anio, mes);

create materialized view public.vw_compliance_27191_mensual as
with base as (
  select
    c.tipo_agente,
    c.nemo,
    c.anio,
    c.mes,
    c.demanda_real_mwh,
    coalesce(r.renovable_contratado_mwh, 0) as renovable_contratado_mwh,
    coalesce(r.importe_renovable_pesos, 0) as importe_renovable_pesos,
    r.precio_implicito_pesos_mwh,
    coalesce(r.generadores_unicos, 0) as generadores_unicos,
    coalesce(r.comercializadores_unicos, 0) as comercializadores_unicos,
    o.pct_minimo as obligacion_pct,
    o.multa_pesos_mwh as multa_override_pesos_mwh,
    o.fuente as obligacion_fuente
  from public.vw_consumo_gu_mensual c
  join public.compliance_27191_obligacion o
    on o.anio = c.anio
  left join public.vw_renovable_contratado_mensual r
    on r.nemo = c.nemo
   and r.anio = c.anio
   and r.mes = c.mes
),
with_refs as (
  select
    b.*,
    case
      when sum(b.renovable_contratado_mwh) over cliente_12m > 0
        then round(sum(b.importe_renovable_pesos) over cliente_12m / sum(b.renovable_contratado_mwh) over cliente_12m, 6)
    end as precio_cliente_12m_pesos_mwh,
    case
      when sum(b.renovable_contratado_mwh) over universo_anual > 0
        then round(sum(b.importe_renovable_pesos) over universo_anual / sum(b.renovable_contratado_mwh) over universo_anual, 6)
    end as precio_universo_anual_pesos_mwh,
    -- CVP combustibles alternativos promedio 12m anteriores * cotizacion del mes
    -- (Ley 27.191 Art. 11: la multa se paga al CVP gasoil/fueloil promedio
    --  ponderado de los 12 meses del anio calendario anterior)
    (
      select round(
        avg(cb.costo_total_usd_mwh_alt) * (
          select cd.cotizacion_ars
          from public.cotizacion_dolar_mensual cd
          where cd.anio = b.anio and cd.mes = b.mes
        ),
        2
      )
      from public.combustibles_precios_mensual cb
      where (cb.anio * 100 + cb.mes)
            between ((b.anio - 1) * 100 + b.mes) and (b.anio * 100 + b.mes - 1)
    ) as precio_cvp_alternativos_pesos_mwh,
    sum(b.demanda_real_mwh) over ytd as demanda_ytd_mwh,
    sum(b.renovable_contratado_mwh) over ytd as renovable_ytd_mwh
  from base b
  window
    cliente_12m as (
      partition by b.nemo
      order by b.anio, b.mes
      rows between 11 preceding and current row
    ),
    universo_anual as (
      partition by b.anio
    ),
    ytd as (
      partition by b.nemo, b.anio
      order by b.mes
      rows between unbounded preceding and current row
    )
),
calculated as (
  select
    *,
    demanda_real_mwh * obligacion_pct as obligacion_mwh,
    greatest(demanda_real_mwh * obligacion_pct - renovable_contratado_mwh, 0) as brecha_mwh,
    case
      when demanda_real_mwh > 0 then round(renovable_contratado_mwh / demanda_real_mwh, 6)
    end as pct_renovable_real,
    case
      when demanda_ytd_mwh > 0 then round(renovable_ytd_mwh / demanda_ytd_mwh, 6)
    end as pct_renovable_ytd,
    -- Orden de fallback: override > CVP gasoil (oficial) > MATER cliente > MATER universo > 0
    coalesce(
      multa_override_pesos_mwh,
      precio_cvp_alternativos_pesos_mwh,
      precio_cliente_12m_pesos_mwh,
      precio_universo_anual_pesos_mwh,
      0
    ) as multa_ref_pesos_mwh,
    case
      when multa_override_pesos_mwh is not null then 'tabla_obligacion'
      when precio_cvp_alternativos_pesos_mwh is not null then 'cvp_alternativos'
      when precio_cliente_12m_pesos_mwh is not null then 'cliente_12m'
      when precio_universo_anual_pesos_mwh is not null then 'universo_anual'
      else 'sin_precio'
    end as multa_metodo
  from with_refs
)
select
  tipo_agente,
  nemo,
  anio,
  mes,
  demanda_real_mwh,
  renovable_contratado_mwh,
  importe_renovable_pesos,
  precio_implicito_pesos_mwh,
  generadores_unicos,
  comercializadores_unicos,
  obligacion_pct,
  obligacion_mwh,
  pct_renovable_real,
  pct_renovable_ytd,
  demanda_ytd_mwh,
  renovable_ytd_mwh,
  greatest(demanda_ytd_mwh * obligacion_pct - renovable_ytd_mwh, 0) as brecha_ytd_mwh,
  brecha_mwh,
  brecha_mwh * multa_ref_pesos_mwh as multa_estimada_pesos,
  multa_ref_pesos_mwh,
  multa_metodo,
  renovable_contratado_mwh >= obligacion_mwh as cumple_mes,
  renovable_ytd_mwh >= demanda_ytd_mwh * obligacion_pct as cumple_ytd,
  obligacion_fuente,
  case
    when demanda_real_mwh is null or demanda_real_mwh <= 0 then 'sin_demanda'
    when renovable_contratado_mwh = 0 then 'sin_renovable'
    when renovable_contratado_mwh >= obligacion_mwh then 'cumple'
    else 'brecha'
  end as calidad_dato
from calculated
with data;

create unique index vw_compliance_27191_mensual_uidx
  on public.vw_compliance_27191_mensual (tipo_agente, nemo, anio, mes);

create index vw_compliance_27191_mensual_nemo_period_idx
  on public.vw_compliance_27191_mensual (nemo, anio, mes);

analyze public.vw_renovable_contratado_mensual;
analyze public.vw_compliance_27191_mensual;
