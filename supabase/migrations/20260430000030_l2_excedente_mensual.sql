-- T2.4 — excedente_mensual
-- Origen: raw_dexc, sub-anexo A11.1 (Demanda Base vs Real por GUMA / GUME / GUDI).
-- Layout posicional: col_count=19 → 1 nemo+distribuidor + 18 valores (9 base + 9 real).
-- Sub-secciones detectadas por header con palabra clave (Distrib/PAFTT/Ag.GUDI) y propagadas
-- con state machine via window function.
--
-- Cargos A11.2 (pesos del DEx) NO entran en este parser; se sirven via dte_resumen_agente (T2.5)
-- para evitar duplicar pesos en marts.

create table if not exists public.excedente_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  agente_nemo text not null,
  distribuidor_nemo text null,
  tipo_agente text not null check (tipo_agente in ('GUMA','GUME','GUDI')),

  -- Demanda Base (9 = 3 días × 3 bandas)
  dem_base_hab_valle_mwh numeric null,
  dem_base_hab_diurna_mwh numeric null,
  dem_base_hab_pico_mwh numeric null,
  dem_base_sab_valle_mwh numeric null,
  dem_base_sab_diurna_mwh numeric null,
  dem_base_sab_pico_mwh numeric null,
  dem_base_dom_valle_mwh numeric null,
  dem_base_dom_diurna_mwh numeric null,
  dem_base_dom_pico_mwh numeric null,
  dem_base_total_mwh numeric null,

  -- Demanda Real (idem)
  dem_real_hab_valle_mwh numeric null,
  dem_real_hab_diurna_mwh numeric null,
  dem_real_hab_pico_mwh numeric null,
  dem_real_sab_valle_mwh numeric null,
  dem_real_sab_diurna_mwh numeric null,
  dem_real_sab_pico_mwh numeric null,
  dem_real_dom_valle_mwh numeric null,
  dem_real_dom_diurna_mwh numeric null,
  dem_real_dom_pico_mwh numeric null,
  dem_real_total_mwh numeric null,

  -- Excedente computado (real - base, floor 0)
  dem_excedente_total_mwh numeric generated always as (
    greatest(0, coalesce(dem_real_total_mwh, 0) - coalesce(dem_base_total_mwh, 0))
  ) stored,

  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index if not exists excedente_mensual_source_uidx
  on public.excedente_mensual(source_table, source_id);

create index if not exists excedente_mensual_agente_periodo_idx
  on public.excedente_mensual(agente_nemo, anio, mes);

create index if not exists excedente_mensual_tipo_periodo_idx
  on public.excedente_mensual(tipo_agente, anio, mes);

alter table public.excedente_mensual enable row level security;

drop policy if exists excedente_mensual_select_authenticated on public.excedente_mensual;
create policy excedente_mensual_select_authenticated
  on public.excedente_mensual
  for select to authenticated
  using (true);

drop policy if exists excedente_mensual_admin_all on public.excedente_mensual;
create policy excedente_mensual_admin_all
  on public.excedente_mensual
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.excedente_mensual is
  'L2 — Demanda Base vs Real por agente (A11.1 Res. SE 1281/06). Excedente computado.';

