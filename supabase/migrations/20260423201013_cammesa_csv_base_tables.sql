create table if not exists public.cammesa_demanda_ultimos_anos (
  id bigint primary key,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  agente_nemo text not null,
  agente_descripcion text null,
  tipo_agente text null,
  region text null,
  provincia text null,
  categoria_area text null,
  categoria_demanda text null,
  tarifa text null,
  categoria_tarifa text null,
  demanda_mwh numeric null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null,
  indice_tiempo text null
);

create table if not exists public.cammesa_combustibles (
  id bigint primary key,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  maquina text not null,
  central text null,
  agente text null,
  agente_descripcion text null,
  tipo_maquina text null,
  fuente_generacion text null,
  tecnologia text null,
  combustible text null,
  consumo numeric null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null,
  indice_tiempo text null
);

create table if not exists public.cammesa_agentes_mem (
  id bigint primary key,
  nemo text not null,
  descripcion text null,
  agrupacion text null,
  tipo_agente text null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null
);

create table if not exists public.cammesa_balance_energia (
  id bigint primary key,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  balance text not null,
  tipo text not null,
  energia_mwh numeric null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null,
  indice_tiempo text null
);

create table if not exists public.cammesa_potencia_instalada (
  id bigint primary key,
  periodo timestamp without time zone null,
  central text null,
  agente text null,
  agente_descripcion text null,
  region text null,
  categoria_region text null,
  tipo_maquina text null,
  fuente_generacion text null,
  tecnologia text null,
  potencia_instalada_mw numeric null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null,
  mes integer null check (mes between 1 and 12),
  indice_tiempo text null,
  anio integer null
);

create table if not exists public.cammesa_demanda_historica (
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  agente_nemo text not null,
  agente_descripcion text null,
  tipo_agente text null,
  region text null,
  provincia text null,
  categoria_area text null,
  categoria_demanda text null,
  tarifa text null,
  categoria_tarifa text null,
  demanda_mwh numeric null,
  indice_tiempo text not null,
  primary key (anio, mes, agente_nemo, indice_tiempo)
);

create table if not exists public.cammesa_importaciones_exportaciones (
  id bigint primary key,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  pais text not null,
  tipo text not null,
  energia_mwh numeric null,
  fecha_proceso timestamp without time zone null,
  lote_id_log bigint null,
  indice_tiempo text null
);

comment on table public.cammesa_demanda_ultimos_anos is 'Base importada desde demanda-ultimos-anos.csv';
comment on table public.cammesa_combustibles is 'Base importada desde combustibles.csv';
comment on table public.cammesa_agentes_mem is 'Base importada desde agentes-mem.csv';
comment on table public.cammesa_balance_energia is 'Base importada desde balance (2).csv';
comment on table public.cammesa_potencia_instalada is 'Base importada desde potencia-instalada.csv';
comment on table public.cammesa_demanda_historica is 'Base importada desde demanda-historica.csv';
comment on table public.cammesa_importaciones_exportaciones is 'Base importada desde importaciones-exportaciones.csv';
comment on column public.cammesa_agentes_mem.descripcion is 'En el CSV original el encabezado aparece como descipcion.';

create index if not exists cammesa_demanda_ultimos_anos_periodo_idx
  on public.cammesa_demanda_ultimos_anos(anio, mes);
create index if not exists cammesa_demanda_ultimos_anos_agente_periodo_idx
  on public.cammesa_demanda_ultimos_anos(agente_nemo, anio, mes);

create index if not exists cammesa_combustibles_periodo_idx
  on public.cammesa_combustibles(anio, mes);
create index if not exists cammesa_combustibles_combustible_periodo_idx
  on public.cammesa_combustibles(combustible, anio, mes);

create index if not exists cammesa_agentes_mem_nemo_idx
  on public.cammesa_agentes_mem(nemo);
create index if not exists cammesa_agentes_mem_tipo_idx
  on public.cammesa_agentes_mem(tipo_agente);

