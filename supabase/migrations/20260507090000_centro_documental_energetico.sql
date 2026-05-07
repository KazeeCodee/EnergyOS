-- Centro documental energetico.
-- Documentos privados y ficha contractual por NEMO.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'energy-documents',
  'energy-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.documentos_energeticos (
  id uuid primary key default gen_random_uuid(),
  nemo text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in (
    'contrato_mater',
    'contrato_proveedor',
    'anexo_comercial',
    'factura_proveedor',
    'factura_distribuidor',
    'certificado_renovable',
    'comunicacion_cammesa',
    'cotizacion',
    'otro'
  )),
  titulo text not null,
  proveedor_nombre text null,
  periodo_anio int null,
  periodo_mes int null check (periodo_mes between 1 and 12),
  fecha_documento date null,
  fecha_vencimiento date null,
  confidencial boolean not null default true,
  storage_bucket text not null default 'energy-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text null,
  file_size_bytes bigint null,
  notas text null,
  estado text not null default 'activo' check (estado in ('activo', 'archivado', 'reemplazado')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documentos_energeticos_nemo_tipo_idx
  on public.documentos_energeticos (nemo, tipo_documento, created_at desc);

create index if not exists documentos_energeticos_vencimiento_idx
  on public.documentos_energeticos (nemo, fecha_vencimiento)
  where fecha_vencimiento is not null;

create table if not exists public.contratos_energeticos (
  id uuid primary key default gen_random_uuid(),
  nemo text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  documento_id uuid null references public.documentos_energeticos(id) on delete set null,
  tipo_contrato text not null default 'mater' check (tipo_contrato in (
    'mater',
    'ppa_renovable',
    'comercializador',
    'distribuidor',
    'autogeneracion',
    'otro'
  )),
  proveedor_nombre text not null,
  contraparte_nemo text null,
  fecha_inicio date null,
  fecha_fin date null,
  precio_energia numeric null,
  moneda text null check (moneda in ('ARS', 'USD', 'EUR')),
  volumen_mwh_mes numeric null,
  porcentaje_cobertura numeric null check (porcentaje_cobertura is null or porcentaje_cobertura between 0 and 1),
  potencia_mw numeric null,
  take_or_pay boolean null,
  take_or_pay_pct numeric null check (take_or_pay_pct is null or take_or_pay_pct between 0 and 1),
  ajuste_descripcion text null,
  prioridad_despacho text null,
  punto_suministro text null,
  facturacion_frecuencia text null,
  estado text not null default 'vigente' check (estado in ('borrador', 'vigente', 'vencido', 'rescindido', 'reemplazado')),
  notas text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contratos_energeticos_nemo_estado_idx
  on public.contratos_energeticos (nemo, estado, fecha_fin);

create index if not exists contratos_energeticos_documento_idx
  on public.contratos_energeticos (documento_id);

create table if not exists public.documentos_energeticos_eventos (
  id bigserial primary key,
  documento_id uuid null references public.documentos_energeticos(id) on delete cascade,
  contrato_id uuid null references public.contratos_energeticos(id) on delete cascade,
  nemo text not null,
  user_id uuid null references auth.users(id) on delete set null,
  evento text not null check (evento in (
    'documento_creado',
    'documento_actualizado',
    'documento_descargado',
    'contrato_creado',
    'contrato_actualizado'
  )),
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documentos_energeticos_eventos_nemo_idx
  on public.documentos_energeticos_eventos (nemo, created_at desc);

create or replace function public.touch_documentos_energeticos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_documentos_energeticos_touch on public.documentos_energeticos;
create trigger trg_documentos_energeticos_touch
  before update on public.documentos_energeticos
  for each row
  execute function public.touch_documentos_energeticos_updated_at();

drop trigger if exists trg_contratos_energeticos_touch on public.contratos_energeticos;
create trigger trg_contratos_energeticos_touch
  before update on public.contratos_energeticos
  for each row
  execute function public.touch_documentos_energeticos_updated_at();

alter table public.documentos_energeticos enable row level security;
alter table public.contratos_energeticos enable row level security;
alter table public.documentos_energeticos_eventos enable row level security;

drop policy if exists "documentos_energeticos_select_nemo" on public.documentos_energeticos;
create policy "documentos_energeticos_select_nemo" on public.documentos_energeticos
  for select to authenticated
  using (nemo = any(array(select public.current_user_nemos())));

drop policy if exists "documentos_energeticos_insert_nemo" on public.documentos_energeticos;
create policy "documentos_energeticos_insert_nemo" on public.documentos_energeticos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and nemo = any(array(select public.current_user_nemos()))
  );

drop policy if exists "documentos_energeticos_update_nemo" on public.documentos_energeticos;
create policy "documentos_energeticos_update_nemo" on public.documentos_energeticos
  for update to authenticated
  using (nemo = any(array(select public.current_user_nemos())))
  with check (nemo = any(array(select public.current_user_nemos())));

drop policy if exists "contratos_energeticos_select_nemo" on public.contratos_energeticos;
create policy "contratos_energeticos_select_nemo" on public.contratos_energeticos
  for select to authenticated
  using (nemo = any(array(select public.current_user_nemos())));

drop policy if exists "contratos_energeticos_insert_nemo" on public.contratos_energeticos;
create policy "contratos_energeticos_insert_nemo" on public.contratos_energeticos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and nemo = any(array(select public.current_user_nemos()))
  );

drop policy if exists "contratos_energeticos_update_nemo" on public.contratos_energeticos;
create policy "contratos_energeticos_update_nemo" on public.contratos_energeticos
  for update to authenticated
  using (nemo = any(array(select public.current_user_nemos())))
  with check (nemo = any(array(select public.current_user_nemos())));

drop policy if exists "documentos_energeticos_eventos_select_nemo" on public.documentos_energeticos_eventos;
create policy "documentos_energeticos_eventos_select_nemo" on public.documentos_energeticos_eventos
  for select to authenticated
  using (nemo = any(array(select public.current_user_nemos())));

drop policy if exists "documentos_energeticos_eventos_insert_nemo" on public.documentos_energeticos_eventos;
create policy "documentos_energeticos_eventos_insert_nemo" on public.documentos_energeticos_eventos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and nemo = any(array(select public.current_user_nemos()))
  );

drop policy if exists "energy_documents_storage_select" on storage.objects;
create policy "energy_documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'energy-documents'
    and (storage.foldername(name))[1] = any(array(select public.current_user_nemos()))
  );

drop policy if exists "energy_documents_storage_insert" on storage.objects;
create policy "energy_documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'energy-documents'
    and (storage.foldername(name))[1] = any(array(select public.current_user_nemos()))
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "energy_documents_storage_update" on storage.objects;
create policy "energy_documents_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'energy-documents'
    and (storage.foldername(name))[1] = any(array(select public.current_user_nemos()))
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'energy-documents'
    and (storage.foldername(name))[1] = any(array(select public.current_user_nemos()))
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "energy_documents_storage_delete" on storage.objects;
create policy "energy_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'energy-documents'
    and (storage.foldername(name))[1] = any(array(select public.current_user_nemos()))
    and (storage.foldername(name))[2] = auth.uid()::text
  );