create or replace function public.refresh_excedente_mensual(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'excedente_mensual_v1';
  v_inserted int := 0;
  v_deleted  int := 0;
begin
  delete from public.excedente_mensual
   where anio = _anio and mes = _mes;
  get diagnostics v_deleted = row_count;

  with sections as (
    select r.id,
           r.source_row,
           r.col_count,
           r.col_001, r.col_002, r.col_003, r.col_004, r.col_005,
           r.col_006, r.col_007, r.col_008, r.col_009, r.col_010,
           r.col_011, r.col_012, r.col_013, r.col_014, r.col_015,
           r.col_016, r.col_017, r.col_018, r.col_019,
           r.raw_text,
           case
             when r.raw_text ~* 'Agente\s+Distrib\s+Hs\.Valle'  then 'GUMA'
             when r.raw_text ~* 'Agente\s+PAFTT\s+Hs\.Valle'    then 'GUME'
             when r.raw_text ~* 'Agente\s+Ag\.GUDI\s+Hs\.Valle' then 'GUDI'
           end as marker
      from public.raw_dexc r
     where r.anio = _anio and r.mes = _mes
  ),
  filled as (
    -- Propaga el último marker no-nulo hacia abajo (state machine).
    select s.*,
           ( array_remove(
               array_agg(marker) over (order by source_row rows between unbounded preceding and current row),
               null
             )
           ) as accum
      from sections s
  ),
  sectioned as (
    select f.*,
           coalesce(f.accum[array_length(f.accum, 1)], 'NONE') as tipo_agente_seccion
      from filled f
  ),
  base as (
    select s.id as source_id,
           s.tipo_agente_seccion as tipo_agente,
           public.nemo_from(s.col_001) as agente_nemo,
           nullif(trim(substring(s.col_001 from 10 for 8)), '') as distribuidor_nemo,
           public.parse_es_number(s.col_002) as dem_base_hab_valle_mwh,
           public.parse_es_number(s.col_003) as dem_base_hab_diurna_mwh,
           public.parse_es_number(s.col_004) as dem_base_hab_pico_mwh,
           public.parse_es_number(s.col_005) as dem_base_sab_valle_mwh,
           public.parse_es_number(s.col_006) as dem_base_sab_diurna_mwh,
           public.parse_es_number(s.col_007) as dem_base_sab_pico_mwh,
           public.parse_es_number(s.col_008) as dem_base_dom_valle_mwh,
           public.parse_es_number(s.col_009) as dem_base_dom_diurna_mwh,
           public.parse_es_number(s.col_010) as dem_base_dom_pico_mwh,
           public.parse_es_number(s.col_011) as dem_real_hab_valle_mwh,
           public.parse_es_number(s.col_012) as dem_real_hab_diurna_mwh,
           public.parse_es_number(s.col_013) as dem_real_hab_pico_mwh,
           public.parse_es_number(s.col_014) as dem_real_sab_valle_mwh,
           public.parse_es_number(s.col_015) as dem_real_sab_diurna_mwh,
           public.parse_es_number(s.col_016) as dem_real_sab_pico_mwh,
           public.parse_es_number(s.col_017) as dem_real_dom_valle_mwh,
           public.parse_es_number(s.col_018) as dem_real_dom_diurna_mwh,
           public.parse_es_number(s.col_019) as dem_real_dom_pico_mwh
      from sectioned s
     where s.col_count = 19
       and s.tipo_agente_seccion in ('GUMA','GUME','GUDI')
       and trim(coalesce(s.col_001, '')) ~ '^[A-Z0-9-]{8}'  -- al menos 8 chars NEMO al inicio
       and public.nemo_from(s.col_001) is not null
       and upper(public.nemo_from(s.col_001)) not in ('AGENTE','TOTAL','TOTALES','MWH','PESOS')
  ),
  totales as (
    select b.*,
           coalesce(dem_base_hab_valle_mwh, 0) +
           coalesce(dem_base_hab_diurna_mwh, 0) +
           coalesce(dem_base_hab_pico_mwh, 0) +
           coalesce(dem_base_sab_valle_mwh, 0) +
           coalesce(dem_base_sab_diurna_mwh, 0) +
           coalesce(dem_base_sab_pico_mwh, 0) +
           coalesce(dem_base_dom_valle_mwh, 0) +
           coalesce(dem_base_dom_diurna_mwh, 0) +
           coalesce(dem_base_dom_pico_mwh, 0) as dem_base_total_mwh,
           coalesce(dem_real_hab_valle_mwh, 0) +
           coalesce(dem_real_hab_diurna_mwh, 0) +
           coalesce(dem_real_hab_pico_mwh, 0) +
           coalesce(dem_real_sab_valle_mwh, 0) +
           coalesce(dem_real_sab_diurna_mwh, 0) +
           coalesce(dem_real_sab_pico_mwh, 0) +
           coalesce(dem_real_dom_valle_mwh, 0) +
           coalesce(dem_real_dom_diurna_mwh, 0) +
           coalesce(dem_real_dom_pico_mwh, 0) as dem_real_total_mwh
      from base b
  ),
  ins as (
    insert into public.excedente_mensual (
      anio, mes, agente_nemo, distribuidor_nemo, tipo_agente,
      dem_base_hab_valle_mwh, dem_base_hab_diurna_mwh, dem_base_hab_pico_mwh,
      dem_base_sab_valle_mwh, dem_base_sab_diurna_mwh, dem_base_sab_pico_mwh,
      dem_base_dom_valle_mwh, dem_base_dom_diurna_mwh, dem_base_dom_pico_mwh,
      dem_base_total_mwh,
      dem_real_hab_valle_mwh, dem_real_hab_diurna_mwh, dem_real_hab_pico_mwh,
      dem_real_sab_valle_mwh, dem_real_sab_diurna_mwh, dem_real_sab_pico_mwh,
      dem_real_dom_valle_mwh, dem_real_dom_diurna_mwh, dem_real_dom_pico_mwh,
      dem_real_total_mwh,
      source_table, source_id, parser_version
    )
    select _anio, _mes,
           t.agente_nemo,
           case when t.distribuidor_nemo ~ '^[A-Z0-9-]{1,8}$' then t.distribuidor_nemo end,
           t.tipo_agente,
           t.dem_base_hab_valle_mwh, t.dem_base_hab_diurna_mwh, t.dem_base_hab_pico_mwh,
           t.dem_base_sab_valle_mwh, t.dem_base_sab_diurna_mwh, t.dem_base_sab_pico_mwh,
           t.dem_base_dom_valle_mwh, t.dem_base_dom_diurna_mwh, t.dem_base_dom_pico_mwh,
           t.dem_base_total_mwh,
           t.dem_real_hab_valle_mwh, t.dem_real_hab_diurna_mwh, t.dem_real_hab_pico_mwh,
           t.dem_real_sab_valle_mwh, t.dem_real_sab_diurna_mwh, t.dem_real_sab_pico_mwh,
           t.dem_real_dom_valle_mwh, t.dem_real_dom_diurna_mwh, t.dem_real_dom_pico_mwh,
           t.dem_real_total_mwh,
           'raw_dexc', t.source_id, v_parser_version
      from totales t
     -- Filtrar filas vacías o agregadas tipo TOTAL
     where (t.dem_base_total_mwh > 0 or t.dem_real_total_mwh > 0)
    on conflict (source_table, source_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;

comment on function public.refresh_excedente_mensual(int,int) is
  'Repuebla excedente_mensual para (anio, mes) desde raw_dexc A11.1 (3 sub-secciones GUMA/GUME/GUDI).';
