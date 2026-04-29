# Brief T2.15 - `cargos_comerc_mensual`

## Objetivo

Crear `public.cargos_comerc_mensual` y `public.refresh_cargos_comerc_mensual(_anio int, _mes int)` desde `raw_adco`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_adco`. Nota: `raw_adco` puede tener `warn_prior_errors` historico, pero datos reconciliados.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_adco`
- `docs/cammesa_target_model.md`: seccion `cargos_comerc_mensual`

## Mapping

- `col_001` -> `distribuidor_nemo` + `gudi_o_gume_nemo` split 8+8 cuando aplique
- `col_002` -> `dem_pesos_mwh_media_mensual`
- `col_003` -> `dem_mwh_mensual`
- `col_004` -> `cargo_comercializ_pesos_mwh`
- `col_005` -> `cargo_comercializ_pesos`
- `col_006` -> `cargo_administracion_pesos`

## Parametros mensuales

El preambulo trae:

- `cargo_maximo_comercializacion`
- `porcentaje_obligatorio_ley_27191`

Guardar en `cammesa_parametros_mensuales` si existe; si no existe, crear brief separado antes de persistir esos parametros.

## Reglas

- Usar `public.parse_es_number`.
- Soportar filas con 7 u 8 columnas crudas: hubo cambios de layout.
- `parser_version = 'cargos_comerc_mensual_v1'`.

## Checks

```sql
select * from public.refresh_cargos_comerc_mensual(2026, 2);

select count(*), sum(dem_mwh_mensual), sum(cargo_comercializ_pesos)
from public.cargos_comerc_mensual
where anio = 2026 and mes = 2;
```
