-- Ranking de oportunidades de ahorro.
-- Ejecutar en Railway Postgres. Solo crea objetos nuevos y lee marts existentes.

create or replace function public.refresh_oportunidades_ahorro(
  _anio int default null,
  _mes int default null,
  _nemo text default null
)
returns void
language plpgsql
as $$
begin
  refresh materialized view public.vw_oportunidades_ahorro_mensual;
end;
$$;

drop materialized view if exists public.vw_oportunidades_ahorro_mensual;

create materialized view public.vw_oportunidades_ahorro_mensual as
with dte_auditoria as (
  select
    d.nemo,
    d.tipo_agente,
    d.anio,
    d.mes,
    to_char(make_date(d.anio, d.mes, 1), 'YYYY-MM') as periodo_label,
    'DTE_AUDITORIA'::text as oportunidad_codigo,
    'Auditar liquidacion DTE'::text as oportunidad_nombre,
    'Controlar desvio o variacion de costo MEM antes de cerrar el periodo.'::text as dolor_cliente,
    'Revisar conceptos DTE, comparar con periodo anterior y documentar si corresponde reclamar o descartar.'::text as accion_recomendada,
    greatest(
      abs(coalesce(d.desvio_reconciliacion_pesos, 0)),
      coalesce(d.importe_revisable_pesos, 0)
    ) as impacto_estimado_pesos,
    case
      when d.estado_auditoria = 'revisar_reconciliacion' then 'alta'
      when d.estado_auditoria = 'variacion_mensual_alta' then 'media'
      else 'baja'
    end as prioridad,
    case
      when d.estado_auditoria = 'revisar_reconciliacion' then 'alta'
      else 'media'
    end as confianza,
    'auditoria-dte'::text as origen_modulo,
    'public.vw_factura_dte_resumen_mensual'::text as origen_tabla,
    jsonb_build_object(
      'factura_total_pesos', d.factura_total_pesos,
      'desvio_reconciliacion_pesos', d.desvio_reconciliacion_pesos,
      'variacion_mom_pct', d.variacion_mom_pct,
      'costo_dte_pesos_mwh', d.costo_dte_pesos_mwh,
      'estado_auditoria', d.estado_auditoria
    ) as detalle
  from public.vw_factura_dte_resumen_mensual d
  where d.estado_auditoria in ('revisar_reconciliacion', 'variacion_mensual_alta')
),
spot_cobertura as (
  select
    s.nemo,
    s.tipo_agente,
    s.anio,
    s.mes,
    to_char(make_date(s.anio, s.mes, 1), 'YYYY-MM') as periodo_label,
    'SPOT_COBERTURA'::text as oportunidad_codigo,
    'Reducir exposicion spot'::text as oportunidad_nombre,
    'La compra spot expone al agente a volatilidad y costos no planificados.'::text as dolor_cliente,
    'Evaluar cobertura contractual o reduccion de exposicion spot; el potencial usa una reduccion conservadora del 25% del costo spot.'::text as accion_recomendada,
    coalesce(s.spot_pesos, 0) * 0.25 as impacto_estimado_pesos,
    case
      when coalesce(s.pct_spot, 0) >= 0.4 or coalesce(s.spot_pesos, 0) >= 20000000 then 'alta'
      else 'media'
    end as prioridad,
    'media'::text as confianza,
    'exposicion-spot'::text as origen_modulo,
    'public.vw_exposicion_spot_mensual'::text as origen_tabla,
    jsonb_build_object(
      'demanda_real_mwh', s.demanda_real_mwh,
      'compra_spot_mwh', s.compra_spot_mwh,
      'pct_spot', s.pct_spot,
      'spot_pesos', s.spot_pesos,
      'costo_spot_promedio_pesos_mwh', s.costo_spot_promedio_pesos_mwh,
      'calidad_dato', s.calidad_dato
    ) as detalle
  from public.vw_exposicion_spot_mensual s
  where coalesce(s.pct_spot, 0) >= 0.2
    and coalesce(s.spot_pesos, 0) > 0
    and s.calidad_dato <> 'sin_demanda'
),
compliance_renovable as (
  select
    c.nemo,
    c.tipo_agente,
    c.anio,
    c.mes,
    to_char(make_date(c.anio, c.mes, 1), 'YYYY-MM') as periodo_label,
    'COMPLIANCE_RENOVABLE'::text as oportunidad_codigo,
    'Cerrar brecha renovable 27.191'::text as oportunidad_nombre,
    'La brecha renovable puede transformarse en multa o costo de cierre tardio.'::text as dolor_cliente,
    'Dimensionar energia renovable faltante y comparar alternativas de cierre antes del fin del periodo.'::text as accion_recomendada,
    coalesce(c.multa_estimada_pesos, 0) as impacto_estimado_pesos,
    case
      when coalesce(c.multa_estimada_pesos, 0) >= 10000000 then 'alta'
      else 'media'
    end as prioridad,
    case
      when c.multa_metodo = 'tabla_obligacion' then 'alta'
      else 'media'
    end as confianza,
    'cumplimiento-27191'::text as origen_modulo,
    'public.vw_compliance_27191_mensual'::text as origen_tabla,
    jsonb_build_object(
      'obligacion_pct', c.obligacion_pct,
      'pct_renovable_ytd', c.pct_renovable_ytd,
      'brecha_ytd_mwh', c.brecha_ytd_mwh,
      'multa_estimada_pesos', c.multa_estimada_pesos,
      'multa_metodo', c.multa_metodo,
      'cumple_ytd', c.cumple_ytd,
      'calidad_dato', c.calidad_dato
    ) as detalle
  from public.vw_compliance_27191_mensual c
  where coalesce(c.multa_estimada_pesos, 0) > 0
     or c.cumple_ytd = false
     or c.calidad_dato in ('brecha', 'sin_renovable')
),
consumo_desvio as (
  select
    c.nemo,
    c.tipo_agente,
    c.anio,
    c.mes,
    to_char(make_date(c.anio, c.mes, 1), 'YYYY-MM') as periodo_label,
    'CONSUMO_DESVIO'::text as oportunidad_codigo,
    'Investigar desvio de consumo'::text as oportunidad_nombre,
    'Una suba de consumo no explicada puede esconder ineficiencia operativa o cambio de proceso.'::text as dolor_cliente,
    'Comparar operacion, produccion y mediciones del mes contra el mismo mes del anio anterior.'::text as accion_recomendada,
    greatest(c.demanda_real_mwh - prev.demanda_real_mwh, 0)
      * coalesce(d.costo_dte_pesos_mwh, s.costo_spot_promedio_pesos_mwh, 0) as impacto_estimado_pesos,
    case
      when abs((c.demanda_real_mwh - prev.demanda_real_mwh) / nullif(prev.demanda_real_mwh, 0)) >= 0.5 then 'alta'
      else 'media'
    end as prioridad,
    'media'::text as confianza,
    'historia-energetica'::text as origen_modulo,
    'public.vw_consumo_gu_mensual'::text as origen_tabla,
    jsonb_build_object(
      'demanda_real_mwh', c.demanda_real_mwh,
      'demanda_mismo_mes_anio_anterior_mwh', prev.demanda_real_mwh,
      'variacion_yoy_pct', round((c.demanda_real_mwh - prev.demanda_real_mwh) / nullif(prev.demanda_real_mwh, 0), 6),
      'costo_dte_pesos_mwh', d.costo_dte_pesos_mwh
    ) as detalle
  from public.vw_consumo_gu_mensual c
  join public.vw_consumo_gu_mensual prev
    on prev.nemo = c.nemo
   and prev.anio = c.anio - 1
   and prev.mes = c.mes
  left join public.vw_factura_dte_resumen_mensual d
    on d.nemo = c.nemo
   and d.anio = c.anio
   and d.mes = c.mes
  left join public.vw_exposicion_spot_mensual s
    on s.nemo = c.nemo
   and s.anio = c.anio
   and s.mes = c.mes
  where c.demanda_real_mwh is not null
    and prev.demanda_real_mwh > 0
    and c.demanda_real_mwh > prev.demanda_real_mwh
    and abs((c.demanda_real_mwh - prev.demanda_real_mwh) / prev.demanda_real_mwh) >= 0.25
    and abs(c.demanda_real_mwh - prev.demanda_real_mwh) >= 10
),
acciones_abiertas as (
  select
    a.nemo,
    a.tipo_agente,
    a.anio,
    a.mes,
    a.periodo_label,
    'ACCIONES_ABIERTAS'::text as oportunidad_codigo,
    'Cerrar acciones energeticas abiertas'::text as oportunidad_nombre,
    'Hay acciones detectadas sin resolucion; el valor se pierde si no se gestionan.'::text as dolor_cliente,
    'Priorizar responsables, resolver pendientes y registrar decision para cerrar el ciclo operativo.'::text as accion_recomendada,
    sum(coalesce(a.impacto_estimado_pesos, 0)) * 0.15 as impacto_estimado_pesos,
    case
      when count(*) filter (where a.severidad = 'critica') > 0 then 'alta'
      when count(*) filter (where a.severidad = 'alta') >= 3 then 'alta'
      else 'media'
    end as prioridad,
    'media'::text as confianza,
    'acciones'::text as origen_modulo,
    'public.acciones_energeticas'::text as origen_tabla,
    jsonb_build_object(
      'acciones_abiertas', count(*),
      'criticas', count(*) filter (where a.severidad = 'critica'),
      'altas', count(*) filter (where a.severidad = 'alta'),
      'pendientes', count(*) filter (where a.estado = 'pendiente'),
      'en_revision', count(*) filter (where a.estado = 'en_revision')
    ) as detalle
  from public.acciones_energeticas a
  where a.estado in ('pendiente', 'en_revision')
  group by a.nemo, a.tipo_agente, a.anio, a.mes, a.periodo_label
),
normalizadas as (
  select * from dte_auditoria
  union all select * from spot_cobertura
  union all select * from compliance_renovable
  union all select * from consumo_desvio
  union all select * from acciones_abiertas
),
scored as (
  select
    *,
    case prioridad when 'alta' then 1.4 when 'media' then 1.15 else 1.0 end as prioridad_score,
    case confianza when 'alta' then 1.0 when 'media' then 0.85 else 0.7 end as confianza_score
  from normalizadas
  where coalesce(impacto_estimado_pesos, 0) > 0
)
select
  row_number() over (
    partition by nemo
    order by
      (impacto_estimado_pesos * prioridad_score * confianza_score) desc,
      impacto_estimado_pesos desc
  )::int as ranking_nemo,
  nemo,
  tipo_agente,
  anio,
  mes,
  periodo_label,
  oportunidad_codigo,
  oportunidad_nombre,
  dolor_cliente,
  accion_recomendada,
  impacto_estimado_pesos,
  prioridad,
  confianza,
  round((impacto_estimado_pesos * prioridad_score * confianza_score)::numeric, 6) as ranking_score,
  origen_modulo,
  origen_tabla,
  detalle
from scored
with no data;

create index if not exists vw_oportunidades_ahorro_nemo_rank_idx
  on public.vw_oportunidades_ahorro_mensual (nemo, ranking_nemo);

create index if not exists vw_oportunidades_ahorro_nemo_period_idx
  on public.vw_oportunidades_ahorro_mensual (nemo, anio desc, mes desc);

create index if not exists vw_oportunidades_ahorro_period_rank_idx
  on public.vw_oportunidades_ahorro_mensual (anio desc, mes desc, ranking_score desc);
