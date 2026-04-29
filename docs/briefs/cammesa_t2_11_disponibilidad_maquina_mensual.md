# Brief T2.11 - `disponibilidad_maquina_mensual`

## Objetivo

Crear `public.disponibilidad_maquina_mensual` y `public.refresh_disponibilidad_maquina_mensual(_anio int, _mes int)`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuentes cargadas: `raw_anexo_gen_disp_mejora`, `raw_anexo_generacion_forzada`, `raw_anexo_gen_294pot`, `raw_anexo_gen_294ene`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones de disponibilidad/generacion forzada/SE 294
- `docs/cammesa_target_model.md`: seccion `disponibilidad_maquina_mensual`

## Campos clave

- `agente_nemo`
- `unidad_comerc`
- `pot_comprometida_mw`
- `pot_disp_real_mw`
- `pot_dispmejorada_mw`
- `disp_pct`
- `energia_forzada_mwh`
- `sobrecosto_combustible_pesos`
- `creditos_pesos`
- `debitos_pesos`

## Reglas

- `raw_anexo_gen_disp_mejora` aporta disponibilidad.
- `raw_anexo_generacion_forzada` aporta energia forzada y sobrecostos.
- `raw_anexo_gen_294*` v1 puede quedar como fuente secundaria si el mapping no esta confirmado.
- Usar `public.parse_es_number`.
- `parser_version = 'disponibilidad_maquina_mensual_v1'`.

## Checks

```sql
select * from public.refresh_disponibilidad_maquina_mensual(2026, 2);

select count(*), avg(disp_pct), sum(energia_forzada_mwh)
from public.disponibilidad_maquina_mensual
where anio = 2026 and mes = 2;
```
