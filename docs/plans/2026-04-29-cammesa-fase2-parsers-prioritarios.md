# CAMMESA Fase 2 Parsers Prioritarios Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crear la primera capa L2 semantica reproducible para los seis parsers prioritarios T2.1-T2.6.

**Architecture:** Cada parser vive en su propia migration de Supabase y expone una funcion `public.refresh_<tabla_l2>(_anio int, _mes int)` idempotente. Las funciones leen L1 `raw_*`, filtran headers/totales, parsean con helpers T2.0 y escriben tablas L2 tipadas con `parser_version` y `procesado_en`.

**Tech Stack:** Supabase Postgres, SQL/PLpgSQL, `public.parse_es_number(text)`, `public.parse_es_date(text)`, `public.nemo_from(text)`, CLI `npx supabase`.

---

## Prerrequisitos

No ejecutar `refresh_*` en masa hasta que cierre Fase 1:

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --fail-on-mismatch --output docs\cammesa_phase1_audit.md
```

Aceptacion para avanzar:

- Todas las tablas `raw_*` quedan en `ok` o `warn_prior_errors`.
- `warn_prior_errors` solo es aceptable si `local = parser = remoto = unique_source` y `duplicate_sources = 0`.
- `raw_dexc` y `raw_dte` deben estar cerradas antes de T2.4 y T2.5.

Smoke test obligatorio de helpers:

```sql
select
  public.parse_es_number('1.234,56') as n1,
  public.parse_es_number('1 234,56') as n2,
  public.parse_es_number('1234.56') as n3,
  public.parse_es_date('13-12-2025') as d1,
  public.parse_es_date('08-02-24') as d2,
  public.nemo_from('ABCDEFGH resto') as nemo;
