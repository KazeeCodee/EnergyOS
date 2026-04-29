# Brief T2.13 - `auto_mensual`

## Objetivo

Crear `public.auto_mensual` y `public.refresh_auto_mensual(_anio int, _mes int)` desde `raw_auto`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_auto`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_auto`
- `docs/cammesa_target_model.md`: seccion `auto_mensual`

## Estrategia

Reutilizar el esquema conceptual de `guma_detalle_mensual`, agregando:

- `generacion_autogenerada_mwh`
- `tipo_agente = 'AUTOGEN'`

## Reglas

- Detectar sub-seccion A5.1.
- No insertar headers/unidades/totales.
- Usar `public.parse_es_number`.
- `parser_version = 'auto_mensual_v1'`.

## Checks

```sql
select * from public.refresh_auto_mensual(2026, 2);

select count(*), sum(demanda_real_total_mwh), sum(generacion_autogenerada_mwh)
from public.auto_mensual
where anio = 2026 and mes = 2;
```
