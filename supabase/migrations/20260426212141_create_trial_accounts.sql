create extension if not exists pgcrypto with schema extensions;

create table public.trial_accounts (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash   text not null,
  full_name       text not null check (char_length(full_name) between 2 and 120),
  company         text not null check (char_length(company) between 1 and 160),
  cuit            text check (cuit is null or cuit ~ '^[0-9]{2}-?[0-9]{8}-?[0-9]{1}$'),
  tipo_empresa    text not null check (tipo_empresa in ('gran_usuario','gudi','comercializador','otro')),
  industria       text,
  demanda_kw      text,
  rol             text,
  telefono        text,
  plan_interes    text,
  fuente          text default 'landing-trial',
  accepts_terms   boolean not null default false,
  status          text not null default 'active' check (status in ('active','expired','suspended')),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  created_at      timestamptz not null default now()
);

alter table public.trial_accounts enable row level security;

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

  if char_length(p_password) < 12 then
    raise exception 'La contraseña debe tener al menos 12 caracteres';
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

revoke all on function public.create_trial_account(text,text,text,text,text,boolean,text,text,text,text,text,text) from public;
grant execute on function public.create_trial_account(text,text,text,text,text,boolean,text,text,text,text,text,text) to anon, authenticated;
