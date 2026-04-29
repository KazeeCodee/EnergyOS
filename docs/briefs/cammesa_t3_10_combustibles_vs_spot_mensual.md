# Brief T3.10 - `combustibles_vs_spot_mensual`

## Objetivo

Crear mart pais/mercado que compare combustibles y precio spot.

## Depende de

- T2.10 `generacion_maquina_mensual`
- `cammesa_combustibles`
- opcional: `cammesa_parametros_mensuales`

## Campos sugeridos

- `anio`, `mes`
- `combustible`
- `generacion_mwh`
- `costo_combustible_usd`
- `costo_promedio_usd_mwh`
- `precio_spot_promedio_usd_mwh`
- `spread_usd_mwh`

## Checks

```sql
select * from public.refresh_combustibles_vs_spot_mensual(2026, 2);

select combustible, generacion_mwh, spread_usd_mwh
from public.combustibles_vs_spot_mensual
where anio = 2026 and mes = 2;
```
