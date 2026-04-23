create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and is_admin = true
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.cammesa_archivos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('DTE', 'VARIABLES_RELEVANTES', 'OTRO')),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  file_path text not null,
  file_name text not null,
  size_bytes bigint null,
  content_type text null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.procesamientos (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  dte_archivo_id uuid null references public.cammesa_archivos(id) on delete set null,
  variables_archivo_id uuid null references public.cammesa_archivos(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesando', 'completo', 'error')),
  resumen jsonb not null default '{}'::jsonb,
  creado_por uuid not null references auth.users(id),
  started_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  error_message text null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.procesamiento_empresas (
  id uuid primary key default gen_random_uuid(),
  procesamiento_id uuid not null references public.procesamientos(id) on delete cascade,
  empresa_id uuid null references public.empresas(id) on delete set null,
  estado text not null check (estado in ('pendiente', 'completo', 'error', 'sin_datos')),
  mensaje text null,
  demanda_total_mwh numeric null,
  mater_mwh numeric null,
  spot_mwh numeric null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists cammesa_archivos_periodo_idx on public.cammesa_archivos(anio, mes, tipo);
create index if not exists procesamientos_periodo_idx on public.procesamientos(anio, mes, created_at desc);
create index if not exists procesamiento_empresas_procesamiento_idx on public.procesamiento_empresas(procesamiento_id);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

alter table public.admin_profiles enable row level security;
alter table public.cammesa_archivos enable row level security;
alter table public.procesamientos enable row level security;
alter table public.procesamiento_empresas enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists admin_profiles_select_self_or_admin on public.admin_profiles;
create policy admin_profiles_select_self_or_admin
  on public.admin_profiles
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists admin_profiles_admin_all on public.admin_profiles;
create policy admin_profiles_admin_all
  on public.admin_profiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cammesa_archivos_admin_all on public.cammesa_archivos;
create policy cammesa_archivos_admin_all
  on public.cammesa_archivos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists procesamientos_admin_all on public.procesamientos;
create policy procesamientos_admin_all
  on public.procesamientos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists procesamiento_empresas_admin_all on public.procesamiento_empresas;
create policy procesamiento_empresas_admin_all
  on public.procesamiento_empresas
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists audit_logs_admin_all on public.audit_logs;
create policy audit_logs_admin_all
  on public.audit_logs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cammesa-uploads',
  'cammesa-uploads',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cammesa_uploads_admin_read on storage.objects;
create policy cammesa_uploads_admin_read
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'cammesa-uploads' and public.is_admin());

drop policy if exists cammesa_uploads_admin_insert on storage.objects;
create policy cammesa_uploads_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'cammesa-uploads' and public.is_admin());

drop policy if exists cammesa_uploads_admin_update on storage.objects;
create policy cammesa_uploads_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'cammesa-uploads' and public.is_admin())
  with check (bucket_id = 'cammesa-uploads' and public.is_admin());

drop policy if exists cammesa_uploads_admin_delete on storage.objects;
create policy cammesa_uploads_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'cammesa-uploads' and public.is_admin());
