# Brief T3.11 - `imp_exp_impacto_mensual`

## Objetivo

Crear mart de impacto mensual de importacion/exportacion sobre el mercado.

## Depende de

- T2.12 `imp_exp_mensual`
- `cammesa_generacion`

## Campos sugeridos

- `anio`, `mes`
- `tipo` (`IMPORTACION`, `EXPORTACION`)
- `energia_mwh`
- `potencia_media_mw`
- `importe_pesos`
- `participacion_demanda_pct`
- `impacto_estimado_spot_pesos`

## Checks

```sql
select * from public.refresh_imp_exp_impacto_mensual(2026, 2);

select tipo, energia_mwh, importe_pesos, participacion_demanda_pct
from public.imp_exp_impacto_mensual
where anio = 2026 and mes = 2;
```
