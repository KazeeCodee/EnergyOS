# Brief T2.7 - `reliquidacion_mensual`

## Objetivo

Crear `public.reliquidacion_mensual` y `public.refresh_reliquidacion_mensual(_anio int, _mes int)` desde `raw_aama`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_aama`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_aama`
- `docs/cammesa_target_model.md`: seccion `reliquidacion_mensual`

## Forma L2

Long format con:

```sql
anio int,
mes int,
agente_nemo text,
concepto text,
mes_origen int null,
anio_origen int null,
mwh numeric null,
pesos numeric null,
intereses_pesos numeric null,
source_table text,
source_id bigint,
parser_version text,
procesado_en timestamptz default now()
```

## Layouts

- A8.1 saldos por concepto y mes: hasta 6 meses fisico/monetario + total semestre.
- A8.2 penalidades: capacidad, conexion, equipos, DAG/R1, sistema, supervision e intereses.
- Layouts 2021-2023 difieren; detectar por header, no por `col_count` solamente.

## Reglas

- Usar `public.parse_es_number`.
- No insertar totales si ya se desagregan meses, salvo `concepto = 'total_semestre'` documentado.
- `parser_version = 'reliquidacion_mensual_v1'`.

## Checks

```sql
select * from public.refresh_reliquidacion_mensual(2025, 11);

select concepto, count(*), sum(pesos), sum(intereses_pesos)
from public.reliquidacion_mensual
where anio = 2025 and mes = 11
group by concepto
order by concepto;
```
