-- Módulo 5: Mercado Eléctrico Argentino (contexto público autenticado).
-- No crea vistas: las tablas fuente son chicas. Este archivo documenta las queries usadas.

-- Demanda + temperatura, fuente MEMnet (default).
select
  fecha,
  prevista,
  semana_ant,
  ayer,
  hoy,
  tem_prevista,
  tem_semana_ant,
  tem_ayer,
  tem_hoy
from public.cammesa_memnet_demanda_temperatura
where fecha >= (
  select max(fecha) - interval '90 days'
  from public.cammesa_memnet_demanda_temperatura
)
order by fecha;

-- Generación + porcentajes, fuente MEMnet (default).
select
  g.fecha,
  g.nuclear,
  g.termico,
  g.renovable_hidro_50mw,
  g.renovable_ley_26190,
  g.importacion,
  g.total,
  p.nuclear as nuclear_pct,
  p.termico as termico_pct,
  p.renovable_hidro_50mw as renovable_hidro_50mw_pct,
  p.renovable_ley_26190 as renovable_ley_26190_pct,
  p.importacion as importacion_pct
from public.cammesa_memnet_generacion g
left join public.cammesa_memnet_porcentaje_generacion p
  on p.fecha = g.fecha
where g.fecha >= (
  select max(fecha) - interval '90 days'
  from public.cammesa_memnet_generacion
)
order by g.fecha;

-- Manufacturero desestacionalizado.
select *
from public.cammesa_consumo_manufacturero_desestacionalizado
order by periodo desc
limit 60;
