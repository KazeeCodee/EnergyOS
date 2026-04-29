# Brief T2.10 - `generacion_maquina_mensual`

## Objetivo

Crear `public.generacion_maquina_mensual` y `public.refresh_generacion_maquina_mensual(_anio int, _mes int)`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuentes cargadas: `raw_agen`, `raw_game`, `raw_anexo_gen111..119`, `raw_anexo_gen12`, `raw_anexo_gen13`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones `raw_agen`, `raw_anexo_gen111..119`, `raw_anexo_gen12`, `raw_anexo_gen13`, `raw_game`
- `docs/cammesa_target_model.md`: seccion `generacion_maquina_mensual`

## Fuentes v1

Priorizar HTML:

- Termica energia: `raw_anexo_gen111`
- Termica potencia: `raw_anexo_gen112`
- Hidraulica energia: `raw_anexo_gen113`
- Hidraulica potencia: `raw_anexo_gen114`
- Reservas / potencia 4hs: `raw_anexo_gen13`

`raw_agen` queda para fallback y A1.7 horario futuro.

## Reglas

- Una fila por `(anio, mes, agente_nemo, unidad_comerc)`.
- Normalizar tecnologia y escala.
- Cuidar `col_001` fusionado en algunos anexos: split por header/posicion, no solo espacios.
- Usar `public.parse_es_number`.
- `parser_version = 'generacion_maquina_mensual_v1'`.

## Checks

```sql
select * from public.refresh_generacion_maquina_mensual(2026, 2);

select tecnologia, count(*), sum(energia_total_mwh), sum(pot_disp_mw)
from public.generacion_maquina_mensual
where anio = 2026 and mes = 2
group by tecnologia;
```
