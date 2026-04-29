# Brief T3.1 - `factura_sombra_mensual`

## Objetivo

Crear mart mensual por agente que reconstruye factura CAMMESA y compara contra DTE real.

## Depende de

- T2.5 `dte_resumen_agente`
- T2.6 `cuenta_corriente_agente`
- T2.3 `transporte_concepto_mensual`
- T2.4 `excedente_mensual`
- T2.7 `reliquidacion_mensual`
- T2.2 `guma_detalle_mensual`
- T2.15 `cargos_comerc_mensual`

## Campos clave

- `cargo_compra_spot_pesos`
- `cargo_energ_adic_pesos`
- `cargo_serv_pesos`
- `cargo_transp_at_pesos`
- `cargo_transp_dt_pesos`
- `cargo_comercializ_pesos`
- `cargo_excedente_pesos`
- `cargo_mater_pesos`
- `creditos_aama_pesos`
- `factura_sombra_total_pesos`
- `factura_real_total_pesos`
- `desvio_pesos`
- `desvio_pct`
- `flag_revisar`

## RLS

Por agente: usuario solo lee nemos asociados a su empresa.

## Checks

```sql
select * from public.refresh_factura_sombra_mensual(2026, 2);

select count(*), sum(factura_sombra_total_pesos), sum(factura_real_total_pesos)
from public.factura_sombra_mensual
where anio = 2026 and mes = 2;

select count(*)
from public.factura_sombra_mensual
where anio = 2026 and mes = 2 and abs(desvio_pct) > 1.0;
```
