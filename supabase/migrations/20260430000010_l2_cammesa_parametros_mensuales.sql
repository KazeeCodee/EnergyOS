-- T2.X — cammesa_parametros_mensuales
-- Long-format de los parámetros de mercado del mes (precios spot por banda,
-- precios energía adicional, servicios, transporte AT, cargos comerc, % Ley 27191,
-- precios DEx por día/banda, cotización dólar BCRA).
-- Origen: filas preámbulo de AGUM/ATRA/ADCO/DEXC.

create table if not exists public.cammesa_parametros_mensuales (
  id bigserial primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  parametro text not null,
  valor numeric null,
  unidad text null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists cammesa_parametros_mensuales_periodo_param_uidx
  on public.cammesa_parametros_mensuales(anio, mes, parametro);

create index if not exists cammesa_parametros_mensuales_param_periodo_idx
  on public.cammesa_parametros_mensuales(parametro, anio, mes);

alter table public.cammesa_parametros_mensuales enable row level security;

drop policy if exists cammesa_parametros_mensuales_select_authenticated
  on public.cammesa_parametros_mensuales;
create policy cammesa_parametros_mensuales_select_authenticated
  on public.cammesa_parametros_mensuales
  for select to authenticated
  using (true);

drop policy if exists cammesa_parametros_mensuales_admin_all
  on public.cammesa_parametros_mensuales;
create policy cammesa_parametros_mensuales_admin_all
  on public.cammesa_parametros_mensuales
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.cammesa_parametros_mensuales is
  'L2 — Parametros de mercado mensuales extraidos de los preambulos de AGUM/ATRA/ADCO/DEXC.';

create or replace function public.refresh_cammesa_parametros_mensuales(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'cammesa_parametros_mensuales_v1';
  v_inserted int := 0;
  v_deleted  int := 0;
begin
  delete from public.cammesa_parametros_mensuales
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with
  -- ───────────────────────── AGUM ─────────────────────────
  -- Row 9: 'Pico  ($/MWh):  <SPOT>   ...   Pico  ($/MWh):  <ADIC>   ...   Precio Servicios ($/MWh)  : <SRV>'
  -- Row 10: 'Valle ($/MWh):  <SPOT>   ...   Valle ($/MWh):  <ADIC>   ...   Precio Recupero de Costos Operativos ($/MWh): <RCO>'
  -- Row 11: 'Resto ($/MWh):  <SPOT>   ...   Resto ($/MWh):  <ADIC>   ...   Precio Servicio Confiabilidad ($/MWh)       : <SRC>'
  agum as (
    select
      r.id,
      r.raw_text,
      regexp_matches(
        r.raw_text,
        '(Pico|Valle|Resto)\s*\(\$/MWh\)\s*:\s*([0-9][0-9 .,]*?)\s{2,}(?:Pico|Valle|Resto)\s*\(\$/MWh\)\s*:\s*([0-9][0-9 .,]*?)\s{2,}.*?\(\$/MWh\)\s*[:)]?\s*:?\s*([0-9][0-9 .,]*)\s*$',
        ''
      ) as g
    from public.raw_agum r
    where r.anio = _anio
      and r.mes  = _mes
      and r.source_row in (9, 10, 11)
      and r.raw_text is not null
  ),
  agum_unpivot as (
    select id,
           lower(g[1]) as banda,
           public.parse_es_number(g[2]) as v_spot,
           public.parse_es_number(g[3]) as v_adic,
           public.parse_es_number(g[4]) as v_serv
      from agum
  ),
  agum_rows as (
    -- Spot
    select id, ('precio_spot_'  || banda || '_pesos_mwh') as parametro, v_spot as valor, '$/MWh'::text as unidad
      from agum_unpivot
    union all
    -- Energía adicional
    select id, ('precio_energia_adic_' || banda || '_pesos_mwh'), v_adic, '$/MWh'
      from agum_unpivot
    union all
    -- Servicios / Recupero / Confiabilidad (uno distinto por fila)
    select id,
           case banda
             when 'pico'  then 'precio_servicios_pesos_mwh'
             when 'valle' then 'precio_recupero_costos_op_pesos_mwh'
             when 'resto' then 'precio_serv_confiabilidad_pesos_mwh'
           end,
           v_serv,
           '$/MWh'
      from agum_unpivot
  ),

  -- ───────────────────────── ATRA ─────────────────────────
  -- Row 10: 'Precio Mensual de Transporte en Alta Tension ($/MWh)    :   5038,65'
  -- Row 11: 'Precio Mensual de Ampliaciones en Alta Tension ($/MWh)  :     31,03'
  atra as (
    select
      r.id,
      r.source_row,
      regexp_matches(
        r.raw_text,
        ':\s*([0-9][0-9 .,]*)\s*$',
        ''
      ) as g
    from public.raw_atra r
    where r.anio = _anio and r.mes = _mes
      and r.source_row in (10, 11)
      and r.raw_text is not null
      and r.raw_text ~* '\(\$/MWh\)'
  ),
  atra_rows as (
    select id,
           case source_row
             when 10 then 'precio_transp_at_pesos_mwh'
             when 11 then 'precio_ampliaciones_at_pesos_mwh'
           end as parametro,
           public.parse_es_number(g[1]) as valor,
           '$/MWh'::text as unidad
      from atra
  ),

  -- ───────────────────────── ADCO ─────────────────────────
  -- Row 9 : 'Cargo Maximo Comercializacion ($/MWh) : <V1>   ...   Porcentaje Obligatorio Ley 27191 (%) : <V2>'
  -- Row 10: 'Cargo por Administracion ($/MWh)      : <V1>   ...   Porcentaje Energia Renovable ... (%): <V2>'
  -- Row 11: 'Cotizacion Dolar Mayorista BCRA       : <V1>   ...   Porcentaje de Aplicacion (%)        : <V2>'
  adco as (
    select
      r.id,
      r.source_row,
      regexp_matches(
        r.raw_text,
        ':\s*([0-9][0-9 .,]*)\s{2,}.*?:\s*([0-9][0-9 .,]*)',
        ''
      ) as g
    from public.raw_adco r
    where r.anio = _anio and r.mes = _mes
      and r.source_row in (9, 10, 11)
      and r.raw_text is not null
  ),
  adco_rows as (
    select id,
           case source_row
             when 9  then 'cargo_max_comercializ_pesos_mwh'
             when 10 then 'cargo_administracion_pesos_mwh'
             when 11 then 'cotizacion_dolar_mayorista_bcra'
           end as parametro,
           public.parse_es_number(g[1]) as valor,
           case source_row
             when 9 then '$/MWh'
             when 10 then '$/MWh'
             when 11 then '$/USD'
           end as unidad
      from adco
    union all
    select id,
           case source_row
             when 9  then 'pct_obligatorio_ley_27191'
             when 10 then 'pct_energia_renovable_compras_conjuntas'
             when 11 then 'pct_aplicacion_ley_27191'
           end,
           public.parse_es_number(g[2]),
           '%'
      from adco
  ),

  -- ───────────────────────── DEXC ─────────────────────────
  -- Row 9 : 'Prec.Dem.Exc.Dias Hab.Hs.Valle,Diurnas,Pico:  <V> <D> <P>'
  -- Row 10: 'Prec.Dem.Exc.Dias Sab.Hs.Valle,Diurnas,Pico:  <V> <D> <P>'
  -- Row 11: 'Prec.Dem.Exc.Dias Dom.Hs.Valle,Diurnas,Pico:  <V> <D> <P>'
  dexc as (
    select
      r.id,
      lower(substring(r.raw_text from 'Dias\s+(\w+)')) as dia_tipo,
      regexp_matches(
        r.raw_text,
        ':\s*([0-9][0-9 .,]*)\s+([0-9][0-9 .,]*)\s+([0-9][0-9 .,]*)',
        ''
      ) as g
    from public.raw_dexc r
    where r.anio = _anio and r.mes = _mes
      and r.source_row in (9, 10, 11)
      and r.raw_text is not null
      and r.raw_text ilike 'Prec.Dem.Exc%'
  ),
  dexc_rows as (
    select id, ('precio_dex_' || dia_tipo || '_valle_pesos_mwh')   as parametro, public.parse_es_number(g[1]) as valor, '$/MWh'::text as unidad from dexc
    union all
    select id, ('precio_dex_' || dia_tipo || '_diurna_pesos_mwh'),                public.parse_es_number(g[2]),         '$/MWh'                from dexc
    union all
    select id, ('precio_dex_' || dia_tipo || '_pico_pesos_mwh'),                  public.parse_es_number(g[3]),         '$/MWh'                from dexc
  ),

  -- ───────────────────────── INSERT ─────────────────────────
  ins as (
    insert into public.cammesa_parametros_mensuales (
      anio, mes, parametro, valor, unidad, source_table, source_id, parser_version
    )
    select _anio, _mes, p.parametro, p.valor, p.unidad, p.source_table, p.source_id, v_parser_version
    from (
      select parametro, valor, unidad, 'raw_agum' as source_table, id as source_id from agum_rows
      union all
      select parametro, valor, unidad, 'raw_atra',                 id                 from atra_rows
      union all
      select parametro, valor, unidad, 'raw_adco',                 id                 from adco_rows
      union all
      select parametro, valor, unidad, 'raw_dexc',                 id                 from dexc_rows
    ) p
    where p.parametro is not null
    -- en caso de duplicados (varias filas de un mismo source con el mismo parámetro), tomar la primera
    on conflict (anio, mes, parametro) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;

comment on function public.refresh_cammesa_parametros_mensuales(int,int) is
  'Repuebla cammesa_parametros_mensuales para (anio, mes) desde preambulos AGUM/ATRA/ADCO/DEXC.';
