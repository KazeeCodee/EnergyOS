-- Auto-link cammesa_nemo cuando trial signup trae uno valido en metadata.
-- Avanza onboarding_step a 'done' si link exitoso, evitando que el flow de
-- onboarding del CRM pida elegir empresa cuando ya viene del form de landing.

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
  v_nemo text;
  v_descripcion text;
  v_tipo_agente text;
  v_agrupacion text;
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

    v_nemo := nullif(btrim(coalesce(meta->>'cammesa_nemo', '')), '');
    if v_nemo is not null then
      select a.descripcion, a.tipo_agente, a.agrupacion
        into v_descripcion, v_tipo_agente, v_agrupacion
      from public.cammesa_agentes_mem a
      where a.nemo = v_nemo
      limit 1;

      if v_descripcion is not null then
        insert into public.user_agentes (
          user_id, nemo, descripcion_snapshot, tipo_agente_snapshot, agrupacion_snapshot,
          role_in_org, verified_at, verification_source
        ) values (
          new.user_id, v_nemo, v_descripcion, v_tipo_agente, v_agrupacion,
          'owner', now(), 'self'
        )
        on conflict (user_id, nemo) do nothing;

        new.onboarding_step := 'done';

        insert into public.user_onboarding_audit (user_id, action, payload)
          values (new.user_id, 'agente_linked', jsonb_build_object(
            'nemo', v_nemo,
            'role_in_org', 'owner',
            'tipo_agente', v_tipo_agente,
            'source', 'trial_signup_metadata'
          ));
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Backfill: trial users existentes con cammesa_nemo en metadata pero stuck en
-- onboarding_step != 'done'.
do $$
declare
  r record;
  v_descripcion text;
  v_tipo_agente text;
  v_agrupacion text;
  v_nemo text;
begin
  for r in
    select up.user_id, u.raw_user_meta_data as meta
    from public.user_profiles up
    join auth.users u on u.id = up.user_id
    where up.trial_status = 'active'
      and up.onboarding_step <> 'done'
      and (u.raw_user_meta_data ? 'cammesa_nemo')
  loop
    v_nemo := nullif(btrim(coalesce(r.meta->>'cammesa_nemo', '')), '');
    if v_nemo is null then
      continue;
    end if;

    select a.descripcion, a.tipo_agente, a.agrupacion
      into v_descripcion, v_tipo_agente, v_agrupacion
    from public.cammesa_agentes_mem a
    where a.nemo = v_nemo
    limit 1;

    if v_descripcion is null then
      continue;
    end if;

    insert into public.user_agentes (
      user_id, nemo, descripcion_snapshot, tipo_agente_snapshot, agrupacion_snapshot,
      role_in_org, verified_at, verification_source
    ) values (
      r.user_id, v_nemo, v_descripcion, v_tipo_agente, v_agrupacion,
      'owner', now(), 'self'
    )
    on conflict (user_id, nemo) do nothing;

    update public.user_profiles
       set onboarding_step = 'done'
     where user_id = r.user_id;

    insert into public.user_onboarding_audit (user_id, action, payload)
      values (r.user_id, 'agente_linked', jsonb_build_object(
        'nemo', v_nemo,
        'role_in_org', 'owner',
        'tipo_agente', v_tipo_agente,
        'source', 'trial_backfill'
      ));
  end loop;
end $$;
