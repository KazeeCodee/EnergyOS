create table if not exists public.raw_amat (
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
  col_010 text null,
  col_011 text null,
  col_012 text null,
  col_013 text null,
  col_014 text null,
  col_015 text null,
  col_016 text null
);

create table if not exists public.raw_agum (
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
  col_010 text null,
  col_011 text null,
  col_012 text null,
  col_013 text null,
  col_014 text null,
  col_015 text null,
  col_016 text null,
  col_017 text null,
  col_018 text null,
  col_019 text null,
  col_020 text null,
  col_021 text null,
  col_022 text null,
  col_023 text null,
  col_024 text null
);

comment on table public.raw_amat is 'Historico consolidado de AMATYYMM.txt usado para el modulo 1 de EnergyOS.';
comment on table public.raw_agum is 'Historico consolidado de AGUMYYMM.txt usado para el modulo 1 de EnergyOS.';

create index if not exists raw_amat_periodo_idx
  on public.raw_amat(anio, mes);

create index if not exists raw_amat_periodo_demandante_idx
  on public.raw_amat(anio, mes, col_003);

create index if not exists raw_agum_periodo_idx
  on public.raw_agum(anio, mes);

create index if not exists raw_agum_periodo_nemo_idx
  on public.raw_agum(anio, mes, left(col_001, 8));

create index if not exists raw_agum_source_file_idx
  on public.raw_agum(source_file);

alter table public.raw_amat enable row level security;
alter table public.raw_agum enable row level security;

drop policy if exists raw_amat_select_authenticated on public.raw_amat;
create policy raw_amat_select_authenticated
  on public.raw_amat
  for select
  to authenticated
  using (true);

drop policy if exists raw_agum_select_authenticated on public.raw_agum;
create policy raw_agum_select_authenticated
  on public.raw_agum
  for select
  to authenticated
  using (true);

drop policy if exists raw_amat_admin_all on public.raw_amat;
create policy raw_amat_admin_all
  on public.raw_amat
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists raw_agum_admin_all on public.raw_agum;
create policy raw_agum_admin_all
  on public.raw_agum
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
