# Brief T2.5 - `dte_resumen_agente`

## Objetivo

Crear `public.dte_resumen_agente` y `public.refresh_dte_resumen_agente(_anio int, _mes int)` desde `raw_dte`.

## Estado

Bloqueado hasta que `raw_dte` cierre Grupo G y el auditor global acepte la tabla.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_dte`
- `docs/cammesa_target_model.md`: seccion `dte_resumen_agente`

## Tabla

Long format:

```sql
anio int not null,
mes int not null,
agente_nemo text not null,
concepto text not null,
subconcepto text null,
mwh numeric null,
pesos numeric null,
source_table text not null,
source_id bigint not null,
parser_version text not null,
procesado_en timestamptz not null default now()
```

## Conceptos v1

Priorizar conceptos necesarios para Factura Sombra:

- `spot_compra`
- `spot_venta`
- `mater_compra`
- `transp_at`
- `transp_dt`
- `cargo_servicios`
- `cargo_serv_conf`
- `cargo_comercializ`
- `cargo_excedente`
- `reliquidacion`
- `fondos`
- `sanciones`

## Reglas

- No insertar headers/unidades.
- Mantener signo de creditos/debitos.
- Capturar subtotales `TOTAL`/`TOTALES` solo si el concepto lo requiere y documentarlo en comentario SQL.
- `parser_version = 'dte_resumen_agente_v1'`.

## Checks

```sql
select * from public.refresh_dte_resumen_agente(2026, 2);

select concepto, count(*), sum(mwh), sum(pesos)
from public.dte_resumen_agente
where anio = 2026 and mes = 2
group by concepto
order by concepto;

select count(*)
from public.dte_resumen_agente
where length(agente_nemo) <> 8;
```
