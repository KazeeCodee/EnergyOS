alter table public.trial_accounts
  add column if not exists cammesa_nemo text;

create index if not exists trial_accounts_cammesa_nemo_idx
  on public.trial_accounts(cammesa_nemo)
  where cammesa_nemo is not null;

create or replace function public.current_trial_nemo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.cammesa_nemo
  from public.trial_accounts t
  where t.user_id = auth.uid()
    and t.status = 'active'
    and t.expires_at > now()
  limit 1;
$$;

revoke all on function public.current_trial_nemo() from public;
grant execute on function public.current_trial_nemo() to anon, authenticated, service_role;

drop policy if exists "agentes_monitoreados_trial_select" on public.agentes_monitoreados;
create policy "agentes_monitoreados_trial_select" on public.agentes_monitoreados
  for select to authenticated
  using (nemo = public.current_trial_nemo());

drop policy if exists "datos_mensuales_trial_select" on public.datos_mensuales;
create policy "datos_mensuales_trial_select" on public.datos_mensuales
  for select to authenticated
  using (nemo = public.current_trial_nemo());

drop policy if exists "procesamiento_empresas_trial_select" on public.procesamiento_empresas;
create policy "procesamiento_empresas_trial_select" on public.procesamiento_empresas
  for select to authenticated
  using (
    exists (
      select 1
      from public.agentes_monitoreados am
      where am.id = procesamiento_empresas.empresa_id
        and am.nemo = public.current_trial_nemo()
    )
  );

drop policy if exists "procesamientos_trial_select" on public.procesamientos;
create policy "procesamientos_trial_select" on public.procesamientos
  for select to authenticated
  using (
    exists (
      select 1
      from public.procesamiento_empresas pe
      join public.agentes_monitoreados am on am.id = pe.empresa_id
      where pe.procesamiento_id = procesamientos.id
        and am.nemo = public.current_trial_nemo()
    )
  );
