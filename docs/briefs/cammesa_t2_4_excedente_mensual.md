# Brief T2.4 - `excedente_mensual`

## Objetivo

Crear `public.excedente_mensual` y `public.refresh_excedente_mensual(_anio int, _mes int)` desde `raw_dexc`.

## Estado

Bloqueado hasta que `raw_dexc` cierre Grupo G y el auditor global acepte la tabla.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_dexc`
- `docs/cammesa_target_model.md`: seccion `excedente_mensual`

## Parsing v1

1. Extraer precios DEx mensuales del preambulo.
2. Parsear A11.1 demanda base vs real.
3. Parsear A11.2 cargos demanda excedente.
4. Unir por `(anio, mes, agente_nemo, distribuidor_nemo)`.
5. Replicar precios DEx mensuales en cada fila L2.

## Campos clave

- `agente_nemo`
- `distribuidor_nemo`
- 9 columnas `dem_base_*_mwh`
- 9 columnas `dem_real_*_mwh`
- `dem_excedente_total_mwh`
- `cargo_dex_pesos`
- `recupero_pesos`
- `saldo_pesos`
- 6 precios mensuales DEx por tipo dia/banda

## Reglas

- Usar `public.parse_es_number`.
- Separar agente/distribuidor desde campo combinado cuando aplique.
- `parser_version = 'excedente_mensual_v1'`.

## Checks

```sql
select * from public.refresh_excedente_mensual(2026, 2);

select count(*), sum(dem_excedente_total_mwh), sum(cargo_dex_pesos)
from public.excedente_mensual
where anio = 2026 and mes = 2;

select count(*)
from public.excedente_mensual
where length(agente_nemo) <> 8;
```
