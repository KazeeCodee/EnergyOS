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
  p_plan_interes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
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

  insert into public.trial_accounts (
    email, password_hash, full_name, company, cuit, tipo_empresa,
    industria, demanda_kw, rol, telefono, plan_interes, accepts_terms
  ) values (
    lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    p_full_name, p_company, p_cuit, p_tipo_empresa,
    p_industria, p_demanda_kw, p_rol, p_telefono, p_plan_interes, p_accepts_terms
  ) returning id into v_id;

  return v_id;
end;
$$;
