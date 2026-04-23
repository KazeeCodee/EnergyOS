drop policy if exists empresas_admin_all on public.empresas;
create policy empresas_admin_all
  on public.empresas
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists nemos_admin_all on public.nemos;
create policy nemos_admin_all
  on public.nemos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists contratos_admin_all on public.contratos;
create policy contratos_admin_all
  on public.contratos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists datos_mensuales_admin_all on public.datos_mensuales;
create policy datos_mensuales_admin_all
  on public.datos_mensuales
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists datos_mercado_admin_all on public.datos_mercado;
create policy datos_mercado_admin_all
  on public.datos_mercado
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
