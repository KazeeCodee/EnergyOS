ALTER TABLE public.datos_mensuales
  ADD COLUMN IF NOT EXISTS dato_sospechoso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sospechoso_motivo text;

CREATE INDEX IF NOT EXISTS idx_datos_mensuales_sospechoso
  ON public.datos_mensuales(dato_sospechoso)
  WHERE dato_sospechoso = true;

ALTER TABLE public.datos_mercado
  ALTER COLUMN precio_spot_usd_mwh DROP NOT NULL,
  ALTER COLUMN costo_cammesa_usd_mwh DROP NOT NULL;

UPDATE public.datos_mercado
  SET precio_spot_usd_mwh = NULL
  WHERE precio_spot_usd_mwh = 0;

UPDATE public.datos_mercado
  SET costo_cammesa_usd_mwh = NULL
  WHERE costo_cammesa_usd_mwh = 0;
