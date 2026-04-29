# Brief T3.3 - `curva_costo_marginal_horaria`

## Objetivo

Crear mart horario de curva de carga/costo marginal estimado.

## Depende de

- `cammesa_generacion`
- `cammesa_combustibles`
- opcional: precio spot publicado horario si existe

No depende de `raw_*`.

## Campos

- `fecha_hora`
- `demanda_total_mw`
- `gen_termico_mw`
- `gen_hidro_mw`
- `gen_renov_mw`
- `gen_nuclear_mw`
- `gen_importacion_mw`
- `tecnologia_marginal`
- `costo_marginal_estim_usd_mwh`
- `precio_spot_publicado_usd_mwh`

## Checks

```sql
select * from public.refresh_curva_costo_marginal_horaria('2026-02-01'::date, '2026-02-28'::date);

select count(*), min(fecha_hora), max(fecha_hora)
from public.curva_costo_marginal_horaria
where fecha_hora >= '2026-02-01' and fecha_hora < '2026-03-01';
```
