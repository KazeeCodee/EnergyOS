-- T2.X.v2 — Reescribe refresh_cammesa_parametros_mensuales para extraer:
-- 1) layout NUEVO (2025-11+): precios spot, energ adic, servicios — por banda en filas 9/10/11.
-- 2) layout VIEJO (2021-01 → 2025-10): SOBRECOSTOS (combustible, transitorio, compra conjunta,
--    FONINVEMEM, importación Brasil, contratos MEM, impacto compra conjunta).
-- Ambos layouts coexisten parcialmente. La extracción es por etiqueta, no por posición,
-- para tolerar el reordenamiento de campos entre años.

create or replace function public.refresh_cammesa_parametros_mensuales(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'cammesa_parametros_mensuales_v2';
  v_inserted int := 0;
  v_deleted  int := 0;
begin
  delete from public.cammesa_parametros_mensuales
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with
  -- Filas preámbulo de AGUM (rows 9, 10, 11 son las que traen parámetros).
  agum_pre as (
    select r.id, r.raw_text
      from public.raw_agum r
     where r.anio = _anio and r.mes = _mes
       and r.source_row in (9, 10, 11)
       and r.raw_text is not null
  ),
  agum_concat as (
    select string_agg(raw_text, ' | ' order by id) as txt,
           min(id) as source_id
      from agum_pre
  ),
  -- Filas preámbulo de ATRA (rows 10, 11 con precios de transporte AT).
  atra_pre as (
    select r.id, r.source_row, r.raw_text
      from public.raw_atra r
     where r.anio = _anio and r.mes = _mes
       and r.source_row in (10, 11)
       and r.raw_text is not null
       and r.raw_text ~* '\(\$/MWh\)'
  ),
  -- Filas preámbulo de ADCO (rows 9, 10, 11).
  adco_pre as (
    select r.id, r.raw_text
      from public.raw_adco r
     where r.anio = _anio and r.mes = _mes
       and r.source_row in (9, 10, 11)
       and r.raw_text is not null
  ),
  adco_concat as (
    select string_agg(raw_text, ' | ' order by id) as txt,
           min(id) as source_id
      from adco_pre
  ),
  -- Filas preámbulo de DEXC (rows 9, 10, 11 con 3 valores cada una).
  dexc_pre as (
    select r.id, r.source_row, r.raw_text,
           lower(substring(r.raw_text from 'Dias\s+(\w+)')) as dia_tipo
      from public.raw_dexc r
     where r.anio = _anio and r.mes = _mes
       and r.source_row in (9, 10, 11)
       and r.raw_text is not null
       and r.raw_text ilike 'Prec.Dem.Exc%'
  ),

  -- ─────────────────────────────────────────────────────────────
  -- AGUM — layout viejo (sobrecostos por etiqueta, regex independientes)
  -- ─────────────────────────────────────────────────────────────
  agum_old_rows as (
    select 'sobrecosto_transitorio_despacho_pesos_mwh' as parametro,
           public.parse_es_number(
             (regexp_match(txt, 'Sobrecosto Transitorio de Despacho\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ) as valor,
           '$/MWh' as unidad,
           source_id
      from agum_concat
    union all
    select 'adic_sobrecosto_transitorio_despacho_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Adic\.Sobrec\.Transitorio Despacho\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'sobrecosto_compra_conjunta_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Sobrecosto Compra Conjunta\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'impacto_compra_conjunta_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Impacto Compra Conjunta\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'sobrecostos_combustible_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Sobrecostos Combustible\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'sobrecosto_importacion_brasil_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Sobrecosto Importaci[oó]n Brasil\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'sobrecosto_contratos_mem_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Sobrecosto Contratos MEM\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
    union all
    select 'cargo_foninvemem_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Cargo Transitorio FONINVEMEM[^:]*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from agum_concat
  ),

  -- ─────────────────────────────────────────────────────────────
  -- AGUM — layout nuevo (2025-11+)
  -- Filas 9/10/11 con "Pico/Valle/Resto ($/MWh): <SPOT>   ...   Pico/Valle/Resto ($/MWh): <ADIC>   ...   <SERVICIO>: <V>"
  -- ─────────────────────────────────────────────────────────────
  agum_new as (
    select r.id, r.source_row, r.raw_text,
           regexp_matches(
             r.raw_text,
             '^(Pico|Valle|Resto)\s*\(\$/MWh\)\s*:\s*([0-9][0-9 .,]*?)\s{2,}(?:Pico|Valle|Resto)\s*\(\$/MWh\)\s*:\s*([0-9][0-9 .,]*?)\s{2,}.*?\(\$/MWh\)\s*[:)]?\s*:?\s*([0-9][0-9 .,]*)\s*$',
             ''
           ) as g
      from public.raw_agum r
     where r.anio = _anio and r.mes = _mes
       and r.source_row in (9, 10, 11)
       and r.raw_text is not null
       and r.raw_text ~ '^(Pico|Valle|Resto)\s*\(\$/MWh\)'
  ),
  agum_new_rows as (
    select 'precio_spot_' || lower(g[1]) || '_pesos_mwh' as parametro,
           public.parse_es_number(g[2]) as valor, '$/MWh'::text as unidad, id as source_id
      from agum_new
    union all
    select 'precio_energia_adic_' || lower(g[1]) || '_pesos_mwh',
           public.parse_es_number(g[3]), '$/MWh', id
      from agum_new
    union all
    select case lower(g[1])
             when 'pico'  then 'precio_servicios_pesos_mwh'
             when 'valle' then 'precio_recupero_costos_op_pesos_mwh'
             when 'resto' then 'precio_serv_confiabilidad_pesos_mwh'
           end,
           public.parse_es_number(g[4]),
           '$/MWh', id
      from agum_new
  ),

  -- ─────────────────────────────────────────────────────────────
  -- ATRA — precios transporte AT
  -- ─────────────────────────────────────────────────────────────
  atra_rows as (
    select case
             when raw_text ~* 'Transporte en Alta Tensi'        then 'precio_transp_at_pesos_mwh'
             when raw_text ~* 'Ampliaciones en Alta Tensi'      then 'precio_ampliaciones_at_pesos_mwh'
           end as parametro,
           public.parse_es_number(
             (regexp_match(raw_text, ':\s*(-?[0-9][0-9 .,]*)\s*$'))[1]
           ) as valor,
           '$/MWh' as unidad,
           id as source_id
      from atra_pre
  ),

  -- ─────────────────────────────────────────────────────────────
  -- ADCO — cargos comerc + cotización dólar + pcts
  -- ─────────────────────────────────────────────────────────────
  adco_rows as (
    select 'cargo_max_comercializ_pesos_mwh' as parametro,
           public.parse_es_number(
             (regexp_match(txt, 'Cargo Maximo Comercializacion\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ) as valor,
           '$/MWh' as unidad, source_id
      from adco_concat
    union all
    select 'cargo_administracion_pesos_mwh',
           public.parse_es_number(
             (regexp_match(txt, 'Cargo por Administracion\s*\(\$/MWh\)\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/MWh', source_id
      from adco_concat
    union all
    select 'cotizacion_dolar_mayorista_bcra',
           public.parse_es_number(
             (regexp_match(txt, 'Cotizacion Dolar Mayorista BCRA\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '$/USD', source_id
      from adco_concat
    union all
    select 'pct_obligatorio_ley_27191',
           public.parse_es_number(
             (regexp_match(txt, 'Porcentaje Obligatorio Ley 27191[^:]*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '%', source_id
      from adco_concat
    union all
    select 'pct_energia_renovable_compras_conjuntas',
           public.parse_es_number(
             (regexp_match(txt, 'Porcentaje Energia Renovable Abastecida[^:]*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '%', source_id
      from adco_concat
    union all
    select 'pct_aplicacion_ley_27191',
           public.parse_es_number(
             (regexp_match(txt, 'Porcentaje de Aplicacion[^:]*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ),
           '%', source_id
      from adco_concat
  ),

  -- ─────────────────────────────────────────────────────────────
  -- DEXC — precios DEx por día/banda
  -- ─────────────────────────────────────────────────────────────
  dexc_extract as (
    select id, dia_tipo,
           regexp_matches(
             raw_text,
             ':\s*(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)',
             ''
           ) as g
      from dexc_pre
  ),
  dexc_rows as (
    select 'precio_dex_' || dia_tipo || '_valle_pesos_mwh' as parametro,
           public.parse_es_number(g[1]) as valor, '$/MWh'::text as unidad, id as source_id
      from dexc_extract
    union all
    select 'precio_dex_' || dia_tipo || '_diurna_pesos_mwh',
           public.parse_es_number(g[2]), '$/MWh', id
      from dexc_extract
    union all
    select 'precio_dex_' || dia_tipo || '_pico_pesos_mwh',
           public.parse_es_number(g[3]), '$/MWh', id
      from dexc_extract
  ),

  -- ─────────────────────────────────────────────────────────────
  -- Insertar todo
  -- ─────────────────────────────────────────────────────────────
  ins as (
    insert into public.cammesa_parametros_mensuales (
      anio, mes, parametro, valor, unidad, source_table, source_id, parser_version
    )
    select _anio, _mes, p.parametro, p.valor, p.unidad, p.source_table, p.source_id, v_parser_version
      from (
        select parametro, valor, unidad, 'raw_agum'::text as source_table, source_id from agum_old_rows
        union all
        select parametro, valor, unidad, 'raw_agum',                       source_id from agum_new_rows
        union all
        select parametro, valor, unidad, 'raw_atra',                       source_id from atra_rows
        union all
        select parametro, valor, unidad, 'raw_adco',                       source_id from adco_rows
        union all
        select parametro, valor, unidad, 'raw_dexc',                       source_id from dexc_rows
      ) p
     where p.parametro is not null
       and p.valor is not null
    on conflict (anio, mes, parametro) do update
      set valor = excluded.valor,
          unidad = excluded.unidad,
          source_table = excluded.source_table,
          source_id = excluded.source_id,
          parser_version = excluded.parser_version,
          procesado_en = now()
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;
