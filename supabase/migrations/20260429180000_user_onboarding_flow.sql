-- =============================================================================
-- Onboarding flow (permanente, paralelo a trial_accounts)
-- Modela: signup -> role -> agente search -> link nemo -> dashboard
-- Soporta multi-nemo (holdings industriales con varias plantas)
-- Self-contained: corre tanto en un Supabase recién creado como en uno con
-- las tablas legacy ya presentes.
-- =============================================================================

-- 0. MIRROR MÍNIMO DEL CATÁLOGO CAMMESA ----------------------------------------
-- En el Supabase "solo login" puede no existir esta tabla. La creamos mínima
-- e idempotente. Si ya existe (Supabase viejo con schema rico), no hacemos nada.
create table if not exists public.cammesa_agentes_mem (
  nemo         text primary key,
  descripcion  text not null,
  agrupacion   text,
  tipo_agente  text not null,
  synced_at    timestamptz not null default now()
);

create index if not exists cammesa_agentes_mem_descripcion_idx
  on public.cammesa_agentes_mem (descripcion);
create index if not exists cammesa_agentes_mem_tipo_agente_idx
  on public.cammesa_agentes_mem (tipo_agente);

alter table public.cammesa_agentes_mem enable row level security;

drop policy if exists "cammesa_agentes_mem_read_all_authenticated" on public.cammesa_agentes_mem;
create policy "cammesa_agentes_mem_read_all_authenticated"
  on public.cammesa_agentes_mem
  for select
  to authenticated
  using (true);

-- 1. PROFILE: 1:1 con auth.users -----------------------------------------------
create table if not exists public.user_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  role              text check (role in (
                      'gran_consumidor','generador','distribuidor',
                      'comercializador','analista'
                    )),
  full_name         text,
  display_name      text,
  accepted_terms_at timestamptz,
  onboarding_step   text not null default 'role'
                    check (onboarding_step in ('role','agente','verify','done')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.user_profiles is
  'Perfil persistente de cada usuario autenticado. Una fila por user_id; la crea el trigger handle_new_user.';

-- 2. AGENTES VINCULADOS: N:M user <-> nemo -------------------------------------
create table if not exists public.user_agentes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  nemo                  text not null,

  -- snapshot del catálogo en el momento del link (sobrevive renombres)
  descripcion_snapshot  text not null,
  tipo_agente_snapshot  text not null,
  agrupacion_snapshot   text,

  -- rol del usuario respecto a esta empresa
  role_in_org           text not null default 'owner'
                        check (role_in_org in ('owner','viewer','analyst')),

  -- verificación
  verified_at           timestamptz,
  verification_source   text check (verification_source in ('self','email_domain','document','manual')),

  created_at            timestamptz not null default now(),
  unique (user_id, nemo)
);

create index if not exists user_agentes_user_idx on public.user_agentes(user_id);
create index if not exists user_agentes_nemo_idx on public.user_agentes(nemo);

comment on table public.user_agentes is
  'Vínculo usuario <-> agente CAMMESA (nemo). Un user puede tener varios nemos (holding); un nemo puede tener varios users (compras + finanzas + sustentabilidad).';

