create table if not exists public.agentes_monitoreados (
  id uuid primary key default gen_random_uuid(),
  cammesa_agente_id bigint not null unique references public.cammesa_agentes_mem(id),
  nemo text not null unique,
  razon_social text not null,
  tipo_agente text null,
  agrupacion text null,
  activo boolean not null default true,
  seguimiento_desde date not null default date '2020-02-01',
  cobertura_desde date null,
  cobertura_hasta date null,
  ultima_captura_periodo date null,
  created_at timestamp with time zone not null default now()
);

create index if not exists agentes_monitoreados_activo_idx
  on public.agentes_monitoreados(activo);

alter table public.agentes_monitoreados enable row level security;

drop policy if exists agentes_monitoreados_admin_all on public.agentes_monitoreados;
create policy agentes_monitoreados_admin_all
  on public.agentes_monitoreados
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

with cobertura_completa as (
  select
    empresa_id,
    min(make_date(anio, mes, 1)) as cobertura_desde,
    max(make_date(anio, mes, 1)) as cobertura_hasta,
    count(distinct (anio, mes)) as periodos
  from public.datos_mensuales
  group by empresa_id
  having min(make_date(anio, mes, 1)) = date '2020-02-01'
     and max(make_date(anio, mes, 1)) = date '2026-03-01'
     and count(distinct (anio, mes)) = 74
)
insert into public.agentes_monitoreados (
  id,
  cammesa_agente_id,
  nemo,
  razon_social,
  tipo_agente,
  agrupacion,
  activo,
  seguimiento_desde,
  cobertura_desde,
  cobertura_hasta,
  ultima_captura_periodo
)
select
  e.id,
  am.id,
  n.nemo,
  coalesce(am.descripcion, e.razon_social),
  am.tipo_agente,
  am.agrupacion,
  true,
  cc.cobertura_desde,
  cc.cobertura_desde,
  cc.cobertura_hasta,
  cc.cobertura_hasta
from cobertura_completa cc
join public.empresas e
  on e.id = cc.empresa_id
join public.nemos n
  on n.empresa_id = e.id
 and n.activo = true
join public.cammesa_agentes_mem am
  on am.nemo = n.nemo
on conflict (id) do update
set
  cammesa_agente_id = excluded.cammesa_agente_id,
  nemo = excluded.nemo,
  razon_social = excluded.razon_social,
  tipo_agente = excluded.tipo_agente,
  agrupacion = excluded.agrupacion,
  activo = excluded.activo,
  seguimiento_desde = excluded.seguimiento_desde,
  cobertura_desde = excluded.cobertura_desde,
  cobertura_hasta = excluded.cobertura_hasta,
  ultima_captura_periodo = excluded.ultima_captura_periodo;

delete from public.datos_mensuales
where empresa_id not in (
  select id
  from public.agentes_monitoreados
);

delete from public.procesamiento_empresas
where empresa_id is null
   or empresa_id not in (
     select id
     from public.agentes_monitoreados
   );

alter table public.datos_mensuales
  drop constraint if exists datos_mensuales_empresa_id_fkey;

alter table public.datos_mensuales
  add constraint datos_mensuales_empresa_id_fkey
  foreign key (empresa_id)
  references public.agentes_monitoreados(id)
  on delete cascade;

alter table public.procesamiento_empresas
  drop constraint if exists procesamiento_empresas_empresa_id_fkey;

alter table public.procesamiento_empresas
  add constraint procesamiento_empresas_empresa_id_fkey
  foreign key (empresa_id)
  references public.agentes_monitoreados(id)
  on delete set null;

drop policy if exists datos_mensuales_select_own on public.datos_mensuales;

drop table if exists public.contratos;
drop table if exists public.nemos;
drop table if exists public.empresas;
