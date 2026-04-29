-- Reemplaza refresh_mater_contrato_mensual para evitar usar raw_anexo_mat
-- cuando el HTML existe pero trae cobertura parcial.

create or replace function public.refresh_mater_contrato_mensual(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'mater_contrato_mensual_v1';
  v_deleted int := 0;
  v_inserted int := 0;
  v_use_html boolean;
  v_html_rows int := 0;
  v_txt_rows int := 0;
begin
  delete from public.mater_contrato_mensual
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  select count(*)
    into v_html_rows
    from public.raw_anexo_mat r
   where r.anio = _anio
     and r.mes = _mes
     and r.col_count in (8, 9)
     and public.nemo_from(r.col_001) is not null
     and trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
     and trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
     and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'TOTAL', 'TOTALES')
     and coalesce(r.col_001, '') !~ '^-+$';

  select count(*)
    into v_txt_rows
    from public.raw_amat r
   where r.anio = _anio
     and r.mes = _mes
     and r.col_count in (11, 12)
     and public.nemo_from(r.col_001) is not null
     and public.nemo_from(r.col_003) is not null
     and trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
     and trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
     and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'GENERADOR', 'TOTAL', 'TOTALES')
     and coalesce(r.col_001, '') !~ '^-+$';

  v_use_html := v_html_rows >= 100 and (v_txt_rows = 0 or v_html_rows >= ceil(v_txt_rows * 0.90));

  if v_use_html then
    with src as (
      select
        r.id,
        r.anio,
        r.mes,
        public.nemo_from(r.col_001) as generador_nemo,
        nullif(trim(r.col_002), '') as conjunto_generador,
        public.nemo_from(r.col_003) as demandante_nemo,
        case when r.col_count = 9 then nullif(trim(r.col_004), '') end as comercializador,
        public.parse_es_number(case when r.col_count = 9 then r.col_005 else r.col_004 end) as energia_valle_mwh,
        public.parse_es_number(case when r.col_count = 9 then r.col_006 else r.col_005 end) as energia_resto_mwh,
        public.parse_es_number(case when r.col_count = 9 then r.col_007 else r.col_006 end) as energia_pico_mwh,
        public.parse_es_number(case when r.col_count = 9 then r.col_008 else r.col_007 end) as energia_total_mwh,
        public.parse_es_number(case when r.col_count = 9 then r.col_009 else r.col_008 end) as importe_contrato_pesos
      from public.raw_anexo_mat r
      where r.anio = _anio
        and r.mes = _mes
        and r.col_count in (8, 9)
        and public.nemo_from(r.col_001) is not null
        and public.nemo_from(r.col_003) is not null
        and trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
        and trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
        and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'TOTAL', 'TOTALES')
        and coalesce(r.col_001, '') !~ '^-+$'
    ), ins as (
      insert into public.mater_contrato_mensual (
        anio, mes, generador_nemo, conjunto_generador, demandante_nemo,
        comercializador, energia_valle_mwh, energia_resto_mwh, energia_pico_mwh,
        energia_total_mwh, importe_contrato_pesos, precio_efectivo_pesos_mwh,
        tipo_contrato, source_table, source_id, parser_version
      )
      select
        anio, mes, generador_nemo, conjunto_generador, demandante_nemo,
        comercializador, energia_valle_mwh, energia_resto_mwh, energia_pico_mwh,
        energia_total_mwh, importe_contrato_pesos,
        importe_contrato_pesos / nullif(energia_total_mwh, 0),
        'BASE', 'raw_anexo_mat', id, v_parser_version
      from src
      where energia_total_mwh is not null
         or importe_contrato_pesos is not null
      returning 1
    )
    select count(*) into v_inserted from ins;
  else
    with src as (
      select
        r.id,
        r.anio,
        r.mes,
        public.nemo_from(r.col_001) as generador_nemo,
        nullif(trim(r.col_002), '') as conjunto_generador,
        public.nemo_from(r.col_003) as demandante_nemo,
        case when r.col_count = 12 then nullif(trim(r.col_004), '') end as comercializador,
        public.parse_es_number(case when r.col_count = 12 then r.col_008 else r.col_007 end) as energia_valle_mwh,
        public.parse_es_number(case when r.col_count = 12 then r.col_009 else r.col_008 end) as energia_resto_mwh,
        public.parse_es_number(case when r.col_count = 12 then r.col_010 else r.col_009 end) as energia_pico_mwh,
        public.parse_es_number(case when r.col_count = 12 then r.col_011 else r.col_010 end) as energia_total_mwh,
        public.parse_es_number(case when r.col_count = 12 then r.col_012 else r.col_011 end) as importe_contrato_pesos
      from public.raw_amat r
      where r.anio = _anio
        and r.mes = _mes
        and r.col_count in (11, 12)
        and public.nemo_from(r.col_001) is not null
        and public.nemo_from(r.col_003) is not null
        and trim(coalesce(r.col_001, '')) ~ '^[A-Z0-9-]{8}$'
        and trim(coalesce(r.col_003, '')) ~ '^[A-Z0-9-]{8}$'
        and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'GENERADOR', 'TOTAL', 'TOTALES')
        and coalesce(r.col_001, '') !~ '^-+$'
    ), ins as (
      insert into public.mater_contrato_mensual (
        anio, mes, generador_nemo, conjunto_generador, demandante_nemo,
        comercializador, energia_valle_mwh, energia_resto_mwh, energia_pico_mwh,
        energia_total_mwh, importe_contrato_pesos, precio_efectivo_pesos_mwh,
        tipo_contrato, source_table, source_id, parser_version
      )
      select
        anio, mes, generador_nemo, conjunto_generador, demandante_nemo,
        comercializador, energia_valle_mwh, energia_resto_mwh, energia_pico_mwh,
        energia_total_mwh, importe_contrato_pesos,
        importe_contrato_pesos / nullif(energia_total_mwh, 0),
        'BASE', 'raw_amat', id, v_parser_version
      from src
      where energia_total_mwh is not null
         or importe_contrato_pesos is not null
      returning 1
    )
    select count(*) into v_inserted from ins;
  end if;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;
