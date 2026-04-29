-- Algunos registros historicos de RSCJ traen solo agente en col_001.
-- Preservamos la fila con distribuidor_nemo NULL en vez de inventar contraparte.

alter table public.cuenta_corriente_agente
  alter column distribuidor_nemo drop not null;
