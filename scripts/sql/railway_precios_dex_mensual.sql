-- =============================================================================
-- vw_precios_dex_mensual
--
-- Origen: archivo DEXC del DTE CAMMESA (raw_dexc en Railway). El parser extrae
-- los "Prec.Dem.Exc" que CAMMESA imprime en filas 9-11 del preambulo del DEXC,
-- separados por tipo de dia (habil/sabado/domingo) y banda (valle/diurna/pico).
--
-- Mismo regex que cammesa_parametros_mensuales_v2 (Supabase) pero corriendo
-- contra Railway directamente. Asi no hay que sincronizar entre DBs.
--
-- Uso primario: alimentar el calculo de compra_spot_pesos de clientes GUDI
-- en vw_consumo_gu_mensual (Fix #2 de Fase A).
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.vw_precios_dex_mensual;

CREATE MATERIALIZED VIEW public.vw_precios_dex_mensual AS
WITH dexc_pre AS (
  SELECT
    r.anio, r.mes, r.id, r.raw_text,
    lower(substring(r.raw_text from 'Dias\s+(\w+)')) AS dia_tipo
  FROM public.raw_dexc r
  WHERE r.source_row IN (9, 10, 11)
    AND r.raw_text IS NOT NULL
    AND r.raw_text ILIKE 'Prec.Dem.Exc%'
),
dexc_extract AS (
  SELECT
    anio, mes, dia_tipo,
    regexp_matches(
      raw_text,
      ':\s*(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)',
      ''
    ) AS g
  FROM dexc_pre
),
dexc_long AS (
  SELECT anio, mes, dia_tipo, 'valle'  AS banda, public.parse_es_number(g[1]) AS precio_pesos_mwh FROM dexc_extract
  UNION ALL
  SELECT anio, mes, dia_tipo, 'diurna' AS banda, public.parse_es_number(g[2]) FROM dexc_extract
  UNION ALL
  SELECT anio, mes, dia_tipo, 'pico'   AS banda, public.parse_es_number(g[3]) FROM dexc_extract
)
SELECT
  anio,
  mes,
  -- Promedios por mes (todas las combinaciones dia × banda)
  avg(precio_pesos_mwh) FILTER (WHERE precio_pesos_mwh IS NOT NULL) AS precio_dex_promedio_pesos_mwh,
  -- Promedios por banda (cualquier tipo de dia)
  avg(precio_pesos_mwh) FILTER (WHERE banda = 'pico'   AND precio_pesos_mwh IS NOT NULL) AS precio_dex_pico_promedio_pesos_mwh,
  avg(precio_pesos_mwh) FILTER (WHERE banda = 'valle'  AND precio_pesos_mwh IS NOT NULL) AS precio_dex_valle_promedio_pesos_mwh,
  avg(precio_pesos_mwh) FILTER (WHERE banda = 'diurna' AND precio_pesos_mwh IS NOT NULL) AS precio_dex_diurna_promedio_pesos_mwh,
  -- Trazabilidad
  count(*) AS sample_count
FROM dexc_long
WHERE precio_pesos_mwh IS NOT NULL AND precio_pesos_mwh > 0
GROUP BY anio, mes
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS vw_precios_dex_mensual_uidx
  ON public.vw_precios_dex_mensual(anio, mes);

COMMENT ON MATERIALIZED VIEW public.vw_precios_dex_mensual IS
  'Precios DEX (Demanda Excedente) mensuales del MEM, extraidos del archivo DEXC del DTE. Promedios por banda (pico/valle/diurna) y promedio general. Usado para calcular compra_spot_pesos de GUDIs.';

-- Funcion de refresh idempotente
CREATE OR REPLACE FUNCTION public.refresh_precios_dex_mensual()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.vw_precios_dex_mensual;
END;
$$;
