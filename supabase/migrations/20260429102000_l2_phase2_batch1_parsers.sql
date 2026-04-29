-- Fase 2 batch 1: parsers L2 de alto valor y bajo riesgo semantico.
-- Incluye T2.1, T2.2, T2.3 y T2.6.

-- ─────────────────────────────────────────────────────────────────────────────
-- T2.1 mater_contrato_mensual
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.mater_contrato_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  generador_nemo text not null,
  conjunto_generador text null,
  demandante_nemo text not null,
  comercializador text null,
  energia_valle_mwh numeric null,
  energia_resto_mwh numeric null,
  energia_pico_mwh numeric null,
  energia_total_mwh numeric null,
  importe_contrato_pesos numeric null,
  precio_efectivo_pesos_mwh numeric null,
  tipo_contrato text not null default 'BASE',
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists mater_contrato_mensual_source_uidx
  on public.mater_contrato_mensual(source_table, source_id);

create index if not exists mater_contrato_mensual_demandante_periodo_idx
  on public.mater_contrato_mensual(demandante_nemo, anio, mes);

create index if not exists mater_contrato_mensual_generador_periodo_idx
  on public.mater_contrato_mensual(generador_nemo, anio, mes);

alter table public.mater_contrato_mensual enable row level security;

drop policy if exists mater_contrato_mensual_select_authenticated on public.mater_contrato_mensual;
create policy mater_contrato_mensual_select_authenticated
  on public.mater_contrato_mensual
  for select to authenticated
  using (true);

drop policy if exists mater_contrato_mensual_admin_all on public.mater_contrato_mensual;
create policy mater_contrato_mensual_admin_all
  on public.mater_contrato_mensual
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

  -- raw_anexo_mat existe en meses viejos pero a veces viene parcial.
  -- Solo gana contra raw_amat si cubre al menos 90% del TXT del mismo periodo.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- T2.2 guma_detalle_mensual
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.guma_detalle_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  agente_nemo text not null,
  distribuidor_nemo text null,
  demanda_real_total_mwh numeric null,
  demanda_real_pico_mwh numeric null,
  demanda_real_valle_mwh numeric null,
  demanda_real_resto_mwh numeric null,
  demanda_contratada_total_mwh numeric null,
  demanda_contratada_pico_mwh numeric null,
  demanda_contratada_valle_mwh numeric null,
  demanda_contratada_resto_mwh numeric null,
  compra_spot_pico_mwh numeric null,
  compra_spot_valle_mwh numeric null,
  compra_spot_resto_mwh numeric null,
  compra_spot_pesos numeric null,
  cargo_energia_adicional_pesos numeric null,
  cargo_servicios_pesos numeric null,
  recupero_costos_operat_pesos numeric null,
  cargo_serv_confiabilidad_pesos numeric null,
  cargo_transp_at_pesos numeric null,
  cargo_transp_dt_pesos numeric null,
  cargo_ampliac_at_pesos numeric null,
  cargo_ampliac_dt_pesos numeric null,
  potencia_maxima_mw numeric null,
  potencia_declarada_mw numeric null,
  potencia_phmd_mw numeric null,
  compra_ppad_mw numeric null,
  compra_potencia_ppad_mwhrp numeric null,
  potencia_contratada_mwhrp numeric null,
  potencia_mater_mw numeric null,
  potencia_pesos numeric null,
  cargo_comercializ_cc_pesos numeric null,
  source_layout text not null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists guma_detalle_mensual_source_uidx
  on public.guma_detalle_mensual(source_table, source_id);

create index if not exists guma_detalle_mensual_agente_periodo_idx
  on public.guma_detalle_mensual(agente_nemo, anio, mes);

alter table public.guma_detalle_mensual enable row level security;

drop policy if exists guma_detalle_mensual_select_authenticated on public.guma_detalle_mensual;
create policy guma_detalle_mensual_select_authenticated
  on public.guma_detalle_mensual
  for select to authenticated
  using (true);

