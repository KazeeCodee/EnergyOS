create extension if not exists pgcrypto;

-- Supabase Auth: enable Email/Password in the Supabase dashboard under
-- Authentication > Providers. The user relation is enforced below with auth.users.

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  cuit text null,
  tipo_usuario text not null check (tipo_usuario in ('GUMA', 'GUME', 'GUDI')),
  comercializador text null,
  distribuidor text null,
  plan_activo text not null check (plan_activo in ('compliance', 'gestion', 'full', 'white-label')),
  acuerdo_mensual_mwh numeric not null,
  created_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade
);

create table if not exists public.nemos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nemo text not null check (char_length(nemo) = 8),
  descripcion text null,
  activo boolean not null default true
);

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero_contrato text not null,
  tipo text not null check (tipo in ('RPB', 'RPE', 'BAS')),
  generador_nemo text not null,
  generador_nombre text not null,
  precio_usd_mwh numeric not null,
  volumen_mwh_mes numeric not null,
  vigencia_inicio date not null,
  vigencia_fin date not null,
  activo boolean not null default true
);

create table if not exists public.datos_mensuales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nemo text not null,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  demanda_total_mwh numeric not null,
  mater_mwh numeric not null,
  spot_mwh numeric not null,
  saldo_total_mwh numeric not null,
  porcentaje_renovable numeric not null,
  costo_renovable_usd_mwh numeric not null,
  costo_spot_usd_mwh numeric not null,
  costo_total_estimado_usd numeric not null,
  procesado_en timestamp with time zone not null default now()
);

create table if not exists public.datos_mercado (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  generacion_total_gwh numeric not null,
  generacion_mater_gwh numeric not null,
  mix_termica_pct numeric not null,
  mix_hidraulica_pct numeric not null,
  mix_nuclear_pct numeric not null,
  mix_renovable_pct numeric not null,
  precio_spot_usd_mwh numeric not null,
  costo_renovable_usd_mwh numeric not null,
  costo_cammesa_usd_mwh numeric not null,
  mater_mom_pct numeric null,
  mater_yoy_pct numeric null
);

create unique index if not exists empresas_user_id_key on public.empresas(user_id);
create unique index if not exists nemos_empresa_id_nemo_key on public.nemos(empresa_id, nemo);
create unique index if not exists contratos_empresa_id_numero_key on public.contratos(empresa_id, numero_contrato);
create unique index if not exists datos_mensuales_empresa_periodo_key on public.datos_mensuales(empresa_id, anio, mes);
create unique index if not exists datos_mercado_periodo_key on public.datos_mercado(anio, mes);

create index if not exists nemos_nemo_idx on public.nemos(nemo);
create index if not exists datos_mensuales_periodo_idx on public.datos_mensuales(anio, mes);

alter table public.empresas enable row level security;
alter table public.nemos enable row level security;
alter table public.contratos enable row level security;
alter table public.datos_mensuales enable row level security;
alter table public.datos_mercado enable row level security;

drop policy if exists empresas_select_own on public.empresas;
create policy empresas_select_own
  on public.empresas
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists empresas_insert_own on public.empresas;
create policy empresas_insert_own
  on public.empresas
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists empresas_update_own on public.empresas;
create policy empresas_update_own
  on public.empresas
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists empresas_delete_own on public.empresas;
create policy empresas_delete_own
  on public.empresas
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists nemos_select_own on public.nemos;
create policy nemos_select_own
  on public.nemos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = nemos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists nemos_insert_own on public.nemos;
create policy nemos_insert_own
  on public.nemos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.empresas e
      where e.id = nemos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists nemos_update_own on public.nemos;
create policy nemos_update_own
  on public.nemos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = nemos.empresa_id
        and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.empresas e
      where e.id = nemos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists nemos_delete_own on public.nemos;
create policy nemos_delete_own
  on public.nemos
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = nemos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists contratos_select_own on public.contratos;
create policy contratos_select_own
  on public.contratos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = contratos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists contratos_insert_own on public.contratos;
create policy contratos_insert_own
  on public.contratos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.empresas e
      where e.id = contratos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists contratos_update_own on public.contratos;
create policy contratos_update_own
  on public.contratos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = contratos.empresa_id
        and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.empresas e
      where e.id = contratos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists contratos_delete_own on public.contratos;
create policy contratos_delete_own
  on public.contratos
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = contratos.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists datos_mensuales_select_own on public.datos_mensuales;
create policy datos_mensuales_select_own
  on public.datos_mensuales
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.empresas e
      where e.id = datos_mensuales.empresa_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists datos_mercado_select_authenticated on public.datos_mercado;
create policy datos_mercado_select_authenticated
  on public.datos_mercado
  for select
  to authenticated
  using (true);
