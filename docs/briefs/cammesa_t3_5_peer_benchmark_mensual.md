# Brief T3.5 - `peer_benchmark_mensual`

## Objetivo

Crear mart anonimizado de percentiles por tipo de agente/region/tarifa.

## Depende de

- `cammesa_demanda_historica`
- T2.5 `dte_resumen_agente`
- opcional: `guma_detalle_mensual`, `gume_detalle_mensual`, `gudi_detalle_mensual`

## Campos

- `tipo_agente`
- `region`
- `tarifa`
- `anio`, `mes`
- `n_agentes`
- percentiles de demanda
- percentiles de porcentaje MATER
- percentiles de costo monomico

## Privacidad

No exponer filas de agente. Solo agregados con `n_agentes >= 5`.

## Checks

```sql
select * from public.refresh_peer_benchmark_mensual(2026, 2);

select min(n_agentes), count(*)
from public.peer_benchmark_mensual
where anio = 2026 and mes = 2;
```
