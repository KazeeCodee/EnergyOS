alter table public.cammesa_generacion
  drop constraint if exists cammesa_generacion_pkey;

drop index if exists public.cammesa_generacion_fecha_idx;

alter table public.cammesa_generacion
  drop column if exists fecha,
  drop column if exists nuclear,
  drop column if exists termico,
  drop column if exists renovable_hidro_50mw,
  drop column if exists renovable_ley_26190,
  drop column if exists importacion,
  drop column if exists total,
  add column if not exists id bigint,
  add column if not exists anio integer,
  add column if not exists mes integer check (mes between 1 and 12),
  add column if not exists maquina text,
  add column if not exists central text,
  add column if not exists agente text,
  add column if not exists agente_descripcion text,
  add column if not exists region text,
  add column if not exists pais text,
  add column if not exists tipo_maquina text,
  add column if not exists fuente_generacion text,
  add column if not exists tecnologia text,
  add column if not exists categoria_hidraulica text,
  add column if not exists categoria_region text,
  add column if not exists generacion_neta_mwh numeric,
  add column if not exists fecha_proceso timestamp without time zone,
  add column if not exists lote_id_log bigint,
  add column if not exists indice_tiempo text;

alter table public.cammesa_generacion
  alter column id set not null;

alter table public.cammesa_generacion
  add constraint cammesa_generacion_pkey primary key (id);

create index if not exists cammesa_generacion_periodo_idx
  on public.cammesa_generacion(anio, mes);

create index if not exists cammesa_generacion_agente_periodo_idx
  on public.cammesa_generacion(agente, anio, mes);
