# Estado Fase 2 CAMMESA - 2026-04-29

## Resumen corto

Fase 2 avanzo fuerte, pero quedo bloqueada por storage del Supabase remoto durante T2.5 (`dte_resumen_agente`).

## Cerrado y verificado

### T2.0 - Helpers SQL

Aplicado previamente:

- `public.parse_es_number(text)`
- `public.parse_es_date(text)`
- `public.nemo_from(text)`

### Batch 1 - Parsers prioritarios previos

Verificado en remoto:

| Tabla L2 | Filas | Periodos |
|---|---:|---:|
| `mater_contrato_mensual` | 38.989 | 62 |
| `guma_detalle_mensual` | 23.743 | 63 |
| `transporte_concepto_mensual` | 9.240 | 63 |
| `cuenta_corriente_agente` | 86.754 | 57 |

### T2.X - `cammesa_parametros_mensuales`

Migrations:

- `supabase/migrations/20260430000010_l2_cammesa_parametros_mensuales.sql`
- `supabase/migrations/20260430000020_l2_cammesa_parametros_mensuales_v2.sql`

Verificado en remoto:

- 1.560 filas
- 63 periodos
- 34 parametros
- 0 duplicados
- 0 valores nulos

Nota: precios spot por banda aparecen desde 2025-11; antes AGUM trae sobrecostos/otros parametros.

### T2.4 - `excedente_mensual`

Migration:

- `supabase/migrations/20260430000030_l2_excedente_mensual.sql`

Verificado en remoto:

- 217.009 filas
- 63 periodos
- 0 duplicados por `(source_table, source_id)`
- 0 `agente_nemo` invalidos
- 0 totales negativos

Distribucion:

| Tipo | Filas | Periodos |
|---|---:|---:|
| GUDI | 123.163 | 20 |
| GUMA | 25.313 | 63 |
| GUME | 68.533 | 58 |

## En curso / bloqueado

### T2.5 - `dte_resumen_agente`

Migrations creadas/aplicadas:

- `supabase/migrations/20260430000040_l2_dte_resumen_agente.sql`
- `supabase/migrations/20260430000050_optimize_dte_resumen_refresh.sql`

La v2 funciono en smoke test:

```sql
select * from public.refresh_dte_resumen_agente(2026, 2);
```

Resultado:

- 42.579 filas
- 0 duplicados
- 0 `agente_nemo` invalidos
- 0 filas sin monto

Pero al cargar historico la version granular genero demasiadas filas. Se cargaron 2021-2024 y 2026-02 parcialmente antes de que Supabase remoto devolviera:

```text
ERROR: 53100: could not extend file ... No space left on device
```

Despues de eso:

- `npx supabase db query --linked ...` falla al crear login role.
- REST devuelve `503 PGRST002 Could not query the database for the schema cache`.
- No se pudo ejecutar `truncate table public.dte_resumen_agente`.

## Correccion preparada pero NO aplicada

Migration local pendiente:

- `supabase/migrations/20260430000060_slim_dte_resumen_total_pesos.sql`

Que hace:

1. `truncate table public.dte_resumen_agente;`
2. Reemplaza `public.refresh_dte_resumen_agente` por `dte_resumen_agente_v3_total_pesos`.
3. Reduce T2.5 a una fila principal por agente/seccion usando el ultimo monto en `$` de cada fila DTE, que normalmente es `TOTAL`/`FACTURA`.

Esta version es menos granular pero mucho mas chica y suficiente para primer mart de factura-sombra.

## Como retomar

Cuando Supabase vuelva a responder o se aumente/libere storage:

```powershell
$env:PYTHONIOENCODING='utf-8'
npx supabase db push --linked --include-all
```

Luego cargar T2.5 historico por anio:

```powershell
npx supabase db query --linked --output csv "
with periods as (
  select distinct anio, mes
  from public.raw_dte
  where anio = 2021
  order by anio, mes
),
refreshed as (
  select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version
  from periods p
  cross join lateral public.refresh_dte_resumen_agente(p.anio, p.mes) r
)
select * from refreshed order by anio, mes;
"
```

Repetir para `2022`, `2023`, `2024`, `2025`, `2026`.

Checks finales:

```sql
select count(*) as rows,
       count(distinct (anio, mes)) as periodos,
       count(*) - count(distinct (source_table, source_id, source_col_ordinal)) as dupes,
       count(*) filter (where agente_nemo !~ '^[A-Z0-9-]{8}$') as bad_nemo,
       count(*) filter (where mwh is null and pesos is null) as empty_amounts
from public.dte_resumen_agente;

select concepto,
       count(*) as rows,
       count(distinct (anio, mes)) as periodos,
       count(distinct agente_nemo) as agentes,
       sum(pesos) as pesos
from public.dte_resumen_agente
group by concepto
order by concepto;
```

## Estado real de Fase 2

- T2.0: cerrado.
- T2.1/T2.2/T2.3/T2.6: cerrados y verificados por conteo.
- T2.X parametros: cerrado.
- T2.4 excedente: cerrado.
- T2.5 DTE: implementado, smoke test ok, historico bloqueado por storage remoto.

No iniciar Fase 3 hasta resolver T2.5 o aceptar explicitamente una version parcial/sin DTE historico completo.
