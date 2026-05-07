-- Auditoria DTE / Costos MEM.
-- Ejecutar en Railway Postgres. Solo crea objetos nuevos y lee public.raw_dte.

create table if not exists public.factura_dte_conceptos_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  tipo_agente text null,
  nemo text not null,
  bloque_codigo text not null,
  bloque_nombre text not null,
  concepto_codigo text not null,
  concepto_nombre text not null,
  importe_pesos numeric not null default 0,
  source_table text not null default 'raw_dte',
  source_file text null,
  source_row_desde int null,
  source_row_hasta int null,
  source_rows_count int not null default 0,
  parser_version text not null default 'auditoria_dte_v1',
  procesado_en timestamptz not null default now()
);

create unique index if not exists factura_dte_conceptos_mensual_uidx
  on public.factura_dte_conceptos_mensual (anio, mes, nemo, concepto_codigo);

create index if not exists factura_dte_conceptos_mensual_nemo_period_idx
  on public.factura_dte_conceptos_mensual (nemo, anio, mes);

create or replace function public.refresh_auditoria_dte(_anio int default null, _mes int default null)
returns void
language plpgsql
as $$
begin
  delete from public.factura_dte_conceptos_mensual
  where (_anio is null or anio = _anio)
    and (_mes is null or mes = _mes);

  insert into public.factura_dte_conceptos_mensual (
    anio, mes, tipo_agente, nemo,
    bloque_codigo, bloque_nombre, concepto_codigo, concepto_nombre,
    importe_pesos, source_file, source_row_desde, source_row_hasta,
    source_rows_count, parser_version, procesado_en
  )
  with marked_rows as (
    select
      r.*,
      public.nemo_from(r.col_001) as nemo_parseado,
      max(case
        when r.raw_text ilike '%4.3%GRANDES USUARIOS%FACTURACI%'
          or r.raw_text ilike '%4.4%GRANDES USUARIOS MENORES%FACTURACI%'
          then r.source_row
      end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_43_row,
      max(case
        when r.raw_text ilike '%4.4%GRANDES USUARIOS MENORES%FACTURACI%'
          then r.source_row
      end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_44_row,
      max(case when r.raw_text = 'FACTURA' or r.raw_text ilike '% FACTURA%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_factura_row,
      max(case
        when r.raw_text ilike '%SUBT.ENERG%'
          or r.raw_text ilike '%ENERGÍA%'
          or r.raw_text ilike '%ENERGIA%'
          then r.source_row
      end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_energia_row,
      max(case when r.raw_text ilike '%CG. POTENCIA%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_potencia_row,
      max(case when r.raw_text ilike '%C.TRANSPORTE%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_transporte_row,
      max(case when r.raw_text ilike '%CARGO OBRAS%' or r.raw_text ilike '%SERV.RESERVA%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_obras_row,
      max(case when r.raw_text ilike '%Cargo Dem.%' or r.raw_text ilike '%SUBFRECUENC%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_ajustes_row,
      max(case when r.raw_text ilike '%CARGOS APLIC%' then r.source_row end)
        over (partition by r.anio, r.mes order by r.source_row rows between unbounded preceding and current row) as latest_cargos_aplicados_row
    from public.raw_dte r
    where (_anio is null or r.anio = _anio)
      and (_mes is null or r.mes = _mes)
      and r.col_001 is not null
  ),
  dte_rows as (
    select
      *,
      greatest(
        coalesce(latest_energia_row, 0),
        coalesce(latest_potencia_row, 0),
        coalesce(latest_transporte_row, 0),
        coalesce(latest_obras_row, 0),
        coalesce(latest_ajustes_row, 0),
        coalesce(latest_cargos_aplicados_row, 0)
      ) as latest_concept_header_row
    from marked_rows
  ),
  concept_rows as (
    select
      *,
      case
        when latest_concept_header_row = latest_energia_row then 'ENERGIA'
        when latest_concept_header_row = latest_potencia_row then 'POTENCIA'
        when latest_concept_header_row = latest_transporte_row then 'TRANSPORTE'
        when latest_concept_header_row = latest_obras_row then 'OBRAS_SERVICIOS'
        when latest_concept_header_row = latest_ajustes_row then 'AJUSTES_OPERATIVOS'
        when latest_concept_header_row = latest_cargos_aplicados_row then 'CARGOS_APLICADOS'
      end as bloque_codigo
    from dte_rows
    where col_count = 12
      and latest_43_row is not null
      and latest_concept_header_row > latest_43_row
      and (latest_factura_row is null or latest_factura_row < latest_concept_header_row)
      and nemo_parseado ~ '^[A-Z0-9.&-]{8}$'
      and upper(nemo_parseado) not in ('AGENTE', 'TOTALES')
  ),
  concept_amounts as (
    select
      anio,
      mes,
      nemo_parseado as nemo,
      bloque_codigo,
      case bloque_codigo
        when 'ENERGIA' then 'Energia MEM'
        when 'POTENCIA' then 'Potencia MEM'
        when 'TRANSPORTE' then 'Transporte'
        when 'OBRAS_SERVICIOS' then 'Obras y servicios de reserva'
        when 'AJUSTES_OPERATIVOS' then 'Ajustes operativos'
        when 'CARGOS_APLICADOS' then 'Cargos aplicados / Res. 281'
      end as bloque_nombre,
      min(source_file) as source_file,
      min(source_row) as source_row_desde,
      max(source_row) as source_row_hasta,
      count(*)::int as source_rows_count,
      sum(
        case bloque_codigo
          when 'ENERGIA' then
            case
              when latest_44_row = latest_43_row then
                coalesce(public.parse_es_number(col_008), 0) +
                coalesce(public.parse_es_number(col_010), 0) +
                coalesce(public.parse_es_number(col_011), 0) +
                coalesce(public.parse_es_number(col_012), 0)
              else
                coalesce(public.parse_es_number(col_003), 0) +
                coalesce(public.parse_es_number(col_005), 0) +
                coalesce(public.parse_es_number(col_007), 0) +
                coalesce(public.parse_es_number(col_009), 0) +
                coalesce(public.parse_es_number(col_010), 0) +
                coalesce(public.parse_es_number(col_011), 0) +
                coalesce(public.parse_es_number(col_012), 0)
            end
          else
            coalesce(public.parse_es_number(col_002), 0) +
            coalesce(public.parse_es_number(col_003), 0) +
            coalesce(public.parse_es_number(col_004), 0) +
            coalesce(public.parse_es_number(col_005), 0) +
            coalesce(public.parse_es_number(col_006), 0) +
            coalesce(public.parse_es_number(col_007), 0) +
            coalesce(public.parse_es_number(col_008), 0) +
            coalesce(public.parse_es_number(col_009), 0) +
            coalesce(public.parse_es_number(col_010), 0) +
            coalesce(public.parse_es_number(col_011), 0) +
            coalesce(public.parse_es_number(col_012), 0)
        end
      ) as importe_pesos
    from concept_rows
    where bloque_codigo is not null
    group by anio, mes, nemo_parseado, bloque_codigo
  ),
  cierre_factura_rows as (
    select
      r.anio,
      r.mes,
      r.nemo_parseado as nemo,
      'CIERRE_FACTURA'::text as bloque_codigo,
      'Cierre factura DTE'::text as bloque_nombre,
      min(r.source_file) as source_file,
      min(r.source_row) as source_row_desde,
      max(r.source_row) as source_row_hasta,
      count(*)::int as source_rows_count,
      sum(
        coalesce(public.parse_es_number(r.col_002), 0) +
        coalesce(public.parse_es_number(r.col_003), 0) +
        coalesce(public.parse_es_number(r.col_004), 0) +
        coalesce(public.parse_es_number(r.col_005), 0) +
        coalesce(public.parse_es_number(r.col_006), 0) +
        coalesce(public.parse_es_number(r.col_007), 0) +
        case when r.col_count = 9 then coalesce(public.parse_es_number(r.col_008), 0) else 0 end
      ) as importe_pesos
    from dte_rows r
    where r.col_count in (8, 9)
      and r.nemo_parseado ~ '^[A-Z0-9.&-]{8}$'
      and upper(r.nemo_parseado) not in ('AGENTE', 'TOTALES')
      and r.latest_43_row is not null
      and r.latest_factura_row > r.latest_43_row
    group by r.anio, r.mes, r.nemo_parseado
  ),
  factura_total_rows as (
    select
      r.anio,
      r.mes,
      r.nemo_parseado as nemo,
      'FACTURA_TOTAL'::text as bloque_codigo,
      'Factura total DTE'::text as bloque_nombre,
      min(r.source_file) as source_file,
      min(r.source_row) as source_row_desde,
      max(r.source_row) as source_row_hasta,
      count(*)::int as source_rows_count,
      sum(coalesce(public.parse_es_number(
        case
          when r.col_count = 9 then r.col_009
          when r.col_count = 8 then r.col_008
          else r.col_002
        end
      ), 0)) as importe_pesos
    from dte_rows r
    where r.col_count in (2, 8, 9)
      and r.nemo_parseado ~ '^[A-Z0-9.&-]{8}$'
      and upper(r.nemo_parseado) not in ('AGENTE', 'TOTALES')
      and r.latest_43_row is not null
      and r.latest_factura_row > r.latest_43_row
    group by r.anio, r.mes, r.nemo_parseado
  ),
  all_rows as (
    select
      anio,
      mes,
      nemo,
      bloque_codigo,
      bloque_nombre,
      'DTE_' || bloque_codigo as concepto_codigo,
      bloque_nombre as concepto_nombre,
      importe_pesos,
      source_file,
      source_row_desde,
      source_row_hasta,
      source_rows_count
    from concept_amounts
    union all
    select
      anio,
      mes,
      nemo,
      bloque_codigo,
      bloque_nombre,
      'DTE_' || bloque_codigo as concepto_codigo,
      bloque_nombre as concepto_nombre,
      importe_pesos,
      source_file,
      source_row_desde,
      source_row_hasta,
      source_rows_count
    from cierre_factura_rows
    union all
    select
      anio,
      mes,
      nemo,
      bloque_codigo,
      bloque_nombre,
      'DTE_FACTURA_TOTAL' as concepto_codigo,
      bloque_nombre as concepto_nombre,
      importe_pesos,
      source_file,
      source_row_desde,
      source_row_hasta,
      source_rows_count
    from factura_total_rows
  )
  , consumo_tipo as (
    select anio, mes, nemo, min(tipo_agente) as tipo_agente
    from public.vw_consumo_gu_mensual
    group by anio, mes, nemo
  )
  select
    a.anio,
    a.mes,
    c.tipo_agente,
    a.nemo,
    a.bloque_codigo,
    a.bloque_nombre,
    a.concepto_codigo,
    a.concepto_nombre,
    a.importe_pesos,
    a.source_file,
    a.source_row_desde,
    a.source_row_hasta,
    a.source_rows_count,
    'auditoria_dte_v1',
    now()
  from all_rows a
  left join consumo_tipo c
    on c.nemo = a.nemo
   and c.anio = a.anio
   and c.mes = a.mes;

  refresh materialized view public.vw_factura_dte_resumen_mensual;
end;
$$;

drop materialized view if exists public.vw_factura_dte_resumen_mensual;

create materialized view public.vw_factura_dte_resumen_mensual as
with base as (
  select
    anio,
    mes,
    min(tipo_agente) filter (where tipo_agente is not null) as tipo_agente,
    nemo,
    sum(importe_pesos) filter (where bloque_codigo = 'FACTURA_TOTAL') as factura_total_pesos,
    sum(importe_pesos) filter (where bloque_codigo <> 'FACTURA_TOTAL') as subtotal_conceptos_pesos,
    sum(importe_pesos) filter (where bloque_codigo = 'ENERGIA') as energia_pesos,
    sum(importe_pesos) filter (where bloque_codigo = 'POTENCIA') as potencia_pesos,
    sum(importe_pesos) filter (where bloque_codigo = 'TRANSPORTE') as transporte_pesos,
    sum(importe_pesos) filter (where bloque_codigo = 'OBRAS_SERVICIOS') as obras_servicios_pesos,
    sum(importe_pesos) filter (where bloque_codigo = 'AJUSTES_OPERATIVOS') as ajustes_operativos_pesos,
    coalesce(sum(importe_pesos) filter (where bloque_codigo = 'CARGOS_APLICADOS'), 0)
      + coalesce(sum(importe_pesos) filter (where bloque_codigo = 'CIERRE_FACTURA'), 0) as cargos_aplicados_pesos,
    count(*) filter (where bloque_codigo <> 'FACTURA_TOTAL') as conceptos_count,
    min(source_row_desde) as source_row_desde,
    max(source_row_hasta) as source_row_hasta
  from public.factura_dte_conceptos_mensual
  group by anio, mes, nemo
),
with_consumo as (
  select
    b.*,
    c.demanda_real_mwh,
    case when c.demanda_real_mwh > 0 then b.factura_total_pesos / c.demanda_real_mwh end as costo_dte_pesos_mwh
  from base b
  left join (
    select anio, mes, nemo, sum(demanda_real_mwh) as demanda_real_mwh
    from public.vw_consumo_gu_mensual
    group by anio, mes, nemo
  ) c
    on c.nemo = b.nemo
   and c.anio = b.anio
   and c.mes = b.mes
),
with_history as (
  select
    w.*,
    lag(w.factura_total_pesos) over (partition by w.nemo order by w.anio, w.mes) as factura_total_mes_anterior_pesos,
    prev_y.factura_total_pesos as factura_total_mismo_mes_anterior_pesos
  from with_consumo w
  left join with_consumo prev_y
    on prev_y.nemo = w.nemo
   and prev_y.anio = w.anio - 1
   and prev_y.mes = w.mes
)
select
  anio,
  mes,
  tipo_agente,
  nemo,
  factura_total_pesos,
  subtotal_conceptos_pesos,
  factura_total_pesos - subtotal_conceptos_pesos as desvio_reconciliacion_pesos,
  case
    when factura_total_pesos is not null and factura_total_pesos <> 0
      then round((factura_total_pesos - subtotal_conceptos_pesos) / factura_total_pesos, 6)
  end as desvio_reconciliacion_pct,
  case
    when factura_total_mes_anterior_pesos > 0
      then round((factura_total_pesos - factura_total_mes_anterior_pesos) / factura_total_mes_anterior_pesos, 6)
  end as variacion_mom_pct,
  case
    when factura_total_mismo_mes_anterior_pesos > 0
      then round((factura_total_pesos - factura_total_mismo_mes_anterior_pesos) / factura_total_mismo_mes_anterior_pesos, 6)
  end as variacion_yoy_pct,
  demanda_real_mwh,
  costo_dte_pesos_mwh,
  energia_pesos,
  potencia_pesos,
  transporte_pesos,
  obras_servicios_pesos,
  ajustes_operativos_pesos,
  cargos_aplicados_pesos,
  conceptos_count,
  greatest(
    coalesce(abs(factura_total_pesos - subtotal_conceptos_pesos), 0),
    case
      when factura_total_mes_anterior_pesos > 0
        and abs((factura_total_pesos - factura_total_mes_anterior_pesos) / factura_total_mes_anterior_pesos) >= 0.25
        then abs(factura_total_pesos - factura_total_mes_anterior_pesos)
      else 0
    end
  ) as importe_revisable_pesos,
  case
    when factura_total_pesos is null then 'sin_factura_total'
    when conceptos_count = 0 then 'sin_conceptos'
    when abs(coalesce(factura_total_pesos - subtotal_conceptos_pesos, 0)) > greatest(abs(factura_total_pesos) * 0.02, 1000000) then 'revisar_reconciliacion'
    when factura_total_mes_anterior_pesos > 0
      and abs((factura_total_pesos - factura_total_mes_anterior_pesos) / factura_total_mes_anterior_pesos) >= 0.25 then 'variacion_mensual_alta'
    else 'ok'
  end as estado_auditoria,
  source_row_desde,
  source_row_hasta
from with_history
with no data;

create unique index if not exists vw_factura_dte_resumen_mensual_uidx
  on public.vw_factura_dte_resumen_mensual (nemo, anio, mes);

create index if not exists vw_factura_dte_resumen_mensual_period_idx
  on public.vw_factura_dte_resumen_mensual (anio, mes);
