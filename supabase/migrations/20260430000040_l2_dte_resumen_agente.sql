-- T2.5 - dte_resumen_agente
-- Origen: raw_dte (DTE mensual CAMMESA).
--
-- V1 deliberadamente conservadora: extrae filas de agente y las desnormaliza por
-- columna numerica, manteniendo section_id/section_label/subconcepto/ordinal para
-- trazabilidad. No intenta "sumar la factura" aca: los marts pueden agregar por
-- concepto y subconcepto con auditoria contra source_id/source_col_ordinal.

create table if not exists public.dte_resumen_agente (
  id bigserial primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  agente_nemo text not null,
  concepto text not null,
  subconcepto text null,
  section_id text not null,
  section_label text null,
  source_col_ordinal int not null,
  mwh numeric null,
  pesos numeric null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists dte_resumen_agente_source_uidx
  on public.dte_resumen_agente(source_table, source_id, source_col_ordinal);

create index if not exists dte_resumen_agente_agente_periodo_idx
  on public.dte_resumen_agente(agente_nemo, anio, mes);

create index if not exists dte_resumen_agente_concepto_periodo_idx
  on public.dte_resumen_agente(concepto, anio, mes);

create index if not exists dte_resumen_agente_section_periodo_idx
  on public.dte_resumen_agente(section_id, anio, mes);

alter table public.dte_resumen_agente enable row level security;

drop policy if exists dte_resumen_agente_select_authenticated on public.dte_resumen_agente;
create policy dte_resumen_agente_select_authenticated
  on public.dte_resumen_agente
  for select to authenticated
  using (true);

drop policy if exists dte_resumen_agente_admin_all on public.dte_resumen_agente;
create policy dte_resumen_agente_admin_all
  on public.dte_resumen_agente
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.dte_resumen_agente is
  'L2 - Resumen economico DTE en formato largo por agente, seccion y columna numerica.';

create or replace function public.refresh_dte_resumen_agente(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'dte_resumen_agente_v1';
  v_inserted int := 0;
  v_deleted int := 0;
begin
  delete from public.dte_resumen_agente
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with source_rows as (
    select r.id,
           r.source_row,
           r.col_count,
           r.col_001, r.col_002, r.col_003, r.col_004, r.col_005,
           r.col_006, r.col_007, r.col_008, r.col_009, r.col_010,
           r.col_011, r.col_012, r.col_013,
           r.raw_text,
           substring(trim(coalesce(r.col_001, '')) from '^([0-9]+(?:\.[0-9]+)*\.?)') as section_marker,
           case
             when upper(trim(coalesce(r.col_001, ''))) = 'AGENTE'
              and concat_ws(' ', r.col_002, r.col_003, r.col_004, r.col_005, r.col_006,
                                r.col_007, r.col_008, r.col_009, r.col_010, r.col_011,
                                r.col_012, r.col_013) ~* '(\$|MWh|MW)'
             then concat_ws('§',
                    coalesce(r.col_002, ''), coalesce(r.col_003, ''), coalesce(r.col_004, ''),
                    coalesce(r.col_005, ''), coalesce(r.col_006, ''), coalesce(r.col_007, ''),
                    coalesce(r.col_008, ''), coalesce(r.col_009, ''), coalesce(r.col_010, ''),
                    coalesce(r.col_011, ''), coalesce(r.col_012, ''), coalesce(r.col_013, '')
                  )
           end as unit_signature
      from public.raw_dte r
     where r.anio = _anio
       and r.mes = _mes
  ),
  marked as (
    select s.*,
           case
             when s.section_marker is not null then regexp_replace(s.section_marker, '\.$', '')
           end as section_id_marker,
           case
             when s.section_marker is not null then
               nullif(trim(
                 case
                   when regexp_replace(s.section_marker, '\.$', '') = trim(coalesce(s.col_001, ''))
                     then coalesce(s.col_002, '')
                   else regexp_replace(trim(coalesce(s.raw_text, '')), '^[0-9]+(?:\.[0-9]+)*\.?\s*', '')
                 end
               ), '')
           end as section_label_marker
      from source_rows s
  ),
  filled as (
    select m.*,
           array_remove(
             array_agg(m.section_id_marker) over (order by m.source_row rows between unbounded preceding and current row),
             null
           ) as section_accum,
           array_remove(
             array_agg(m.section_label_marker) over (order by m.source_row rows between unbounded preceding and current row),
             null
           ) as section_label_accum,
           array_remove(
             array_agg(m.unit_signature) over (order by m.source_row rows between unbounded preceding and current row),
             null
           ) as unit_accum
      from marked m
  ),
  sectioned as (
    select f.*,
           f.section_accum[array_length(f.section_accum, 1)] as section_id,
           f.section_label_accum[array_length(f.section_label_accum, 1)] as section_label,
           f.unit_accum[array_length(f.unit_accum, 1)] as unit_signature_current
      from filled f
  ),
  data_rows as (
    select s.*
      from sectioned s
     where s.section_id is not null
       and trim(coalesce(s.col_001, '')) ~ '^[A-Z0-9-]{8}$'
       and upper(trim(s.col_001)) not in ('AGENTE', 'TOTALES', 'TOTAL')
       and trim(coalesce(s.col_001, '')) !~ '^-+$'
  ),
  unpivoted as (
    select d.id as source_id,
           public.nemo_from(d.col_001) as agente_nemo,
           d.section_id,
           d.section_label,
           v.ord as source_col_ordinal,
           v.raw_val,
           public.parse_es_number(v.raw_val) as parsed_val,
           nullif(trim(split_part(coalesce(d.unit_signature_current, ''), '§', v.ord - 1)), '') as unit_label
      from data_rows d
      cross join lateral (values
        (2, d.col_002), (3, d.col_003), (4, d.col_004), (5, d.col_005),
        (6, d.col_006), (7, d.col_007), (8, d.col_008), (9, d.col_009),
        (10, d.col_010), (11, d.col_011), (12, d.col_012), (13, d.col_013)
      ) as v(ord, raw_val)
     where nullif(trim(coalesce(v.raw_val, '')), '') is not null
  ),
  classified as (
    select u.*,
           case
             when u.section_id like '4.8.4%' or u.section_id like '4.8.5%'
               or u.section_id like '4.6%' or u.section_id like '4.7%'
               or u.section_id like '3.3%' or u.section_id like '3.4%'
               or u.section_id like '2.2%' or u.section_id like '2.3%' then 'transp_dt'
             when u.section_id like '2.1%' then 'transp_at'
             when u.section_id like '4.8.3%' or u.section_id like '1.5%'
               or u.section_id like '3.5%' or u.section_id like '5.%' then 'cargo_servicios'
             when u.section_id like '4.1%' or u.section_id like '4.3%'
               or u.section_id like '4.4%' or u.section_id like '4.5%'
               or u.section_id like '4.8.6%' or u.section_id like '4.8.7%'
               or u.section_id like '4.10%' or u.section_id like '4.11%'
               or u.section_id like '4.12%' or u.section_id like '4.15%'
               or u.section_id like '4.17%' then 'spot_compra'
             when u.section_id like '4.2%' or u.section_id like '4.8%'
               or u.section_id like '4.9%' or u.section_id like '4.14%' then 'spot_venta'
             when u.section_id like '7.%' then 'mater_compra'
             when u.section_id like '8.%' then 'reliquidacion'
             when u.section_id like '13.%'
               or upper(coalesce(u.section_label, '')) like '%EXCEDENTE%'
               or upper(coalesce(u.section_label, '')) like '%1281%' then 'cargo_excedente'
             when u.section_id like '6.%' or u.section_id like '14.%'
               or upper(coalesce(u.section_label, '')) like '%FONINVEMEM%'
               or upper(coalesce(u.section_label, '')) like '%FIDEICOMISO%' then 'fondos'
             when upper(coalesce(u.section_label, '')) like '%INCUMPL%'
               or upper(coalesce(u.section_label, '')) like '%SANC%'
               or upper(coalesce(u.section_label, '')) like '%PENAL%' then 'sanciones'
             when upper(coalesce(u.section_label, '')) like '%COMERCIALIZ%' then 'cargo_comercializ'
             when upper(coalesce(u.section_label, '')) like '%SERV%' then 'cargo_servicios'
           end as concepto
      from unpivoted u
     where u.parsed_val is not null
       and u.parsed_val <> 0
       and u.agente_nemo is not null
  ),
  ins as (
    insert into public.dte_resumen_agente (
      anio, mes, agente_nemo, concepto, subconcepto, section_id, section_label,
      source_col_ordinal, mwh, pesos, source_table, source_id, parser_version
    )
    select _anio,
           _mes,
           c.agente_nemo,
           c.concepto,
           concat_ws(' | ', c.section_id, nullif(c.section_label, ''), 'col_' || lpad(c.source_col_ordinal::text, 3, '0'), nullif(c.unit_label, '')),
           c.section_id,
           c.section_label,
           c.source_col_ordinal,
           case when c.unit_label ~* 'MWh|MW' and c.unit_label !~* '^\s*\$\s*$' then c.parsed_val end,
           case when c.unit_label ~* '\$' or c.unit_label is null then c.parsed_val end,
           'raw_dte',
           c.source_id,
           v_parser_version
      from classified c
     where c.concepto is not null
       and (c.unit_label is null or c.unit_label ~* '(\$|MWh|MW)')
    on conflict (source_table, source_id, source_col_ordinal) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;

comment on function public.refresh_dte_resumen_agente(int,int) is
  'Repuebla dte_resumen_agente para (anio, mes) desde raw_dte. V1: extraccion larga por columna numerica y seccion DTE.';
