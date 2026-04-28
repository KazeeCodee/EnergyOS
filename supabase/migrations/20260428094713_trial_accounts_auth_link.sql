alter table public.trial_accounts
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists trial_accounts_user_id_key
  on public.trial_accounts(user_id)
  where user_id is not null;

drop policy if exists "trial_accounts_self_select" on public.trial_accounts;
create policy "trial_accounts_self_select" on public.trial_accounts
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.is_trial_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trial_accounts
    where user_id = p_user_id
      and status = 'active'
      and expires_at > now()
  );
$$;

revoke all on function public.is_trial_active(uuid) from public;
grant execute on function public.is_trial_active(uuid) to anon, authenticated, service_role;
