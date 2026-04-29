-- T1.2 — Tabla ingest_runs
-- Registra cada corrida de carga de los SQL historicos locales a Supabase raw_*.

create table if not exists public.ingest_runs (
  id              bigserial primary key,
  tabla           text        not null,
  anio            integer     null,
  mes             integer     null,
  source_zip      text        null,
  source_file     text        null,
  filas_leidas    integer     not null default 0,
  filas_insertadas integer    not null default 0,
  filas_omitidas  integer     not null default 0,
  filas_error     integer     not null default 0,
  duracion_seg    numeric(10,2) null,
  estado          text        not null default 'iniciado'
                              check (estado in ('iniciado','completo','error')),
  mensaje_error   text        null,
  iniciado_en     timestamptz not null default now(),
  terminado_en    timestamptz null
);

comment on table public.ingest_runs is
  'Registro de corridas de ingesta de SQL historicos locales hacia raw_*. Insumo de ingest_health (T1.3).';

create index if not exists ingest_runs_tabla_periodo_idx
  on public.ingest_runs(tabla, anio, mes);

create index if not exists ingest_runs_estado_idx
  on public.ingest_runs(estado);

alter table public.ingest_runs enable row level security;

drop policy if exists ingest_runs_admin_all on public.ingest_runs;
create policy ingest_runs_admin_all on public.ingest_runs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
