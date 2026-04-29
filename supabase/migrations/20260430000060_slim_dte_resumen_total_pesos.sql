-- T2.5 v3 - version liviana para el limite de storage del proyecto Supabase.
--
-- La v2 extraia una fila por cada columna numerica del DTE. Eso era muy trazable,
-- pero demasiado grande para el proyecto remoto actual. Esta v3 conserva una fila
-- por agente/seccion tomando el ultimo monto en pesos de la fila, que en los
-- layouts DTE suele corresponder al total/factura de la seccion.

truncate table public.dte_resumen_agente;

create or replace function public.refresh_dte_resumen_agente(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'dte_resumen_agente_v3_total_pesos';
  v_inserted int := 0;
  v_deleted int := 0;
begin
  delete from public.dte_resumen_agente
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with source_rows as (
    select r.id,
           r.source_row,
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
           case when s.section_marker is not null
             then regexp_replace(s.section_marker, '\.$', '')
           end as section_id_marker,
           case when s.section_marker is not null then
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
  numbered as (
    select m.*,
           count(m.section_id_marker) filter (where m.section_id_marker is not null)
             over (order by m.source_row rows between unbounded preceding and current row) as section_seq,
           count(m.unit_signature) filter (where m.unit_signature is not null)
             over (order by m.source_row rows between unbounded preceding and current row) as unit_seq
      from marked m
  ),
  sectioned as (
    select n.*,
           max(n.section_id_marker) over (partition by n.section_seq) as section_id,
           max(n.section_label_marker) over (partition by n.section_seq) as section_label,
           max(n.unit_signature) over (partition by n.unit_seq) as unit_signature_current
      from numbered n
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
               or u.section_id like '4.16%' or u.section_id like '4.17%' then 'spot_compra'
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
       and u.unit_label ~* '\$'
  ),
  principal as (
    select c.*,
           row_number() over (
             partition by c.source_id
             order by c.source_col_ordinal desc
           ) as rn
      from classified c
     where c.concepto is not null
  ),
  ins as (
    insert into public.dte_resumen_agente (
      anio, mes, agente_nemo, concepto, subconcepto, section_id, section_label,
      source_col_ordinal, mwh, pesos, source_table, source_id, parser_version
    )
    select _anio,
           _mes,
           p.agente_nemo,
           p.concepto,
           concat_ws(' | ', p.section_id, nullif(p.section_label, ''), 'total_pesos_col_' || lpad(p.source_col_ordinal::text, 3, '0')),
           p.section_id,
           p.section_label,
           p.source_col_ordinal,
           null::numeric,
           p.parsed_val,
           'raw_dte',
           p.source_id,
           v_parser_version
      from principal p
     where p.rn = 1
    on conflict (source_table, source_id, source_col_ordinal) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;
