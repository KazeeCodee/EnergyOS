-- =============================================================================
-- Unifica gating de trial en user_profiles. Deprecates trial_accounts como
-- fuente de verdad. Usuarios normales (sin trial_status) NO se ven afectados.
-- =============================================================================

-- 1. Columnas de trial en user_profiles -------------------------------------
alter table public.user_profiles
  add column if not exists trial_status text
    check (trial_status in ('active','expired','suspended','converted')),
  add column if not exists trial_expires_at timestamptz,
  add column if not exists company_key text;

comment on column public.user_profiles.trial_status is
  'NULL para usuarios normales. Solo se setea en signups de prueba (landing).';
comment on column public.user_profiles.trial_expires_at is
  'NULL para usuarios normales. now()+30d para signups de prueba.';
comment on column public.user_profiles.company_key is
  'Clave normalizada (CUIT preferido, slug fallback) para garantizar 1 trial activo por empresa.';

-- 2. Normalización de empresa -----------------------------------------------
create or replace function public.normalize_company_key(p_company text, p_cuit text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(regexp_replace(coalesce(p_cuit, ''), '[^0-9]', '', 'g'), ''),
    nullif(lower(btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'))), '')
  );
$$;

-- 3. Pre-check para landing (UX antes de signUp) ----------------------------
create or replace function public.is_company_trial_available(p_company text, p_cuit text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with k as (select public.normalize_company_key(p_company, p_cuit) as ck)
  select case
    when (select ck from k) is null then true
    else not exists (
      select 1
      from public.user_profiles up, k
      where up.trial_status = 'active'
        and up.company_key = k.ck
    )
  end;
$$;

revoke all on function public.is_company_trial_available(text, text) from public;
grant execute on function public.is_company_trial_available(text, text) to anon, authenticated, service_role;

-- 4. Trigger landing extendido: setea trial_status/trial_expires_at/company_key
--    solo cuando metadata trae is_trial=true. Mantiene compatibilidad con el
--    resto de campos ya existentes.
create or replace function public.apply_landing_metadata_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta jsonb;
  v_cuit text;
  v_tipo text;
  v_role text;
  v_is_trial boolean;
  v_company_key text;
begin
  select coalesce(raw_user_meta_data, '{}'::jsonb) into meta
  from auth.users where id = new.user_id;

  if meta is null or meta = '{}'::jsonb then
    return new;
  end if;

  v_cuit := nullif(regexp_replace(coalesce(meta->>'cuit', ''), '[^0-9]', '', 'g'), '');
  if v_cuit is not null and length(v_cuit) <> 11 then
    v_cuit := null;
  end if;

  v_tipo := lower(coalesce(meta->>'tipo_empresa', ''));
  v_role := case v_tipo
    when 'gran_usuario'    then 'gran_consumidor'
    when 'gudi'            then 'gran_consumidor'
    when 'comercializador' then 'comercializador'
    when 'generador'       then 'generador'
    when 'distribuidor'    then 'distribuidor'
    when 'analista'        then 'analista'
    else null
  end;

  new.full_name      := coalesce(meta->>'full_name', new.full_name);
  new.role           := coalesce(v_role, new.role);
  new.rol            := coalesce(meta->>'rol', new.rol);
  new.company        := coalesce(meta->>'company', new.company);
  new.tipo_empresa   := coalesce(meta->>'tipo_empresa', new.tipo_empresa);
  new.cuit           := coalesce(v_cuit, new.cuit);
  new.industria      := coalesce(meta->>'industria', new.industria);
  new.demanda_kw     := coalesce(meta->>'demanda_kw', new.demanda_kw);
  new.telefono       := coalesce(meta->>'telefono', new.telefono);

  if (meta->>'accepts_terms')::boolean is true and new.accepted_terms_at is null then
    new.accepted_terms_at := now();
  end if;

  -- Acepta is_trial (landing nuevo) o trial (trial-login Edge Function legacy).
  v_is_trial := (meta->>'is_trial')::boolean is true
             or (meta->>'trial')::boolean is true;
  if v_is_trial then
    if new.trial_status is null then
      new.trial_status := 'active';
    end if;
    if new.trial_expires_at is null then
      new.trial_expires_at := now() + interval '30 days';
    end if;
    v_company_key := public.normalize_company_key(
      coalesce(meta->>'company', new.company),
      coalesce(meta->>'cuit', new.cuit)
    );
    if v_company_key is not null and new.company_key is null then
      new.company_key := v_company_key;
    end if;
  end if;

  return new;
end;
$$;

-- 5. Función de expiry (cron diario, idempotente) ---------------------------
create or replace function public.expire_overdue_trials()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with updated as (
    update public.user_profiles
       set trial_status = 'expired'
     where trial_status = 'active'
       and trial_expires_at is not null
       and trial_expires_at <= now()
    returning 1
  )
  select count(*)::int into v_count from updated;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_overdue_trials() from public;
grant execute on function public.expire_overdue_trials() to service_role;

-- 6. Backfill desde trial_accounts legacy (datos primero, sin company_key) --
do $$
begin
  if to_regclass('public.trial_accounts') is not null then
    update public.user_profiles up
       set trial_status      = coalesce(up.trial_status, ta.status),
           trial_expires_at  = coalesce(up.trial_expires_at, ta.expires_at),
           company           = coalesce(up.company, ta.company),
           cuit              = coalesce(up.cuit,
                                  nullif(regexp_replace(coalesce(ta.cuit, ''), '[^0-9]', '', 'g'), '')),
           tipo_empresa      = coalesce(up.tipo_empresa, ta.tipo_empresa),
           industria         = coalesce(up.industria, ta.industria),
           demanda_kw        = coalesce(up.demanda_kw, ta.demanda_kw),
           rol               = coalesce(up.rol, ta.rol),
           telefono          = coalesce(up.telefono, ta.telefono),
           full_name         = coalesce(up.full_name, ta.full_name)
      from public.trial_accounts ta
     where ta.user_id = up.user_id
       and ta.user_id is not null;
  end if;
end $$;

-- 7. Setear company_key en todos los trials existentes ---------------------
update public.user_profiles up
   set company_key = public.normalize_company_key(up.company, up.cuit)
 where up.trial_status is not null
   and up.company_key is null;

-- 8. Dedupe defensivo: si hay varios trials activos con mismo company_key
--    (legacy), conservar el más reciente y degradar el resto a 'suspended'.
--    Garantiza que el unique index pueda crearse sin colisiones.
with ranked as (
  select user_id,
         row_number() over (
           partition by company_key
           order by created_at desc, user_id desc
         ) as rn
    from public.user_profiles
   where trial_status = 'active'
     and company_key is not null
)
update public.user_profiles up
   set trial_status = 'suspended'
  from ranked
 where ranked.user_id = up.user_id
   and ranked.rn > 1;

-- 9. Unique parcial: 1 trial activo por empresa.
--    Solo aplica a filas con trial_status='active' y company_key NOT NULL.
--    Usuarios normales (trial_status NULL) y trials inactivos quedan fuera.
drop index if exists public.user_profiles_company_key_active;
create unique index user_profiles_company_key_active
  on public.user_profiles (company_key)
  where company_key is not null and trial_status = 'active';
