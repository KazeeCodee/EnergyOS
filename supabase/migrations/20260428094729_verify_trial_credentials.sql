create or replace function public.verify_trial_credentials(p_email text, p_password text)
returns table (
  trial_id uuid,
  trial_user_id uuid,
  trial_status text,
  trial_expires_at timestamptz,
  trial_is_valid boolean
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    t.id,
    t.user_id,
    t.status,
    t.expires_at,
    extensions.crypt(p_password, t.password_hash) = t.password_hash
  from public.trial_accounts t
  where t.email = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.verify_trial_credentials(text, text) from public;
grant execute on function public.verify_trial_credentials(text, text) to service_role;

create or replace function public.set_trial_user_id(p_trial_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trial_accounts
  set user_id = p_user_id
  where id = p_trial_id;
$$;

revoke all on function public.set_trial_user_id(uuid, uuid) from public;
grant execute on function public.set_trial_user_id(uuid, uuid) to service_role;
