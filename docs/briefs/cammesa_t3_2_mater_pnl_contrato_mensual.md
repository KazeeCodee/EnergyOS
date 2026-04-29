# Brief T3.2 - `mater_pnl_contrato_mensual`

## Objetivo

Crear mart de performance economica de contratos MATER por demandante/generador.

## Depende de

- T2.1 `mater_contrato_mensual`
- T2.14 `mater_renovable_mensual`, `mater_cvt_mensual`
- CRM `contratos`
- `cammesa_potencia_instalada`
- `cammesa_parametros_mensuales`

## Riesgo previo

Confirmar que existe tabla CRM `contratos` en Supabase y columnas:

- demandante/empresa/nemo
- generador_nemo
- precio_usd_mwh
- volumen_mwh_mes o equivalente

## Campos clave

- `volumen_contratado_mwh`
- `volumen_real_mwh`
- `desvio_volumen_mwh`
- `under_delivery_pct`
- `precio_contrato_usd_mwh`
- `precio_efectivo_pesos_mwh`
- `precio_spot_pesos_mwh`
- `ahorro_vs_spot_pesos`
- `factor_capacidad_pct`
- `flag_under_delivery`

## Checks

```sql
select * from public.refresh_mater_pnl_contrato_mensual(2026, 2);

select count(*), sum(volumen_real_mwh), sum(ahorro_vs_spot_pesos)
from public.mater_pnl_contrato_mensual
where anio = 2026 and mes = 2;
```
