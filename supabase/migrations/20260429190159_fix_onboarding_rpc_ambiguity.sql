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

  execute
    'insert into public.user_profiles (user_id, role, onboarding_step)
       values ($1, $2, ''agente'')
     on conflict (user_id) do nothing'
    using v_uid, p_role;

  execute
    'update public.user_profiles as up
        set role = $2,
            onboarding_step = case
                                when up.onboarding_step = ''role'' then ''agente''
                                else up.onboarding_step
                              end
      where up.user_id = $1'
    using v_uid, p_role;

  execute
    'insert into public.user_onboarding_audit (user_id, action, payload)
       values ($1, ''role_set'', jsonb_build_object(''role'', $2))'
    using v_uid, p_role;

  return query execute
    'select up.user_id, up.role, up.onboarding_step
       from public.user_profiles up
      where up.user_id = $1'
    using v_uid;
end;
$$;

revoke all on function public.set_user_role(text) from public;
grant execute on function public.set_user_role(text) to authenticated;

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

  execute
    'select a.descripcion, a.tipo_agente, a.agrupacion
       from public.cammesa_agentes_mem a
      where a.nemo = $1
      limit 1'
    into v_descripcion, v_tipo, v_agrupacion
    using p_nemo;

  if v_descripcion is null then
    raise exception 'nemo not found in cammesa_agentes_mem: %', p_nemo;
  end if;

  execute
    'insert into public.user_agentes (
       user_id, nemo, descripcion_snapshot, tipo_agente_snapshot, agrupacion_snapshot,
       role_in_org, verified_at, verification_source
     ) values (
       $1, $2, $3, $4, $5,
       $6, now(), ''self''
     )
     on conflict (user_id, nemo) do update
       set role_in_org          = excluded.role_in_org,
           descripcion_snapshot = excluded.descripcion_snapshot,
           tipo_agente_snapshot = excluded.tipo_agente_snapshot,
           agrupacion_snapshot  = excluded.agrupacion_snapshot
     returning id'
    into v_id
    using v_uid, p_nemo, v_descripcion, v_tipo, v_agrupacion, p_role_in_org;

  execute
    'update public.user_profiles
        set onboarding_step = ''done''
      where user_id = $1
        and onboarding_step in (''agente'', ''verify'')'
    using v_uid;

  execute
    'insert into public.user_onboarding_audit (user_id, action, payload)
       values ($1, ''agente_linked'', jsonb_build_object(
         ''nemo'', $2,
         ''role_in_org'', $3,
         ''tipo_agente'', $4
       ))'
    using v_uid, p_nemo, p_role_in_org, v_tipo;

  return query execute
    'select $1::uuid, $2::text, $3::text, $4::text, $5::text'
    using v_id, p_nemo, v_descripcion, v_tipo, v_agrupacion;
end;
$$;

revoke all on function public.link_user_agente(text, text) from public;
grant execute on function public.link_user_agente(text, text) to authenticated;
