create table if not exists public.cammesa_demanda_temperatura (
  fecha timestamp without time zone primary key,
  prevista numeric null,
  semana_ant numeric null,
  ayer numeric null,
  hoy numeric null,
  tem_prevista numeric null,
  tem_semana_ant numeric null,
  tem_ayer numeric null,
  tem_hoy numeric null
);

create table if not exists public.cammesa_porcentaje_generacion (
  fecha timestamp without time zone primary key,
  nuclear numeric null,
  termico numeric null,
  renovable_hidro_50mw numeric null,
  renovable_ley_26190 numeric null,
  importacion numeric null
);

create table if not exists public.cammesa_generacion (
  fecha timestamp without time zone primary key,
  nuclear numeric null,
  termico numeric null,
  renovable_hidro_50mw numeric null,
  renovable_ley_26190 numeric null,
  importacion numeric null,
  total numeric null
);

comment on table public.cammesa_demanda_temperatura is 'Base importada desde DemandaYTemperatura_*.csv';
comment on table public.cammesa_porcentaje_generacion is 'Base importada desde PorcentajeGeneracion_*.csv';
comment on table public.cammesa_generacion is 'Base importada desde Generacion_*.csv';

create index if not exists cammesa_demanda_temperatura_fecha_idx
  on public.cammesa_demanda_temperatura(fecha);

create index if not exists cammesa_porcentaje_generacion_fecha_idx
  on public.cammesa_porcentaje_generacion(fecha);

create index if not exists cammesa_generacion_fecha_idx
  on public.cammesa_generacion(fecha);

alter table public.cammesa_demanda_temperatura enable row level security;
alter table public.cammesa_porcentaje_generacion enable row level security;
alter table public.cammesa_generacion enable row level security;

drop policy if exists cammesa_demanda_temperatura_select_authenticated on public.cammesa_demanda_temperatura;
create policy cammesa_demanda_temperatura_select_authenticated
  on public.cammesa_demanda_temperatura
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_demanda_temperatura_admin_all on public.cammesa_demanda_temperatura;
create policy cammesa_demanda_temperatura_admin_all
  on public.cammesa_demanda_temperatura
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_porcentaje_generacion_select_authenticated on public.cammesa_porcentaje_generacion;
create policy cammesa_porcentaje_generacion_select_authenticated
  on public.cammesa_porcentaje_generacion
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_porcentaje_generacion_admin_all on public.cammesa_porcentaje_generacion;
create policy cammesa_porcentaje_generacion_admin_all
  on public.cammesa_porcentaje_generacion
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_generacion_select_authenticated on public.cammesa_generacion;
create policy cammesa_generacion_select_authenticated
  on public.cammesa_generacion
  for select
  to authenticated
  using (true);

drop policy if exists cammesa_generacion_admin_all on public.cammesa_generacion;
create policy cammesa_generacion_admin_all
  on public.cammesa_generacion
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
