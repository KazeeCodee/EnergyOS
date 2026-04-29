# Brief T2.3 - `transporte_concepto_mensual`

## Objetivo

Crear la tabla L2 long format `public.transporte_concepto_mensual` y `public.refresh_transporte_concepto_mensual(_anio int, _mes int)`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuentes cargadas: `raw_atra`, `raw_anexo_guma`, `raw_anexo_gume`.

## Referencias

- `docs/cammesa_dictionary.md`: seccion `raw_atra`
- `docs/cammesa_target_model.md`: seccion `transporte_concepto_mensual`

## Fuente v1

Usar `raw_atra`, sub-seccion A2.5 CUST por agente.

## Tabla

```sql
anio int not null,
mes int not null,
agente_nemo text not null,
concepto_transporte text not null,
pesos numeric null,
demanda_mwh numeric null,
pesos_por_mwh numeric null,
source_table text not null,
source_id bigint not null,
parser_version text not null,
procesado_en timestamptz not null default now()
```

## Conceptos v1

- `perdida_de_transp`
- `uso_capacidad_transp`
- `energia_transportada`
- `adic_sist_transp`
- `reduc_tarifa_peaje`
- `cargo_total`
- `corresponde_local`
- `corresponde_otro`

## Reglas

- Una fila L2 por concepto.
- No mezclar A2.1-A2.4 en v1.
- `cargo_total` debe reconciliar con la suma de los conceptos base cuando existan.
- `parser_version = 'transporte_concepto_mensual_v1'`.

## Checks

```sql
select * from public.refresh_transporte_concepto_mensual(2026, 2);

select concepto_transporte, count(*), sum(pesos)
from public.transporte_concepto_mensual
where anio = 2026 and mes = 2
group by concepto_transporte
order by concepto_transporte;

select count(*)
from public.transporte_concepto_mensual
where length(agente_nemo) <> 8;
```

Aceptacion: ultimo query debe devolver `0`.
