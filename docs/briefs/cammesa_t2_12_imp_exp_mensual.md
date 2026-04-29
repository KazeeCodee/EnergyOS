# Brief T2.12 - `imp_exp_mensual`

## Objetivo

Crear `public.imp_exp_mensual` y `public.refresh_imp_exp_mensual(_anio int, _mes int)` desde `raw_aexp`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_aexp`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_aexp`
- `docs/cammesa_target_model.md`: seccion `imp_exp_mensual`

## Forma L2

Una fila por `(anio, mes, agente_nemo, jurisdiccion, tipo)` con `tipo in ('IMPORTACION','EXPORTACION')`.

## Fuente v1

- A9.1 demanda exportada.
- A9.2 compras de energia importada.
- A9.3 detalle bilateral generador-demandante si el layout esta claro.

## Reglas

- Usar long-ish format con `tipo`, `concepto`, `mwh`, `mw`, `pesos` si los layouts difieren mucho.
- Usar `public.parse_es_number`.
- `parser_version = 'imp_exp_mensual_v1'`.

## Checks

```sql
select * from public.refresh_imp_exp_mensual(2026, 2);

select tipo, count(*), sum(mwh), sum(pesos)
from public.imp_exp_mensual
where anio = 2026 and mes = 2
group by tipo;
```
