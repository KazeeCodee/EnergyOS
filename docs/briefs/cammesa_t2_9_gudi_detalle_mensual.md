# Brief T2.9 - `gudi_detalle_mensual`

## Objetivo

Crear `public.gudi_detalle_mensual` y `public.refresh_gudi_detalle_mensual(_anio int, _mes int)` desde `raw_gudi`, con apoyo documental de `raw_adis`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuentes cargadas: `raw_gudi`, `raw_adis`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones `raw_gudi` y `raw_adis`
- `docs/cammesa_target_model.md`: seccion `gudi_detalle_mensual`

## Mapping `raw_gudi`

- `col_001` -> `distribuidor_nemo` + `gudi_nemo` split 8+8
- `col_002` -> `demanda_mwh`
- `col_003` -> `pm_mensual_energia_pesos_mwh`
- `col_004` -> `pm_mensual_potencia_pesos_mw`
- `col_005` -> `pm_mensual_transp_pesos_mwh`
- `col_006` -> `pm_estac_energia_pesos_mwh`
- `col_007` -> `pm_estac_potencia_pesos_mw`
- `col_008` -> `pm_estac_transp_pesos_mwh`
- `col_009..col_015` -> diferencias, cargo estabilizado y ajuste complementario

## Reglas

- `raw_adis` tiene mapping incompleto; no usarlo como fuente principal v1.
- Usar `public.parse_es_number`.
- `parser_version = 'gudi_detalle_mensual_v1'`.

## Checks

```sql
select * from public.refresh_gudi_detalle_mensual(2026, 2);

select count(*), sum(demanda_mwh), sum(cargo_estabilizado_pesos)
from public.gudi_detalle_mensual
where anio = 2026 and mes = 2;
```
