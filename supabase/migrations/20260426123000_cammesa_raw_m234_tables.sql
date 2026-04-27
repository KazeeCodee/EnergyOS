create table if not exists public.raw_atra (
  id bigint primary key,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  source_zip text not null,
  source_file text not null,
  source_row integer not null,
  section_index integer null,
  col_count integer not null,
  raw_text text null,
  col_001 text null,
  col_002 text null,
  col_003 text null,
  col_004 text null,
  col_005 text null,
  col_006 text null,
  col_007 text null,
  col_008 text null,
  col_009 text null,
  col_010 text null
);

comment on table public.raw_atra is 'Historico consolidado de ATRAYYMM.txt usado para costos y calidad de dato de EnergyOS.';

create index if not exists raw_atra_periodo_idx
  on public.raw_atra(anio, mes);

create index if not exists raw_atra_periodo_agente_idx
  on public.raw_atra(anio, mes, left(col_001, 8));

alter table public.raw_atra enable row level security;

drop policy if exists raw_atra_select_authenticated on public.raw_atra;
create policy raw_atra_select_authenticated
  on public.raw_atra
  for select
  to authenticated
  using (true);

drop policy if exists raw_atra_admin_all on public.raw_atra;
create policy raw_atra_admin_all
  on public.raw_atra
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.datos_mensuales
  add column if not exists dato_sospechoso boolean not null default false,
  add column if not exists sospechoso_motivo text null;
