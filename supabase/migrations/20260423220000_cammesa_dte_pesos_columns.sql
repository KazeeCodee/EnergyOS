alter table public.datos_mensuales
  add column if not exists importe_mater_pesos decimal null,
  add column if not exists precio_efectivo_pesos_mwh decimal null,
  add column if not exists cargo_transporte_pesos_mwh decimal null,
  add column if not exists precio_spot_pesos_mwh decimal null;

alter table public.datos_mercado
  add column if not exists precio_spot_pico_pesos_mwh decimal null,
  add column if not exists precio_spot_valle_pesos_mwh decimal null,
  add column if not exists precio_spot_resto_pesos_mwh decimal null,
  add column if not exists cargo_transporte_pesos_mwh decimal null;
