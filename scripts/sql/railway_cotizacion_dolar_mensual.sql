-- =============================================================================
-- cotizacion_dolar_mensual
--
-- Origen: archivo ADCO del DTE CAMMESA (raw_adco en Railway). El parser extrae
-- la "Cotizacion Dolar Mayorista BCRA" que CAMMESA imprime en filas 9-11 del
-- preambulo del archivo ADCO mensual.
--
-- Mismo patron que cammesa_parametros_mensuales_v2 (Supabase) pero corriendo
-- contra Railway. Asi no hay que sincronizar entre DBs.
--
-- Idempotente: el refresh borra y recarga, manteniendo todas las filas siempre
-- actualizadas con el ultimo parse de raw_adco.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cotizacion_dolar_mensual (
  anio int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cotizacion_ars numeric NOT NULL,
  fuente text NOT NULL DEFAULT 'BCRA Mayorista (ADCO/DTE)',
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);

CREATE INDEX IF NOT EXISTS cotizacion_dolar_mensual_anio_idx
  ON public.cotizacion_dolar_mensual(anio);

COMMENT ON TABLE public.cotizacion_dolar_mensual IS
  'Cotizacion mensual del dolar mayorista BCRA, extraida del archivo ADCO del DTE CAMMESA. Usada para conversion USD->ARS en marts L3 (e.g. multa Ley 27.191).';

-- =============================================================================
-- refresh_cotizacion_dolar_mensual()
--   Reextrae todas las cotizaciones desde raw_adco. Idempotente.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.refresh_cotizacion_dolar_mensual()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted int;
BEGIN
  WITH adco_pre AS (
    SELECT r.anio, r.mes, r.raw_text, r.id
    FROM public.raw_adco r
    WHERE r.source_row IN (9, 10, 11)
      AND r.raw_text IS NOT NULL
  ),
  adco_concat AS (
    SELECT anio, mes,
           string_agg(raw_text, ' | ' ORDER BY id) AS txt
    FROM adco_pre
    GROUP BY anio, mes
  ),
  parsed AS (
    SELECT anio, mes,
           public.parse_es_number(
             (regexp_match(txt, 'Cotizacion Dolar Mayorista BCRA\s*:\s*(-?[0-9][0-9 .,]*)'))[1]
           ) AS cotizacion_ars
    FROM adco_concat
  ),
  ins AS (
    INSERT INTO public.cotizacion_dolar_mensual (anio, mes, cotizacion_ars)
    SELECT anio, mes, cotizacion_ars
    FROM parsed
    WHERE cotizacion_ars IS NOT NULL AND cotizacion_ars > 0
    ON CONFLICT (anio, mes) DO UPDATE SET
      cotizacion_ars = EXCLUDED.cotizacion_ars,
      procesado_en = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- Cargar inmediatamente al aplicar la migracion
SELECT public.refresh_cotizacion_dolar_mensual() AS rows_loaded;