```

Esperado:

```csv
n1,n2,n3,d1,d2,nemo
1234.56,1234.56,1234.56,2025-12-13,2024-02-08,ABCDEFGH
```

## Reglas comunes para todos los T2.x

1. Crear migration con `npx supabase migration new l2_<tabla_l2>`.
2. Crear tabla L2 en `public`.
3. Habilitar RLS.
4. Crear policies siguiendo el patron de L1: `select_authenticated` y `admin_all` con `public.is_admin()`.
5. Crear indice `(anio, mes)`.
6. Crear indice de lectura por agente cuando aplique: `(agente_nemo, anio, mes)` o `(demandante_nemo, anio, mes)`.
7. Crear unique natural para idempotencia del refresh.
8. Crear funcion `public.refresh_<tabla_l2>(_anio int, _mes int) returns table(rows_inserted int, rows_skipped int, parser_version text)`.
9. Dentro del refresh: borrar solo el periodo `_anio/_mes`, insertar desde L1, devolver contadores.
10. No usar parsing ad hoc de numeros: siempre `public.parse_es_number`.
11. No guardar filas header, unidades, subtotales ni `TOTAL/TOTALES` como L2, salvo que el parser sea especificamente de totales.
12. Cada parser debe incluir tres queries de smoke: un periodo 2021, uno 2024 y uno 2026.

Template base de funcion:

```sql
create or replace function public.refresh_<tabla_l2>(_anio int, _mes int)
returns table(rows_inserted int, rows_skipped int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := '<tabla_l2>_v1';
begin
  delete from public.<tabla_l2>
   where anio = _anio
     and mes = _mes;

  insert into public.<tabla_l2> (...)
  select ...
    from public.<raw_table> raw
   where raw.anio = _anio
     and raw.mes = _mes
     and ...;

  get diagnostics rows_inserted = row_count;

  select count(*)
    into rows_skipped
    from public.<raw_table> raw
   where raw.anio = _anio
     and raw.mes = _mes
     and ... -- filas raw del layout leidas pero descartadas;

  parser_version := v_parser_version;
  return next;
end;
$$;
```

---

## Task 1: T2.1 `mater_contrato_mensual`

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_mater_contrato_mensual.sql`
- Reference: `docs/cammesa_dictionary.md` sections `raw_anexo_mat`, `raw_amat`
- Reference: `docs/cammesa_target_model.md` section `mater_contrato_mensual`

**Source priority:**

1. Preferir `raw_anexo_mat`.
2. Usar `raw_amat` solo como fallback para meses donde `raw_anexo_mat` no tenga datos utilizables.

**L2 table:**

```sql
create table public.mater_contrato_mensual (
  id bigserial primary key,
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
);
```

**Natural unique:**

```sql
create unique index mater_contrato_mensual_uidx
on public.mater_contrato_mensual
(anio, mes, generador_nemo, coalesce(conjunto_generador, ''), demandante_nemo, coalesce(comercializador, ''), source_table, source_id);
```

**Mapping `raw_anexo_mat`:**

- `col_001` -> `generador_nemo`
- `col_002` -> `conjunto_generador`
- `col_003` -> `demandante_nemo`
- `col_004` -> `comercializador`
- `col_005` -> `energia_valle_mwh`
- `col_006` -> `energia_resto_mwh`
- `col_007` -> `energia_pico_mwh`
- `col_008` -> `energia_total_mwh`
- `col_009` -> `importe_contrato_pesos`

**Smoke checks:**

```sql
select * from public.refresh_mater_contrato_mensual(2026, 2);
select count(*), sum(energia_total_mwh), sum(importe_contrato_pesos)
from public.mater_contrato_mensual
where anio = 2026 and mes = 2;
```

**Acceptance:**

- No insertar headers: `generador_nemo` no puede ser `Agente`, `TOTAL`, `TOTALES`.
- `energia_total_mwh` debe ser igual o cercana a `valle + resto + pico` cuando las tres bandas existen.
- `demandante_nemo` debe tener 8 caracteres para filas CAMMESA normales.

---

## Task 2: T2.2 `guma_detalle_mensual`

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_guma_detalle_mensual.sql`
- Reference: `docs/cammesa_dictionary.md` sections `raw_anexo_guma`, `raw_agum`
- Reference: `docs/cammesa_target_model.md` section `guma_detalle_mensual`

**Source priority:**

1. Preferir `raw_anexo_guma`.
2. Usar `raw_agum` solo como fallback o conciliacion.

**L2 table:**

Crear columnas del modelo target:

- `anio`, `mes`
- `agente_nemo`, `distribuidor_nemo`
- demandas reales y contratadas total/pico/valle/resto
- compras spot pico/valle/resto y pesos
- cargos de energia adicional, servicios, confiabilidad, transporte, ampliaciones
- potencia maxima/declarada/PHMD/PPAD/MATER
- `parser_version`, `procesado_en`, `source_table`, `source_id`

**Mapping principal `raw_anexo_guma` layout nuevo:**

- `col_001` -> `agente_nemo`
- `col_002` -> `distribuidor_nemo`
- `col_003..col_031` -> campos numericos segun `docs/cammesa_dictionary.md`

**Important:**

El layout legacy 2021-2025 puede tener 51/52 columnas. Para v1, implementar layout nuevo y legacy solo para las primeras 31 metricas equivalentes. Dejar `parser_version = 'guma_detalle_v1'`.

**Smoke checks:**

```sql
select * from public.refresh_guma_detalle_mensual(2026, 2);
select count(*), sum(demanda_real_total_mwh), sum(compra_spot_pesos)
from public.guma_detalle_mensual
where anio = 2026 and mes = 2;
```

**Acceptance:**

- `agente_nemo` y `distribuidor_nemo` deben tener 8 caracteres.
- No insertar filas header/unidad.
- Para filas sin contratos, `compra_spot_pico + valle + resto` debe aproximar demanda real por bandas.

---

## Task 3: T2.3 `transporte_concepto_mensual`

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_transporte_concepto_mensual.sql`
- Reference: `docs/cammesa_dictionary.md` section `raw_atra`
- Reference: `docs/cammesa_target_model.md` section `transporte_concepto_mensual`

**Source:**

- `raw_atra`, sub-seccion A2.5 CUST por agente.
- `raw_anexo_guma/gume` solo para denominadores de demanda si hace falta `pesos_por_mwh`.

**L2 table:**

```sql
create table public.transporte_concepto_mensual (
  id bigserial primary key,
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
);
```

**Conceptos v1 desde A2.5:**

- `perdida_de_transp`
- `uso_capacidad_transp`
- `energia_transportada`
- `adic_sist_transp`
- `reduc_tarifa_peaje`
- `cargo_total`
- `corresponde_local`
- `corresponde_otro`

**Acceptance:**

- Tabla long format: una fila por concepto.
- `cargo_total` debe aproximar suma de conceptos de cargo cuando todos existen.
- No usar secciones A2.1-A2.4 en v1 salvo que se creen conceptos explicitamente separados.

---

## Task 4: T2.6 `cuenta_corriente_agente`

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_cuenta_corriente_agente.sql`
- Reference: `docs/cammesa_dictionary.md` section `raw_rscj`
- Reference: `docs/cammesa_target_model.md` section `cuenta_corriente_agente`

**Source:**

- `raw_rscj`

**L2 shape:**

Normalizar las seis columnas mensuales de cada fila raw a seis filas L2.

```sql
create table public.cuenta_corriente_agente (
  id bigserial primary key,
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
);
```

**Parsing:**

- `col_001` contiene `agente distribuidor` concatenados: split `left(col_001, 8)` y `substring(col_001, 10, 8)`.
- `col_002` contiene semestre textual, ej. `2022 Ene - Jun`.
- `col_003/004` mes 1 fisico/monetario, `col_005/006` mes 2, etc.

**Acceptance:**

- Por cada fila raw valida deben salir hasta 6 filas L2.
- `mes_calendario` debe mapear correctamente semestre 1 a enero-junio y semestre 2 a julio-diciembre.
- No insertar meses vacios si ambos valores son null.

---

## Task 5: T2.4 `excedente_mensual`

**Status:** bloqueado hasta que `raw_dexc` cierre Grupo G y `audit_fase1_raw.py` de `ok` o `warn_prior_errors`.

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_excedente_mensual.sql`
- Reference: `docs/cammesa_dictionary.md` section `raw_dexc`
- Reference: `docs/cammesa_target_model.md` section `excedente_mensual`

**Source:**

- `raw_dexc`

**Parsing plan:**

1. Extraer precios DEx mensuales del preambulo.
2. Parsear A11.1 demanda base vs real.
3. Parsear A11.2 cargos demanda excedente.
4. Unir por `(anio, mes, agente_nemo, distribuidor_nemo)`.
5. Replicar precios DEx mensuales en cada fila L2.

**Acceptance:**

- Para cada fila con A11.1 + A11.2 debe haber una fila L2.
- `dem_excedente_total_mwh` debe ser computada y reconciliable contra A11.2 cuando exista.
- `cargo_dex_pesos`, `recupero_pesos`, `saldo_pesos` son metricas clave para T3.1 y T3.4.

---

## Task 6: T2.5 `dte_resumen_agente`

**Status:** bloqueado hasta que `raw_dte` cierre Grupo G y `audit_fase1_raw.py` de `ok` o `warn_prior_errors`.

**Files:**

- Create: `supabase/migrations/<timestamp>_l2_dte_resumen_agente.sql`
- Reference: `docs/cammesa_dictionary.md` section `raw_dte`
- Reference: `docs/cammesa_target_model.md` section `dte_resumen_agente`

**Source:**

- `raw_dte`

**L2 shape:**

Long format:

```sql
create table public.dte_resumen_agente (
  id bigserial primary key,
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
);
```

**Parsing v1:**

Implementar primero conceptos de alto valor para Factura Sombra:

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

**Acceptance:**

- No insertar headers ni filas unidad.
- Mantener signo de creditos/debitos.
- Capturar subtotales `TOTAL`/`TOTALES` solo si el concepto exige total por agente; documentar en comentario SQL.
- La tabla debe poder responder: total pesos por agente y mes, desglosado por concepto.

---

## Plan de despacho paralelo

Cuando Fase 1 cierre:

1. Chat A: T2.1 `mater_contrato_mensual`
2. Chat B: T2.2 `guma_detalle_mensual`
3. Chat C: T2.3 `transporte_concepto_mensual`
4. Chat D: T2.6 `cuenta_corriente_agente`
5. Chat E: T2.4 `excedente_mensual`
6. Chat F: T2.5 `dte_resumen_agente`

No mezclar T2.4/T2.5 con otros cambios porque `raw_dexc/raw_dte` son masivas y van a requerir queries de profiling por seccion.

## Definition of Done para cada parser

- Migration creada con `npx supabase migration new`.
- `supabase db push --linked` exitoso.
- Funcion `refresh_*` corre para tres periodos: 2021, 2024, 2026.
- Conteos L2 documentados en comentario final del PR/chat.
- Queries de reconciliacion contra L1 incluidas en el reporte.
- Ninguna consulta UI nueva toca `raw_*` directamente.
