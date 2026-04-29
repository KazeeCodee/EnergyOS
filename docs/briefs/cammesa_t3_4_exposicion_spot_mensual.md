# Brief T3.4 - `exposicion_spot_mensual`

## Objetivo

Crear mart mensual para exposicion spot y DEXC por agente.

## Depende de

- T2.4 `excedente_mensual`
- T2.2 `guma_detalle_mensual`
- T2.1 `mater_contrato_mensual`
- CRM `empresas.acuerdo_mensual_mwh` si existe

## Campos

- `agente_nemo`
- `demanda_total_mwh`
- `mater_mwh`
- `mat_base_mwh`
- `acuerdo_mensual_mwh`
- `spot_legitimo_mwh`
- `excedente_pico_mwh`
- `excedente_valle_mwh`
- `excedente_resto_mwh`
- `cargo_spot_pesos`
- `cargo_excedente_pesos`
- `cargo_excedente_evitable_pesos`

## Checks

```sql
select * from public.refresh_exposicion_spot_mensual(2026, 2);

select count(*), sum(spot_legitimo_mwh), sum(cargo_excedente_pesos)
from public.exposicion_spot_mensual
where anio = 2026 and mes = 2;
```
