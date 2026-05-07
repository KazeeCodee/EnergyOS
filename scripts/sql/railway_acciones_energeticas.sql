-- Acciones energeticas operativas.
-- Ejecutar en Railway Postgres. Crea objetos nuevos y lee marts existentes.

create table if not exists public.acciones_energeticas (
  id bigserial primary key,
  nemo text not null,
  tipo_agente text null,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  periodo_label text not null,
  regla_codigo text not null,
  titulo text not null,
  descripcion text not null,
  severidad text not null check (severidad in ('critica', 'alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_revision', 'resuelta', 'descartada')),
  impacto_estimado_pesos numeric null,
  origen_modulo text not null,
  origen_tabla text not null,
  detalle jsonb not null default '{}'::jsonb,
  generada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  resuelta_en timestamptz null,
  comentario_ultimo text null
);

create unique index if not exists acciones_energeticas_regla_uidx
  on public.acciones_energeticas (nemo, anio, mes, regla_codigo);

create index if not exists acciones_energeticas_nemo_estado_period_idx
  on public.acciones_energeticas (nemo, estado, anio desc, mes desc);

create index if not exists acciones_energeticas_period_idx
  on public.acciones_energeticas (anio desc, mes desc);

create table if not exists public.acciones_energeticas_eventos (
  id bigserial primary key,
  accion_id bigint not null references public.acciones_energeticas(id) on delete cascade,
  actor_user_id uuid null,
  estado_anterior text null,
  estado_nuevo text null,
  comentario text null,
  creado_en timestamptz not null default now()
);

create index if not exists acciones_energeticas_eventos_accion_idx
  on public.acciones_energeticas_eventos (accion_id, creado_en desc);

