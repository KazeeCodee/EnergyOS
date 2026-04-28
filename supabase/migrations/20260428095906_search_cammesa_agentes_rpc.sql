create or replace function public.search_cammesa_agentes(p_q text, p_limit int default 12)
returns table(
  nemo text,
  descripcion text,
  agrupacion text,
  tipo_agente text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.nemo,
    a.descripcion,
    a.agrupacion,
    a.tipo_agente
  from public.cammesa_agentes_mem a
  where coalesce(p_q, '') = ''
     or a.descripcion ilike '%' || p_q || '%'
     or a.nemo ilike '%' || p_q || '%'
  order by a.descripcion
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;

revoke all on function public.search_cammesa_agentes(text, int) from public;
grant execute on function public.search_cammesa_agentes(text, int) to anon, authenticated, service_role;
