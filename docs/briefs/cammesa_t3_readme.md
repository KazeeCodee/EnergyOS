# CAMMESA T3 Briefs

Briefs autocontenidos para marts L3 y el refactor `datos_mensuales`.

## Regla de despacho

No implementar T3 hasta que las L2 correspondientes hayan pasado sus smoke tests.

Orden recomendado:

1. `cammesa_t3_0_rebuild_datos_mensuales.md`
2. `cammesa_t3_1_factura_sombra_mensual.md`
3. `cammesa_t3_2_mater_pnl_contrato_mensual.md`
4. `cammesa_t3_4_exposicion_spot_mensual.md`
5. Resto de marts por prioridad comercial.

## Convenciones comunes

- Usar `npx supabase migration new l3_<mart>`.
- Crear tabla o materialized view en `public`.
- Agregar funcion `public.refresh_<mart>(_anio int, _mes int)` si es tabla.
- Agregar `parser_version`/`mart_version` y `procesado_en`.
- L3 por agente debe tener RLS por empresa/nemo.
- L3 global puede ser readable, pero con feature flag/plan en UI o policy.
- Incluir query de reconciliacion contra L2.
