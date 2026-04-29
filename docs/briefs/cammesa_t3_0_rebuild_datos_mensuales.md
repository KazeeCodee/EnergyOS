# Brief T3.0 - `rebuild_datos_mensuales`

## Objetivo

Repopular `public.datos_mensuales` desde L2 manteniendo compatibilidad de schema para AdminModule1-4.

## Bloqueo

Depende de:

- T2.1 `mater_contrato_mensual`
- T2.2 `guma_detalle_mensual`
- T2.3 `transporte_concepto_mensual`
- T2.4 `excedente_mensual`
- T2.15 `cargos_comerc_mensual`

## Archivos

- Migration: `supabase/migrations/<timestamp>_t3_rebuild_datos_mensuales.sql`
- Referencia deuda tecnica: `docs/cammesa_target_model.md` seccion `datos_mensuales`
- Revisar uso app: buscar `datos_mensuales` en `src/`

## Funcion esperada

```sql
public.rebuild_datos_mensuales(_anio int, _mes int)
returns table(rows_inserted int, rows_updated int, mart_version text)
```

## Reglas

- No cambiar columnas existentes de `datos_mensuales` sin revisar UI.
- Calcular demanda desde `guma_detalle_mensual`/`gume_detalle_mensual`.
- Calcular MATER desde `mater_contrato_mensual`.
- Calcular spot/excedente desde `excedente_mensual`.
- Calcular transporte desde `transporte_concepto_mensual`.

## Checks

```sql
select * from public.rebuild_datos_mensuales(2026, 2);
select count(*) from public.datos_mensuales where anio = 2026 and mes = 2;
```
