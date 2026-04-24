drop index if exists public.empresas_user_id_key;

alter table public.empresas
  alter column user_id drop not null,
  alter column acuerdo_mensual_mwh drop not null,
  drop constraint if exists empresas_tipo_usuario_check;
