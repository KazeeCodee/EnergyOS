# Brief T2.1 - `mater_contrato_mensual`

## Objetivo

Crear la tabla L2 `public.mater_contrato_mensual` y la funcion `public.refresh_mater_contrato_mensual(_anio int, _mes int)`.

## Estado

Listo para implementar cuando `pipeline/audit_fase1_raw.py` cierre Fase 1. Fuente principal ya cargada: `raw_anexo_mat`. Fallback: `raw_amat`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones `raw_anexo_mat` y `raw_amat`
- `docs/cammesa_target_model.md`: seccion `mater_contrato_mensual`
- Plan general: `docs/plans/2026-04-29-cammesa-fase2-parsers-prioritarios.md`

## Tabla

Columnas minimas:

```sql
anio int not null,
mes int not null,
generador_nemo text not null,
conjunto_generador text null,
demandante_nemo text not null,
comercializador text null,
energia_valle_mwh numeric null,
energia_resto_mwh numeric null,
energia_pico_mwh numeric null,
energia_total_mwh numeric null,
importe_contrato_pesos numeric null,
source_table text not null,
source_id bigint not null,
parser_version text not null,
procesado_en timestamptz not null default now()
```

## Mapping `raw_anexo_mat`

- `col_001` -> `generador_nemo`
- `col_002` -> `conjunto_generador`
- `col_003` -> `demandante_nemo`
- `col_004` -> `comercializador`
- `col_005` -> `energia_valle_mwh`
- `col_006` -> `energia_resto_mwh`
- `col_007` -> `energia_pico_mwh`
- `col_008` -> `energia_total_mwh`
- `col_009` -> `importe_contrato_pesos`

## Reglas

- Preferir `raw_anexo_mat` sobre `raw_amat`.
- No insertar headers, unidades, `TOTAL` ni `TOTALES`.
- Usar `public.parse_es_number` para energia e importes.
- `parser_version = 'mater_contrato_mensual_v1'`.

## Checks

```sql
select * from public.refresh_mater_contrato_mensual(2026, 2);

select count(*), sum(energia_total_mwh), sum(importe_contrato_pesos)
from public.mater_contrato_mensual
where anio = 2026 and mes = 2;

select count(*)
from public.mater_contrato_mensual
where generador_nemo in ('Agente', 'TOTAL', 'TOTALES');
```

Aceptacion: ultimo query debe devolver `0`.
