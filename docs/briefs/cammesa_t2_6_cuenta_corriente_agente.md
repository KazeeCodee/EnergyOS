# Brief T2.6 - `cuenta_corriente_agente`

## Objetivo

Crear `public.cuenta_corriente_agente` y `public.refresh_cuenta_corriente_agente(_anio int, _mes int)` desde `raw_rscj`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente cargada: `raw_rscj`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_rscj`
- `docs/cammesa_target_model.md`: seccion `cuenta_corriente_agente`

## Normalizacion

Cada fila raw tiene hasta 6 meses historicos. La L2 debe producir hasta 6 filas por raw:

- mes 1: `col_003` fisico, `col_004` monetario
- mes 2: `col_005` fisico, `col_006` monetario
- mes 3: `col_007` fisico, `col_008` monetario
- mes 4: `col_009` fisico, `col_010` monetario
- mes 5: `col_011` fisico, `col_012` monetario
- mes 6: `col_013` fisico, `col_014` monetario

## Campos

```sql
anio int not null,
mes int not null,
agente_nemo text not null,
distribuidor_nemo text not null,
anio_semestre int not null,
semestre int not null,
mes_in_semestre int not null,
anio_calendario int not null,
mes_calendario int not null,
v_fisico_mwh numeric null,
v_monetario_pesos numeric null,
source_table text not null,
source_id bigint not null,
parser_version text not null,
procesado_en timestamptz not null default now()
```

## Reglas

- `col_001`: split `left(col_001, 8)` y `substring(col_001, 10, 8)`.
- `col_002`: parsear anio y semestre textual, ej. `2022 Ene - Jun`.
- No insertar un mes si fisico y monetario son ambos null.
- `parser_version = 'cuenta_corriente_agente_v1'`.

## Checks

```sql
select * from public.refresh_cuenta_corriente_agente(2026, 2);

select count(*), sum(v_fisico_mwh), sum(v_monetario_pesos)
from public.cuenta_corriente_agente
where anio = 2026 and mes = 2;

select count(*)
from public.cuenta_corriente_agente
where length(agente_nemo) <> 8 or length(distribuidor_nemo) <> 8;
```

Aceptacion: ultimo query debe devolver `0`.