create index if not exists cammesa_balance_energia_periodo_idx
  on public.cammesa_balance_energia(anio, mes);
create index if not exists cammesa_balance_energia_tipo_periodo_idx
  on public.cammesa_balance_energia(balance, tipo, anio, mes);

create index if not exists cammesa_potencia_instalada_periodo_idx
  on public.cammesa_potencia_instalada(anio, mes);
create index if not exists cammesa_potencia_instalada_fuente_periodo_idx
  on public.cammesa_potencia_instalada(fuente_generacion, anio, mes);

create index if not exists cammesa_demanda_historica_periodo_idx
  on public.cammesa_demanda_historica(anio, mes);
create index if not exists cammesa_demanda_historica_agente_periodo_idx
  on public.cammesa_demanda_historica(agente_nemo, anio, mes);

create index if not exists cammesa_importaciones_exportaciones_periodo_idx
  on public.cammesa_importaciones_exportaciones(anio, mes);
create index if not exists cammesa_importaciones_exportaciones_pais_periodo_idx
  on public.cammesa_importaciones_exportaciones(pais, anio, mes);

alter table public.cammesa_demanda_ultimos_anos enable row level security;
alter table public.cammesa_combustibles enable row level security;
alter table public.cammesa_agentes_mem enable row level security;
alter table public.cammesa_balance_energia enable row level security;
alter table public.cammesa_potencia_instalada enable row level security;
alter table public.cammesa_demanda_historica enable row level security;
alter table public.cammesa_importaciones_exportaciones enable row level security;

drop policy if exists cammesa_demanda_ultimos_anos_select_authenticated on public.cammesa_demanda_ultimos_anos;
create policy cammesa_demanda_ultimos_anos_select_authenticated
  on public.cammesa_demanda_ultimos_anos
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_demanda_ultimos_anos_admin_all on public.cammesa_demanda_ultimos_anos;
create policy cammesa_demanda_ultimos_anos_admin_all
  on public.cammesa_demanda_ultimos_anos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_combustibles_select_authenticated on public.cammesa_combustibles;
create policy cammesa_combustibles_select_authenticated
  on public.cammesa_combustibles
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_combustibles_admin_all on public.cammesa_combustibles;
create policy cammesa_combustibles_admin_all
  on public.cammesa_combustibles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_agentes_mem_select_authenticated on public.cammesa_agentes_mem;
create policy cammesa_agentes_mem_select_authenticated
  on public.cammesa_agentes_mem
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_agentes_mem_admin_all on public.cammesa_agentes_mem;
create policy cammesa_agentes_mem_admin_all
  on public.cammesa_agentes_mem
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_balance_energia_select_authenticated on public.cammesa_balance_energia;
create policy cammesa_balance_energia_select_authenticated
  on public.cammesa_balance_energia
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_balance_energia_admin_all on public.cammesa_balance_energia;
create policy cammesa_balance_energia_admin_all
  on public.cammesa_balance_energia
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_potencia_instalada_select_authenticated on public.cammesa_potencia_instalada;
create policy cammesa_potencia_instalada_select_authenticated
  on public.cammesa_potencia_instalada
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_potencia_instalada_admin_all on public.cammesa_potencia_instalada;
create policy cammesa_potencia_instalada_admin_all
  on public.cammesa_potencia_instalada
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_demanda_historica_select_authenticated on public.cammesa_demanda_historica;
create policy cammesa_demanda_historica_select_authenticated
  on public.cammesa_demanda_historica
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_demanda_historica_admin_all on public.cammesa_demanda_historica;
create policy cammesa_demanda_historica_admin_all
  on public.cammesa_demanda_historica
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_importaciones_exportaciones_select_authenticated on public.cammesa_importaciones_exportaciones;
create policy cammesa_importaciones_exportaciones_select_authenticated
  on public.cammesa_importaciones_exportaciones
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_importaciones_exportaciones_admin_all on public.cammesa_importaciones_exportaciones;
create policy cammesa_importaciones_exportaciones_admin_all
  on public.cammesa_importaciones_exportaciones
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