create or replace function public.refresh_acciones_energeticas(
  _anio int default null,
  _mes int default null,
  _nemo text default null
)
returns void
language plpgsql
as $$
begin
  delete from public.acciones_energeticas a
  where (_anio is null or a.anio = _anio)
    and (_mes is null or a.mes = _mes)
    and (_nemo is null or a.nemo = upper(_nemo))
    and a.estado in ('pendiente', 'en_revision');

  insert into public.acciones_energeticas (
    nemo,
    tipo_agente,
    anio,
    mes,
    periodo_label,
    regla_codigo,
    titulo,
    descripcion,
    severidad,
    impacto_estimado_pesos,
    origen_modulo,
    origen_tabla,
    detalle,
    generada_en,
    actualizada_en
  )
  with periodos_operativos as (
    select max(make_date(anio, mes, 1)) as ultimo_periodo
    from public.vw_consumo_gu_mensual
  ),
  dte_reconciliacion as (
    select
      d.nemo,
      d.tipo_agente,
      d.anio,
      d.mes,
      to_char(make_date(d.anio, d.mes, 1), 'YYYY-MM') as periodo_label,
      'DTE_RECONCILIACION'::text as regla_codigo,
      'Revisar cierre de liquidacion DTE'::text as titulo,
      'La liquidacion DTE no reconcilia contra el subtotal de conceptos parseados.'::text as descripcion,
      case
        when abs(coalesce(d.desvio_reconciliacion_pesos, 0)) >= 10000000 then 'critica'
        else 'alta'
      end as severidad,
      abs(d.desvio_reconciliacion_pesos) as impacto_estimado_pesos,
      'auditoria-dte'::text as origen_modulo,
      'public.vw_factura_dte_resumen_mensual'::text as origen_tabla,
      jsonb_build_object(
        'factura_total_pesos', d.factura_total_pesos,
        'subtotal_conceptos_pesos', d.subtotal_conceptos_pesos,
        'desvio_reconciliacion_pesos', d.desvio_reconciliacion_pesos,
        'desvio_reconciliacion_pct', d.desvio_reconciliacion_pct,
        'estado_auditoria', d.estado_auditoria
      ) as detalle
    from public.vw_factura_dte_resumen_mensual d
    cross join periodos_operativos p
    where d.estado_auditoria = 'revisar_reconciliacion'
      and (_anio is null or d.anio = _anio)
      and (_mes is null or d.mes = _mes)
      and (_nemo is null or d.nemo = upper(_nemo))
      and (_anio is not null or make_date(d.anio, d.mes, 1) >= p.ultimo_periodo - interval '11 months')
  ),
  dte_variacion as (
    select
      d.nemo,
      d.tipo_agente,
      d.anio,
      d.mes,
      to_char(make_date(d.anio, d.mes, 1), 'YYYY-MM') as periodo_label,
      'DTE_VARIACION_ALTA'::text as regla_codigo,
      'Analizar aumento de costo MEM/DTE'::text as titulo,
      'El costo DTE muestra una variacion mensual alta y conviene explicar la causa.'::text as descripcion,
      case
        when coalesce(d.importe_revisable_pesos, 0) >= 10000000 then 'alta'
        else 'media'
      end as severidad,
      d.importe_revisable_pesos as impacto_estimado_pesos,
      'auditoria-dte'::text as origen_modulo,
      'public.vw_factura_dte_resumen_mensual'::text as origen_tabla,
      jsonb_build_object(
        'factura_total_pesos', d.factura_total_pesos,
        'variacion_mom_pct', d.variacion_mom_pct,
        'costo_dte_pesos_mwh', d.costo_dte_pesos_mwh,
        'importe_revisable_pesos', d.importe_revisable_pesos
      ) as detalle
    from public.vw_factura_dte_resumen_mensual d
    cross join periodos_operativos p
    where d.estado_auditoria = 'variacion_mensual_alta'
      and (_anio is null or d.anio = _anio)
      and (_mes is null or d.mes = _mes)
      and (_nemo is null or d.nemo = upper(_nemo))
      and (_anio is not null or make_date(d.anio, d.mes, 1) >= p.ultimo_periodo - interval '11 months')
  ),
  spot_alta as (
    select
      s.nemo,
      s.tipo_agente,
      s.anio,
      s.mes,
      to_char(make_date(s.anio, s.mes, 1), 'YYYY-MM') as periodo_label,
      'SPOT_ALTA'::text as regla_codigo,
      'Evaluar exposicion a compra spot'::text as titulo,
      'La participacion de compra spot del mes es alta frente a la demanda real.'::text as descripcion,
      case
        when coalesce(s.pct_spot, 0) >= 0.4 or coalesce(s.spot_pesos, 0) >= 20000000 then 'alta'
        else 'media'
      end as severidad,
      nullif(s.spot_pesos, 0) as impacto_estimado_pesos,
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
    cross join periodos_operativos p
    where coalesce(s.pct_spot, 0) >= 0.2
      and coalesce(s.compra_spot_mwh, 0) > 0
      and s.calidad_dato <> 'sin_demanda'
      and (_anio is null or s.anio = _anio)
      and (_mes is null or s.mes = _mes)
      and (_nemo is null or s.nemo = upper(_nemo))
      and (_anio is not null or make_date(s.anio, s.mes, 1) >= p.ultimo_periodo - interval '11 months')
  ),
  compliance_brecha as (
    select
      c.nemo,
      c.tipo_agente,
      c.anio,
      c.mes,
      to_char(make_date(c.anio, c.mes, 1), 'YYYY-MM') as periodo_label,
      'COMPLIANCE_BRECHA'::text as regla_codigo,
      'Revisar plan de cierre renovable'::text as titulo,
      'El agente presenta brecha renovable o multa estimada bajo Ley 27.191.'::text as descripcion,
      case
        when coalesce(c.multa_estimada_pesos, 0) >= 10000000 then 'alta'
        else 'media'
      end as severidad,
      nullif(c.multa_estimada_pesos, 0) as impacto_estimado_pesos,
      'cumplimiento-27191'::text as origen_modulo,
      'public.vw_compliance_27191_mensual'::text as origen_tabla,
      jsonb_build_object(
        'obligacion_pct', c.obligacion_pct,
        'pct_renovable_real', c.pct_renovable_real,
        'pct_renovable_ytd', c.pct_renovable_ytd,
        'brecha_mwh', c.brecha_mwh,
        'brecha_ytd_mwh', c.brecha_ytd_mwh,
        'multa_estimada_pesos', c.multa_estimada_pesos,
        'cumple_mes', c.cumple_mes,
        'cumple_ytd', c.cumple_ytd,
        'calidad_dato', c.calidad_dato
      ) as detalle
    from public.vw_compliance_27191_mensual c
    cross join periodos_operativos p
    where (coalesce(c.multa_estimada_pesos, 0) > 0 or c.cumple_ytd = false or c.calidad_dato in ('brecha', 'sin_renovable'))
      and (_anio is null or c.anio = _anio)
      and (_mes is null or c.mes = _mes)
      and (_nemo is null or c.nemo = upper(_nemo))
      and (_anio is not null or make_date(c.anio, c.mes, 1) >= p.ultimo_periodo - interval '11 months')
  ),
  consumo_variacion as (
    select
      c.nemo,
      c.tipo_agente,
      c.anio,
      c.mes,
      to_char(make_date(c.anio, c.mes, 1), 'YYYY-MM') as periodo_label,
      'CONSUMO_VARIACION'::text as regla_codigo,
      'Analizar desvio de consumo mensual'::text as titulo,
      'La demanda real cambio fuerte contra el mismo mes del anio anterior.'::text as descripcion,
      case
        when abs((c.demanda_real_mwh - prev.demanda_real_mwh) / nullif(prev.demanda_real_mwh, 0)) >= 0.5 then 'alta'
        else 'media'
      end as severidad,
      null::numeric as impacto_estimado_pesos,
      'historia-energetica'::text as origen_modulo,
      'public.vw_consumo_gu_mensual'::text as origen_tabla,
      jsonb_build_object(
        'demanda_real_mwh', c.demanda_real_mwh,
        'demanda_mismo_mes_anio_anterior_mwh', prev.demanda_real_mwh,
        'variacion_yoy_pct', round((c.demanda_real_mwh - prev.demanda_real_mwh) / nullif(prev.demanda_real_mwh, 0), 6)
      ) as detalle
    from public.vw_consumo_gu_mensual c
    cross join periodos_operativos p
    join public.vw_consumo_gu_mensual prev
      on prev.nemo = c.nemo
     and prev.anio = c.anio - 1
     and prev.mes = c.mes
    where c.demanda_real_mwh is not null
      and prev.demanda_real_mwh > 0
      and abs((c.demanda_real_mwh - prev.demanda_real_mwh) / prev.demanda_real_mwh) >= 0.25
      and abs(c.demanda_real_mwh - prev.demanda_real_mwh) >= 10
      and (_anio is null or c.anio = _anio)
      and (_mes is null or c.mes = _mes)
      and (_nemo is null or c.nemo = upper(_nemo))
      and (_anio is not null or make_date(c.anio, c.mes, 1) >= p.ultimo_periodo - interval '11 months')
  ),
  nuevas as (
    select * from dte_reconciliacion
    union all select * from dte_variacion
    union all select * from spot_alta
    union all select * from compliance_brecha
    union all select * from consumo_variacion
  )
  select distinct on (nemo, anio, mes, regla_codigo)
    nemo,
    tipo_agente,
    anio,
    mes,
    periodo_label,
    regla_codigo,
    titulo,
    descripcion,
    severidad,
    impacto_estimado_pesos,
    origen_modulo,
    origen_tabla,
    detalle,
    now(),
    now()
  from nuevas
  order by nemo, anio, mes, regla_codigo, impacto_estimado_pesos desc nulls last
  on conflict (nemo, anio, mes, regla_codigo) do update set
    tipo_agente = excluded.tipo_agente,
    periodo_label = excluded.periodo_label,
    titulo = excluded.titulo,
    descripcion = excluded.descripcion,
    severidad = excluded.severidad,
    estado = public.acciones_energeticas.estado,
    impacto_estimado_pesos = excluded.impacto_estimado_pesos,
    origen_modulo = excluded.origen_modulo,
    origen_tabla = excluded.origen_tabla,
    detalle = excluded.detalle,
    actualizada_en = now();
end;
$$;
