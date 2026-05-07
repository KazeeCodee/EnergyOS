-- =============================================================================
-- combustibles_precios_mensual
--
-- Origen: Informe "Consumos y precios Combustibles" de CAMMESA
--   (https://cammesaweb.cammesa.com/informes-de-combustibles/)
-- Granularidad: 1 fila por mes, agregada nivel sistema MEM.
-- Cobertura inicial: 2021-01 → 2026-03 (63 meses).
--
-- Uso primario: alimentar el cálculo de multa Ley 27.191 en
--   vw_compliance_27191_mensual (reemplaza el fallback "precio MATER promedio"
--   por el costo real de combustibles alternativos del sistema, que es lo que
--   pide el Art. 11 de la ley: CVP de gasoil/fueloil promedio 12 meses).
--
-- Patrón canónico EnergyOS para tablas mensuales:
--   - id bigserial primary key
--   - anio int + mes int (clave de negocio)
--   - columnas tipadas
--   - source_file + parser_version (trazabilidad)
--   - procesado_en (auditoría)
--   - unique index (anio, mes)
--   - RLS habilitado
-- =============================================================================

create table if not exists public.combustibles_precios_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  n_dias int null,

  -- Consumo físico [Mm3/d]
  consumo_mm3_d_gn numeric null,
  consumo_mm3_d_alt numeric null,
  consumo_mm3_d_total numeric null,

  -- Precio combustible [u$s/MMBtu]
  precio_comb_usd_mmbtu_gn numeric null,
  precio_comb_usd_mmbtu_alt numeric null,
  precio_comb_usd_mmbtu_total numeric null,

  -- Monto combustible [Mmu$s]
  monto_comb_mmusd_gn numeric null,
  monto_comb_mmusd_alt numeric null,
  monto_comb_mmusd_total numeric null,

  -- Generación [MWh]
  generacion_mwh_gn numeric null,
  generacion_mwh_alt numeric null,
  generacion_mwh_total numeric null,

  -- Costo OyM [u$s/MWh]
  costo_oym_usd_mwh_gn numeric null,
  costo_oym_usd_mwh_alt numeric null,
  costo_oym_usd_mwh_total numeric null,

  -- Costo Combustible [u$s/MWh]
  costo_comb_usd_mwh_gn numeric null,
  costo_comb_usd_mwh_alt numeric null,
  costo_comb_usd_mwh_total numeric null,

  -- Costo Total [u$s/MWh] ⭐ campo clave para Ley 27.191
  -- (es el "CVP" promedio mensual ponderado por generación)
  costo_total_usd_mwh_gn numeric null,
  costo_total_usd_mwh_alt numeric null,
  costo_total_usd_mwh_total numeric null,

  -- Trazabilidad
  source_file text null,
  parser_version text not null default 'combustibles_historico_v1',
  procesado_en timestamptz not null default now()
);

-- Unique por (anio, mes) — clave de negocio
create unique index if not exists combustibles_precios_mensual_periodo_uidx
  on public.combustibles_precios_mensual(anio, mes);

-- Index secundario para consultas por año
create index if not exists combustibles_precios_mensual_anio_idx
  on public.combustibles_precios_mensual(anio);

-- Comentarios para autodocumentación
comment on table public.combustibles_precios_mensual is
  'Histórico mensual de costos y precios de combustibles del MEM (CAMMESA - Informe Consumos y precios Combustibles). Alimenta el cálculo de multa Ley 27.191.';

comment on column public.combustibles_precios_mensual.costo_total_usd_mwh_alt is
  'CVP promedio del sistema para combustibles alternativos (gasoil + fuel oil + carbón) ponderado por generación. Referencia para la multa por incumplimiento Ley 27.191 Art. 11.';

-- Nota: NO se aplica RLS en Railway (igual que las otras tablas L3 del proyecto).
-- El acceso desde frontend pasa por Edge Functions Deno que validan permisos
-- contra Supabase Auth antes de querear Railway (patrón consistente con
-- vw_compliance_27191_mensual, vw_exposicion_spot_mensual, etc).
