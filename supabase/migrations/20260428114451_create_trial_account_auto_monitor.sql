create or replace function public.create_trial_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_company text,
  p_tipo_empresa text,
  p_accepts_terms boolean,
  p_cuit text default null,
  p_industria text default null,
  p_demanda_kw text default null,
  p_rol text default null,
  p_telefono text default null,
  p_plan_interes text default null,
  p_cammesa_nemo text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
  v_nemo text;
  v_agente record;
begin
  if p_accepts_terms is not true then
    raise exception 'Debe aceptar los términos y condiciones';
  end if;

  if char_length(p_password) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;

  if p_password !~ '[A-Z]' then
    raise exception 'La contraseña debe contener al menos una letra mayúscula';
  end if;

  if p_password !~ '[a-z]' then
    raise exception 'La contraseña debe contener al menos una letra minúscula';
  end if;

  if p_password !~ '[0-9]' then
    raise exception 'La contraseña debe contener al menos un número';
  end if;

  v_nemo := nullif(upper(trim(coalesce(p_cammesa_nemo, ''))), '');

  if v_nemo is not null then
    select id, nemo, descripcion, agrupacion, tipo_agente
      into v_agente
    from public.cammesa_agentes_mem
    where nemo = v_nemo
    limit 1;

    if v_agente.id is null then
      v_nemo := null;
    else
      insert into public.agentes_monitoreados (
        cammesa_agente_id, nemo, razon_social, tipo_agente, agrupacion,
        activo, seguimiento_desde
      ) values (
        v_agente.id, v_agente.nemo,
        coalesce(v_agente.descripcion, p_company),
        v_agente.tipo_agente, v_agente.agrupacion,
        true, current_date
      )
      on conflict (nemo) do update
        set activo = true,
            cammesa_agente_id = excluded.cammesa_agente_id,
            tipo_agente = coalesce(excluded.tipo_agente, public.agentes_monitoreados.tipo_agente),
            agrupacion = coalesce(excluded.agrupacion, public.agentes_monitoreados.agrupacion);
    end if;
  end if;

  insert into public.trial_accounts (
    email, password_hash, full_name, company, cuit, tipo_empresa,
    industria, demanda_kw, rol, telefono, plan_interes, accepts_terms,
    cammesa_nemo
  ) values (
    lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    p_full_name, p_company, p_cuit, p_tipo_empresa,
    p_industria, p_demanda_kw, p_rol, p_telefono, p_plan_interes, p_accepts_terms,
    v_nemo
  ) returning id into v_id;

  return v_id;
end;
$function$;
