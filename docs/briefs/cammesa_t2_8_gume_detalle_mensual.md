# Brief T2.8 - `gume_detalle_mensual`

## Objetivo

Crear `public.gume_detalle_mensual` y `public.refresh_gume_detalle_mensual(_anio int, _mes int)` desde `raw_anexo_gume`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_anexo_gume`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_anexo_gume`
- `docs/cammesa_target_model.md`: seccion `gume_detalle_mensual`

## Layouts

- 2026+ nuevo: 23 columnas.
- 2026 GUPA: 22 columnas.
- 2025 nuevo: 34 columnas.
- 2025 simple: 5 columnas solo metadata.

## Mapping base 2026+

- `col_001` -> `agente_nemo`
- `col_002` -> `distribuidor_nemo`
- `col_003..col_010` -> demanda real y compra spot por bandas
- `col_011` -> `compra_spot_pesos`
- `col_012..col_015` -> cargos energia/servicios/recuperos/confiabilidad
- `col_016..col_019` -> potencia / MATER
- `col_020..col_023` -> transporte, servicio tecnico y comercializacion

## Reglas

- Similar a `guma_detalle_mensual`, pero sin asumir todos los campos de GUMA.
- Mantener `tipo_agente = 'GUME'` si se agrega columna.
- Usar `public.parse_es_number`.
- `parser_version = 'gume_detalle_mensual_v1'`.

## Checks

```sql
select * from public.refresh_gume_detalle_mensual(2026, 2);

select count(*), sum(demanda_real_total_mwh), sum(compra_spot_pesos)
from public.gume_detalle_mensual
where anio = 2026 and mes = 2;
```