drop policy if exists guma_detalle_mensual_admin_all on public.guma_detalle_mensual;
create policy guma_detalle_mensual_admin_all
  on public.guma_detalle_mensual
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.refresh_guma_detalle_mensual(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'guma_detalle_mensual_v1';
  v_deleted int := 0;
  v_inserted int := 0;
begin
  delete from public.guma_detalle_mensual
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with normalized as (
    select
      r.id,
      r.anio,
      r.mes,
      public.nemo_from(r.col_001) as agente_nemo,
      case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then public.nemo_from(r.col_002) end as distribuidor_nemo,
      'html_new'::text as source_layout,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_003 else r.col_002 end) as demanda_real_total_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_004 else r.col_003 end) as demanda_real_pico_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_005 else r.col_004 end) as demanda_real_valle_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_006 else r.col_005 end) as demanda_real_resto_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_007 else r.col_006 end) as demanda_contratada_total_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_008 else r.col_007 end) as demanda_contratada_pico_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_009 else r.col_008 end) as demanda_contratada_valle_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_010 else r.col_009 end) as demanda_contratada_resto_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_011 else r.col_010 end) as compra_spot_pico_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_012 else r.col_011 end) as compra_spot_valle_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_013 else r.col_012 end) as compra_spot_resto_mwh,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_014 else r.col_013 end) as compra_spot_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_015 else r.col_014 end) as cargo_energia_adicional_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_016 else r.col_015 end) as cargo_servicios_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_017 else r.col_016 end) as recupero_costos_operat_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_018 else r.col_017 end) as cargo_serv_confiabilidad_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_019 else r.col_018 end) as cargo_transp_at_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_020 else r.col_019 end) as cargo_transp_dt_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_021 else r.col_020 end) as cargo_ampliac_at_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_022 else r.col_021 end) as cargo_ampliac_dt_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_023 else r.col_022 end) as potencia_maxima_mw,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_024 else r.col_023 end) as potencia_declarada_mw,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_025 else r.col_024 end) as potencia_phmd_mw,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_026 else r.col_025 end) as compra_ppad_mw,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_027 else r.col_026 end) as compra_potencia_ppad_mwhrp,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_028 else r.col_027 end) as potencia_contratada_mwhrp,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_029 else r.col_028 end) as potencia_mater_mw,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_030 else r.col_029 end) as potencia_pesos,
      public.parse_es_number(case when trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$' then r.col_031 else r.col_030 end) as cargo_comercializ_cc_pesos
    from public.raw_anexo_guma r
    where r.anio = _anio
      and r.mes = _mes
      and r.col_count in (30, 31)
      and public.nemo_from(r.col_001) is not null
      and (
        trim(coalesce(r.col_002, '')) ~ '^[A-Z0-9-]{8}$'
        or public.parse_es_number(r.col_002) is not null
      )
      and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'TOTAL', 'TOTALES')

    union all

    select
      r.id,
      r.anio,
      r.mes,
      public.nemo_from(r.col_001) as agente_nemo,
      public.nemo_from(r.col_002) as distribuidor_nemo,
      'html_legacy'::text as source_layout,
      public.parse_es_number(r.col_003) as demanda_real_total_mwh,
      null::numeric as demanda_real_pico_mwh,
      null::numeric as demanda_real_valle_mwh,
      null::numeric as demanda_real_resto_mwh,
      public.parse_es_number(r.col_004) as demanda_contratada_total_mwh,
      null::numeric as demanda_contratada_pico_mwh,
      null::numeric as demanda_contratada_valle_mwh,
      null::numeric as demanda_contratada_resto_mwh,
      null::numeric as compra_spot_pico_mwh,
      null::numeric as compra_spot_valle_mwh,
      public.parse_es_number(r.col_005) as compra_spot_resto_mwh,
      public.parse_es_number(r.col_006) as compra_spot_pesos,
      public.parse_es_number(r.col_008) as cargo_energia_adicional_pesos,
      null::numeric as cargo_servicios_pesos,
      null::numeric as recupero_costos_operat_pesos,
      null::numeric as cargo_serv_confiabilidad_pesos,
      public.parse_es_number(r.col_021) as cargo_transp_at_pesos,
      public.parse_es_number(r.col_022) as cargo_transp_dt_pesos,
      null::numeric as cargo_ampliac_at_pesos,
      null::numeric as cargo_ampliac_dt_pesos,
      public.parse_es_number(r.col_027) as potencia_maxima_mw,
      public.parse_es_number(r.col_026) as potencia_declarada_mw,
      null::numeric as potencia_phmd_mw,
      public.parse_es_number(r.col_031) as compra_ppad_mw,
      null::numeric as compra_potencia_ppad_mwhrp,
      null::numeric as potencia_contratada_mwhrp,
      null::numeric as potencia_mater_mw,
      null::numeric as potencia_pesos,
      null::numeric as cargo_comercializ_cc_pesos
    from public.raw_anexo_guma r
    where r.anio = _anio
      and r.mes = _mes
      and r.col_count in (51, 52)
      and public.nemo_from(r.col_001) is not null
      and public.nemo_from(r.col_002) is not null
      and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'TOTAL', 'TOTALES')
  ), ins as (
    insert into public.guma_detalle_mensual (
      anio, mes, agente_nemo, distribuidor_nemo,
      demanda_real_total_mwh, demanda_real_pico_mwh, demanda_real_valle_mwh, demanda_real_resto_mwh,
      demanda_contratada_total_mwh, demanda_contratada_pico_mwh, demanda_contratada_valle_mwh, demanda_contratada_resto_mwh,
      compra_spot_pico_mwh, compra_spot_valle_mwh, compra_spot_resto_mwh, compra_spot_pesos,
      cargo_energia_adicional_pesos, cargo_servicios_pesos, recupero_costos_operat_pesos,
      cargo_serv_confiabilidad_pesos, cargo_transp_at_pesos, cargo_transp_dt_pesos,
      cargo_ampliac_at_pesos, cargo_ampliac_dt_pesos,
      potencia_maxima_mw, potencia_declarada_mw, potencia_phmd_mw,
      compra_ppad_mw, compra_potencia_ppad_mwhrp, potencia_contratada_mwhrp,
      potencia_mater_mw, potencia_pesos, cargo_comercializ_cc_pesos,
      source_layout, source_table, source_id, parser_version
    )
    select
      anio, mes, agente_nemo, distribuidor_nemo,
      demanda_real_total_mwh, demanda_real_pico_mwh, demanda_real_valle_mwh, demanda_real_resto_mwh,
      demanda_contratada_total_mwh, demanda_contratada_pico_mwh, demanda_contratada_valle_mwh, demanda_contratada_resto_mwh,
      compra_spot_pico_mwh, compra_spot_valle_mwh, compra_spot_resto_mwh, compra_spot_pesos,
      cargo_energia_adicional_pesos, cargo_servicios_pesos, recupero_costos_operat_pesos,
      cargo_serv_confiabilidad_pesos, cargo_transp_at_pesos, cargo_transp_dt_pesos,
      cargo_ampliac_at_pesos, cargo_ampliac_dt_pesos,
      potencia_maxima_mw, potencia_declarada_mw, potencia_phmd_mw,
      compra_ppad_mw, compra_potencia_ppad_mwhrp, potencia_contratada_mwhrp,
      potencia_mater_mw, potencia_pesos, cargo_comercializ_cc_pesos,
      source_layout, 'raw_anexo_guma', id, v_parser_version
    from normalized
    where demanda_real_total_mwh is not null
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- T2.3 transporte_concepto_mensual
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.transporte_concepto_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  agente_nemo text not null,
  concepto_transporte text not null,
  pesos numeric null,
  demanda_mwh numeric null,
  pesos_por_mwh numeric null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists transporte_concepto_mensual_source_concepto_uidx
  on public.transporte_concepto_mensual(source_table, source_id, concepto_transporte);

create index if not exists transporte_concepto_mensual_agente_periodo_idx
  on public.transporte_concepto_mensual(agente_nemo, anio, mes);

alter table public.transporte_concepto_mensual enable row level security;

drop policy if exists transporte_concepto_mensual_select_authenticated on public.transporte_concepto_mensual;
create policy transporte_concepto_mensual_select_authenticated
  on public.transporte_concepto_mensual
  for select to authenticated
  using (true);

drop policy if exists transporte_concepto_mensual_admin_all on public.transporte_concepto_mensual;
create policy transporte_concepto_mensual_admin_all
  on public.transporte_concepto_mensual
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.refresh_transporte_concepto_mensual(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'transporte_concepto_mensual_v1';
  v_deleted int := 0;
  v_inserted int := 0;
begin
  delete from public.transporte_concepto_mensual
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with base as (
    select
      r.id,
      r.anio,
      r.mes,
      public.nemo_from(r.col_001) as agente_nemo,
      case when r.col_count = 10 then public.parse_es_number(r.col_003) else public.parse_es_number(r.col_002) end as perdida_de_transp,
      case when r.col_count = 10 then public.parse_es_number(r.col_004) else public.parse_es_number(r.col_003) end as uso_capacidad_transp,
      case when r.col_count = 10 then public.parse_es_number(r.col_005) else public.parse_es_number(r.col_004) end as energia_transportada,
      case when r.col_count = 10 then public.parse_es_number(r.col_006) else public.parse_es_number(r.col_005) end as adic_sist_transp,
      case when r.col_count = 10 then public.parse_es_number(r.col_007) else public.parse_es_number(r.col_006) end as reduc_tarifa_peaje,
      case when r.col_count = 10 then public.parse_es_number(r.col_008) else public.parse_es_number(r.col_007) end as cargo_total,
      case when r.col_count = 10 then public.parse_es_number(r.col_009) else public.parse_es_number(r.col_008) end as corresponde_local,
      case when r.col_count = 10 then public.parse_es_number(r.col_010) else public.parse_es_number(r.col_009) end as corresponde_otro
    from public.raw_atra r
    where r.anio = _anio
      and r.mes = _mes
      and r.col_count in (9, 10)
      and public.nemo_from(r.col_001) is not null
      and upper(trim(coalesce(r.col_001, ''))) not in ('PRESTADOR', 'USUARIO', '$MW', 'TOTALES', 'TOTAL')
      and coalesce(r.col_001, '') !~ '^-+$'
  ), long_rows as (
    select b.id, b.anio, b.mes, b.agente_nemo, v.concepto_transporte, v.pesos
    from base b
    cross join lateral (values
      ('perdida_de_transp', b.perdida_de_transp),
      ('uso_capacidad_transp', b.uso_capacidad_transp),
      ('energia_transportada', b.energia_transportada),
      ('adic_sist_transp', b.adic_sist_transp),
      ('reduc_tarifa_peaje', b.reduc_tarifa_peaje),
      ('cargo_total', b.cargo_total),
      ('corresponde_local', b.corresponde_local),
      ('corresponde_otro', b.corresponde_otro)
    ) as v(concepto_transporte, pesos)
    where v.pesos is not null
  ), ins as (
    insert into public.transporte_concepto_mensual (
      anio, mes, agente_nemo, concepto_transporte, pesos, demanda_mwh,
      pesos_por_mwh, source_table, source_id, parser_version
    )
    select
      anio, mes, agente_nemo, concepto_transporte, pesos, null::numeric,
      null::numeric, 'raw_atra', id, v_parser_version
    from long_rows
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- T2.6 cuenta_corriente_agente
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cuenta_corriente_agente (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  agente_nemo text not null,
  distribuidor_nemo text null,
  anio_semestre int not null,
  semestre int not null,
  mes_in_semestre int not null,
  anio_calendario int not null,
  mes_calendario int not null,
  v_fisico_mwh numeric null,
  v_monetario_pesos numeric null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists cuenta_corriente_agente_source_mes_uidx
  on public.cuenta_corriente_agente(source_table, source_id, mes_in_semestre);

create index if not exists cuenta_corriente_agente_agente_calendario_idx
  on public.cuenta_corriente_agente(agente_nemo, anio_calendario, mes_calendario);

alter table public.cuenta_corriente_agente enable row level security;

drop policy if exists cuenta_corriente_agente_select_authenticated on public.cuenta_corriente_agente;
create policy cuenta_corriente_agente_select_authenticated
  on public.cuenta_corriente_agente
  for select to authenticated
  using (true);

drop policy if exists cuenta_corriente_agente_admin_all on public.cuenta_corriente_agente;
create policy cuenta_corriente_agente_admin_all
  on public.cuenta_corriente_agente
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.refresh_cuenta_corriente_agente(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'cuenta_corriente_agente_v1';
  v_deleted int := 0;
  v_inserted int := 0;
begin
  delete from public.cuenta_corriente_agente
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with base as (
    select
      r.id,
      r.anio,
      r.mes,
      public.nemo_from(r.col_001) as agente_nemo,
      nullif(trim(substring(r.col_001 from 10 for 8)), '') as distribuidor_nemo,
      substring(trim(r.col_002) from 1 for 4)::int as anio_semestre,
      case
        when r.col_002 ilike '%Ene%' then 1
        when r.col_002 ilike '%Jul%' then 2
      end as semestre,
      case
        when r.col_002 ilike '%Ene%' then 1
        when r.col_002 ilike '%Jul%' then 7
      end as mes_inicio,
      r.col_003, r.col_004, r.col_005, r.col_006, r.col_007, r.col_008,
      r.col_009, r.col_010, r.col_011, r.col_012, r.col_013, r.col_014
    from public.raw_rscj r
    where r.anio = _anio
      and r.mes = _mes
      and r.col_count >= 14
      and public.nemo_from(r.col_001) is not null
      and substring(trim(r.col_002) from 1 for 4) ~ '^[0-9]{4}$'
      and (r.col_002 ilike '%Ene%' or r.col_002 ilike '%Jul%')
      and upper(trim(coalesce(r.col_001, ''))) not in ('AGENTE', 'TOTAL', 'TOTALES')
  ), month_rows as (
    select
      b.id,
      b.anio,
      b.mes,
      b.agente_nemo,
      b.distribuidor_nemo,
      b.anio_semestre,
      b.semestre,
      v.mes_in_semestre,
      b.anio_semestre as anio_calendario,
      (b.mes_inicio + v.mes_in_semestre - 1) as mes_calendario,
      public.parse_es_number(v.v_fisico) as v_fisico_mwh,
      public.parse_es_number(v.v_monetario) as v_monetario_pesos
    from base b
    cross join lateral (values
      (1, b.col_003, b.col_004),
      (2, b.col_005, b.col_006),
      (3, b.col_007, b.col_008),
      (4, b.col_009, b.col_010),
      (5, b.col_011, b.col_012),
      (6, b.col_013, b.col_014)
    ) as v(mes_in_semestre, v_fisico, v_monetario)
    where b.semestre is not null
  ), ins as (
    insert into public.cuenta_corriente_agente (
      anio, mes, agente_nemo, distribuidor_nemo,
      anio_semestre, semestre, mes_in_semestre, anio_calendario, mes_calendario,
      v_fisico_mwh, v_monetario_pesos, source_table, source_id, parser_version
    )
    select
      anio, mes, agente_nemo, distribuidor_nemo,
      anio_semestre, semestre, mes_in_semestre, anio_calendario, mes_calendario,
      v_fisico_mwh, v_monetario_pesos, 'raw_rscj', id, v_parser_version
    from month_rows
    where v_fisico_mwh is not null
       or v_monetario_pesos is not null
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;