-- 3. AUDIT LOG -----------------------------------------------------------------
create table if not exists public.user_onboarding_audit (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null check (action in (
                'role_set','agente_linked','agente_unlinked',
                'verified','terms_accepted','step_advanced'
              )),
  payload     jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists user_onboarding_audit_user_idx
  on public.user_onboarding_audit(user_id, created_at desc);

-- 4. TRIGGERS ------------------------------------------------------------------

-- 4a. Crear user_profiles automáticamente al alta de usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 4b. Touch updated_at
create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_touch on public.user_profiles;
create trigger trg_user_profiles_touch
  before update on public.user_profiles
  for each row
  execute function public.touch_user_profiles_updated_at();

-- 5. ROW LEVEL SECURITY --------------------------------------------------------
alter table public.user_profiles         enable row level security;
alter table public.user_agentes          enable row level security;
alter table public.user_onboarding_audit enable row level security;

drop policy if exists "user_profiles_self_select" on public.user_profiles;
create policy "user_profiles_self_select" on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profiles_self_update" on public.user_profiles;
create policy "user_profiles_self_update" on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_agentes_self_select" on public.user_agentes;
create policy "user_agentes_self_select" on public.user_agentes
  for select to authenticated
  using (user_id = auth.uid());

-- writes a user_agentes solo vía RPC (security definer), sin policy de INSERT/DELETE

drop policy if exists "user_onboarding_audit_self_select" on public.user_onboarding_audit;
create policy "user_onboarding_audit_self_select" on public.user_onboarding_audit
  for select to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- 6. RPCs DEL FLUJO
-- =============================================================================

-- 6a. set_user_role: paso 2 del flow (role selection)
create or replace function public.set_user_role(p_role text)
returns table (user_id uuid, role text, onboarding_step text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  if p_role not in ('gran_consumidor','generador','distribuidor','comercializador','analista') then
    raise exception 'invalid role: %', p_role;
  end if;

  insert into public.user_profiles (user_id, role, onboarding_step)
    values (v_uid, p_role, 'agente')
  on conflict (user_id) do update
    set role            = excluded.role,
        onboarding_step = case
                            when public.user_profiles.onboarding_step = 'role' then 'agente'
                            else public.user_profiles.onboarding_step
                          end;

  insert into public.user_onboarding_audit (user_id, action, payload)
    values (v_uid, 'role_set', jsonb_build_object('role', p_role));

  return query
    select up.user_id, up.role, up.onboarding_step
    from public.user_profiles up
    where up.user_id = v_uid;
end;
$$;

revoke all on function public.set_user_role(text) from public;
grant execute on function public.set_user_role(text) to authenticated;

-- 6b. link_user_agente: paso 3+4 del flow (selección + verificación trust)
create or replace function public.link_user_agente(
  p_nemo         text,
  p_role_in_org  text default 'owner'
)
returns table (
  id           uuid,
  nemo         text,
  descripcion  text,
  tipo_agente  text,
  agrupacion   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_descripcion  text;
  v_tipo         text;
  v_agrupacion   text;
  v_id           uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  if p_role_in_org not in ('owner','viewer','analyst') then
    raise exception 'invalid role_in_org: %', p_role_in_org;
  end if;

  -- valida que el nemo exista en el catálogo
  select a.descripcion, a.tipo_agente, a.agrupacion
    into v_descripcion, v_tipo, v_agrupacion
  from public.cammesa_agentes_mem a
  where a.nemo = p_nemo
  limit 1;

  if v_descripcion is null then
    raise exception 'nemo not found in cammesa_agentes_mem: %', p_nemo;
  end if;

  insert into public.user_agentes (
    user_id, nemo, descripcion_snapshot, tipo_agente_snapshot, agrupacion_snapshot,
    role_in_org, verified_at, verification_source
  ) values (
    v_uid, p_nemo, v_descripcion, v_tipo, v_agrupacion,
    p_role_in_org, now(), 'self'
  )
  on conflict (user_id, nemo) do update
    set role_in_org         = excluded.role_in_org,
        descripcion_snapshot = excluded.descripcion_snapshot,
        tipo_agente_snapshot = excluded.tipo_agente_snapshot,
        agrupacion_snapshot  = excluded.agrupacion_snapshot
  returning user_agentes.id into v_id;

  -- avanzar onboarding al primer link
  update public.user_profiles
    set onboarding_step = 'done'
    where user_id = v_uid
      and onboarding_step in ('agente','verify');

  insert into public.user_onboarding_audit (user_id, action, payload)
    values (v_uid, 'agente_linked', jsonb_build_object(
      'nemo', p_nemo,
      'role_in_org', p_role_in_org,
      'tipo_agente', v_tipo
    ));

  return query
    select v_id, p_nemo, v_descripcion, v_tipo, v_agrupacion;
end;
$$;

revoke all on function public.link_user_agente(text, text) from public;
grant execute on function public.link_user_agente(text, text) to authenticated;

-- 6c. unlink_user_agente
create or replace function public.unlink_user_agente(p_nemo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  delete from public.user_agentes
    where user_id = v_uid
      and nemo = p_nemo;

  get diagnostics v_deleted = row_count;

  insert into public.user_onboarding_audit (user_id, action, payload)
    values (v_uid, 'agente_unlinked', jsonb_build_object('nemo', p_nemo, 'rows', v_deleted));

  return v_deleted > 0;
end;
$$;

revoke all on function public.unlink_user_agente(text) from public;
grant execute on function public.unlink_user_agente(text) to authenticated;

-- 6d. me_profile
create or replace function public.me_profile()
returns table (
  user_id            uuid,
  role               text,
  onboarding_step    text,
  full_name          text,
  display_name       text,
  accepted_terms_at  timestamptz,
  agentes_count      int,
  created_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    up.user_id,
    up.role,
    up.onboarding_step,
    up.full_name,
    up.display_name,
    up.accepted_terms_at,
    (select count(*)::int
       from public.user_agentes ua
       where ua.user_id = up.user_id) as agentes_count,
    up.created_at
  from public.user_profiles up
  where up.user_id = auth.uid();
$$;

revoke all on function public.me_profile() from public;
grant execute on function public.me_profile() to authenticated;

-- 6e. me_agentes
create or replace function public.me_agentes()
returns table (
  id           uuid,
  nemo         text,
  descripcion  text,
  tipo_agente  text,
  agrupacion   text,
  role_in_org  text,
  verified_at  timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ua.id,
    ua.nemo,
    ua.descripcion_snapshot,
    ua.tipo_agente_snapshot,
    ua.agrupacion_snapshot,
    ua.role_in_org,
    ua.verified_at,
    ua.created_at
  from public.user_agentes ua
  where ua.user_id = auth.uid()
  order by ua.created_at;
$$;

revoke all on function public.me_agentes() from public;
grant execute on function public.me_agentes() to authenticated;

-- 6f. current_user_nemos: helper para futuras RLS policies / Edge Functions
-- Devuelve los nemos vinculados al usuario actual. Usar en policies con:
--    using (nemo = any(array(select public.current_user_nemos())))
create or replace function public.current_user_nemos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select ua.nemo
  from public.user_agentes ua
  where ua.user_id = auth.uid();
$$;

revoke all on function public.current_user_nemos() from public;
grant execute on function public.current_user_nemos() to authenticated;

-- 6g. accept_terms: marca aceptación de términos (para el step verify)
create or replace function public.accept_terms()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  update public.user_profiles
    set accepted_terms_at = coalesce(accepted_terms_at, v_now)
    where user_id = v_uid;

  insert into public.user_onboarding_audit (user_id, action, payload)
    values (v_uid, 'terms_accepted', jsonb_build_object('at', v_now));

  return v_now;
end;
$$;

revoke all on function public.accept_terms() from public;
grant execute on function public.accept_terms() to authenticated;

-- =============================================================================
-- 7. SEARCH AGENTES con filtro por tipos (overload del RPC existente)
--    Mantiene la firma vieja (p_q, p_limit) intacta; agrega p_tipos opcional.
-- =============================================================================
create or replace function public.search_cammesa_agentes(
  p_q     text,
  p_limit int,
  p_tipos text[]
)
returns table (
  nemo         text,
  descripcion  text,
  agrupacion   text,
  tipo_agente  text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.nemo,
    a.descripcion,
    a.agrupacion,
    a.tipo_agente
  from public.cammesa_agentes_mem a
  where (
          coalesce(p_q, '') = ''
          or a.descripcion ilike '%' || p_q || '%'
          or a.nemo        ilike '%' || p_q || '%'
        )
    and (p_tipos is null or array_length(p_tipos, 1) is null or a.tipo_agente = any(p_tipos))
  order by a.descripcion
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.search_cammesa_agentes(text, int, text[]) from public;
grant execute on function public.search_cammesa_agentes(text, int, text[]) to anon, authenticated, service_role;

-- =============================================================================
-- 8. BACKFILL: crear user_profiles para users que ya existen pre-trigger
-- =============================================================================
insert into public.user_profiles (user_id)
  select u.id
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where p.user_id is null;
