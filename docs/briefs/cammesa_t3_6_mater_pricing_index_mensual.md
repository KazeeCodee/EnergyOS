# Brief T3.6 - `mater_pricing_index_mensual`

## Objetivo

Crear indice mensual de precios MATER por tecnologia.

## Depende de

- T2.1 `mater_contrato_mensual`
- T2.14 `mater_renovable_mensual`
- `cammesa_potencia_instalada`

## Campos

- `anio`, `mes`
- `tecnologia`
- `n_contratos`
- `volumen_total_mwh`
- `precio_p25_pesos_mwh`
- `precio_p50_pesos_mwh`
- `precio_p75_pesos_mwh`
- `precio_promedio_ponderado_pesos_mwh`

## Checks

```sql
select * from public.refresh_mater_pricing_index_mensual(2026, 2);

select tecnologia, n_contratos, precio_p50_pesos_mwh
from public.mater_pricing_index_mensual
where anio = 2026 and mes = 2;
```
