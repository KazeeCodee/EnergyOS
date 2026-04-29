# Fase 2 — Batch 1: estado de cierre

> **Propósito.** Cerrar formalmente el Batch 1 de la Fase 2 (capa L2) tras la repoblación final post-fixes de calidad. Resume tablas creadas, funciones `refresh_*`, conteos finales, validaciones que pasaron y pendientes para los próximos batches.
>
> **Fecha de cierre:** 2026-04-29.
> **Rama:** `codex/audit-calculation-engine`.
> **Commit base:** `b76c2d0` (`feat(data): add phase 1 audit, historical ingestion and phase 2 batch 1 parsers`).
> **Insumo de referencia.** [`docs/energyos_handoff_fase2_contexto.md`](energyos_handoff_fase2_contexto.md), §5 (instrucciones precisas para continuar).

---

## 1. Resumen ejecutivo

- **Estado Batch 1:** ✅ **CERRADO**.
- **Tablas L2 pobladas:** 4 (`mater_contrato_mensual`, `guma_detalle_mensual`, `transporte_concepto_mensual`, `cuenta_corriente_agente`).
- **Funciones `refresh_*` aplicadas y ejecutadas:** 4.
- **Migrations aplicadas remoto:** 6 (T2.0 helpers + base parsers + 4 fixes incrementales).
- **Total filas L2 escritas:** 158.726 (38.989 + 23.743 + 9.240 + 86.754).
- **Validaciones que pasan:** dupes=0 en las 4 tablas, regex NEMO 100 % en MATER, suma `pico+valle+resto = total` cierra en GUMA layout nuevo, periodos esperados por cobertura natural.
- **Próximo paso:** **T2.4** (`excedente_mensual` desde `raw_dexc`, fuente masiva 1,33 M filas) y **T2.5** (`dte_resumen_agente` desde `raw_dte`, 1,15 M filas, long format por concepto).

---

## 2. Migrations aplicadas (en orden)

| # | Migration | Propósito |
|---|---|---|
| 1 | [`20260429024649_t2_sql_helpers.sql`](../supabase/migrations/20260429024649_t2_sql_helpers.sql) | T2.0 — `parse_es_number`, `parse_es_date`, `nemo_from`. |
| 2 | [`20260429025751_fix_t2_sql_helpers_formats.sql`](../supabase/migrations/20260429025751_fix_t2_sql_helpers_formats.sql) | Ajustes de formatos en helpers (decimal `,`, miles `.` o ` `). |
| 3 | [`20260429102000_l2_phase2_batch1_parsers.sql`](../supabase/migrations/20260429102000_l2_phase2_batch1_parsers.sql) | Tablas L2 + funciones `refresh_*` para T2.1/T2.2/T2.3/T2.6 (632 líneas). |
| 4 | [`20260429102100_l2_phase2_batch1_fix_rscj_nullable_distribuidor.sql`](../supabase/migrations/20260429102100_l2_phase2_batch1_fix_rscj_nullable_distribuidor.sql) | `cuenta_corriente_agente.distribuidor_nemo` → nullable. |
| 5 | [`20260429102200_l2_phase2_fix_mater_html_partial_threshold.sql`](../supabase/migrations/20260429102200_l2_phase2_fix_mater_html_partial_threshold.sql) | MATER: usar HTML solo si cobertura ≥ 90 % de TXT. |
| 6 | [`20260429102300_l2_phase2_fix_mater_ignore_tiny_html.sql`](../supabase/migrations/20260429102300_l2_phase2_fix_mater_ignore_tiny_html.sql) | MATER: subir umbral mínimo HTML a ≥ 100 filas. |
| 7 | [`20260429102400_l2_phase2_fix_batch1_parser_quality.sql`](../supabase/migrations/20260429102400_l2_phase2_fix_batch1_parser_quality.sql) | MATER: regex `^[A-Z0-9-]{8}$` en `col_001` y `col_003`. GUMA: detección dinámica `col_002` NEMO vs número y desplazamiento de columnas. `guma_detalle_mensual.distribuidor_nemo` → nullable. |

Todas pusheadas a Supabase remoto vía `npx supabase db push --linked --yes`.

---

## 3. Helpers T2.0 (validación rápida)

```sql
select
  public.parse_es_number('1.234,56') as n1,
  public.parse_es_number('1 234,56') as n2,
  public.parse_es_number('1234.56') as n3,
  public.parse_es_date('13-12-2025') as d1,
  public.parse_es_date('08-02-24')   as d2,
  public.nemo_from('ABCDEFGH resto') as nemo;
```

**Resultado esperado:** `1234.56, 1234.56, 1234.56, 2025-12-13, 2024-02-08, ABCDEFGH`. Cumplido en commit base.

---

## 4. Tabla por tabla

### 4.1 `mater_contrato_mensual` (T2.1)

**Origen.** `raw_amat` (TXT, 12 cols) con fallback dinámico a `raw_anexo_mat` (HTML 8/9 cols) cuando éste tiene cobertura ≥ 100 filas Y ≥ 90 % de las filas TXT del mismo período.

**Función.** `public.refresh_mater_contrato_mensual(_anio int, _mes int)` → `(rows_inserted, rows_deleted, parser_version)`. Idempotente (DELETE + INSERT por período).

**Schema (campos clave):**

| Campo | Tipo | Notas |
|---|---|---|
| `generador_nemo` | text(8) | regex `^[A-Z0-9-]{8}$` validado |
| `conjunto_generador` | text | nullable |
| `demandante_nemo` | text(8) | regex validado |
| `comercializador` | text | nullable, sólo en col_count=12 (TXT) o col_count=9 (HTML) |
| `energia_valle/resto/pico_mwh` | numeric | bandas |
| `energia_total_mwh` | numeric | |
| `importe_contrato_pesos` | numeric | |
| `precio_efectivo_pesos_mwh` | numeric | computado: `importe / nullif(energia_total, 0)` |
| `tipo_contrato` | text | `'BASE'` (PLUS/RENOVABLE/CVT pendientes en T2.14) |
| `source_table` | text | `'raw_amat'` o `'raw_anexo_mat'` |
| `source_id` | bigint | id de la fila raw |
| `parser_version` | text | `'mater_contrato_mensual_v1'` |

**Conteos finales:**

```
rows: 38.989
periodos: 62  (falta 2023-01, ausente también en raw_amat)
dupes_source: 0
bad_nemo: 0
```

Split por origen:

| source_table | rows | periodos |
|---|---:|---:|
| `raw_amat` | 37.427 | 60 |
| `raw_anexo_mat` | 1.562 | 2 |

> Solo 2 períodos (2026-02 y 2026-03) tienen HTML con cobertura suficiente para reemplazar al TXT. El resto se sirve desde `raw_amat`.

### 4.2 `guma_detalle_mensual` (T2.2)

**Origen.** `raw_anexo_guma` (HTML/MDB) con dos layouts:
- `html_legacy`: 51-52 cols (formato `MDB#ANEXO_GUMA` 2021-2025).
- `html_new`: 30-31 cols (formato `anexo_guma.html` 2026+).

El parser detecta dinámicamente si `col_002` es NEMO (con distribuidor) o número (sin distribuidor) y desplaza el resto de columnas en consecuencia. Las filas sin distribuidor se preservan con `distribuidor_nemo = NULL`.

**Función.** `public.refresh_guma_detalle_mensual(_anio int, _mes int)` → `(rows_inserted, rows_deleted, parser_version)`. Idempotente.

**Schema (32 campos numéricos + metadatos):** ver [migration 102000 líneas 195-237](../supabase/migrations/20260429102000_l2_phase2_batch1_parsers.sql).

**Conteos finales:**

```
rows: 23.743
periodos: 63
dupes_source: 0
bad_new_total_sum: 0   (suma pico+valle+resto = total cierra exacto en html_new)
```

Split por layout:

| source_layout | rows | periodos |
|---|---:|---:|
| `html_legacy` | 21.750 | 58 |
| `html_new` | 1.993 | 5 |

Distribuidor NULL: 40 filas (0,17 % del total) — preservadas por el fix 102400.

### 4.3 `transporte_concepto_mensual` (T2.3)

**Origen.** `raw_atra` sub-anexo A2.5 (CUST por agente, 9 cols).

**Función.** `public.refresh_transporte_concepto_mensual(_anio int, _mes int)`. Idempotente. Emite **8 filas por agente y mes**, una por cada concepto del CUST: `perdida_de_transp`, `uso_capacidad_transp`, `energia_transportada`, `adic_sist_transp`, `reduc_tarifa_peaje`, `cargo_total`, `corresponde_local`, `corresponde_otro`.

**Schema:** long format (`agente_nemo`, `concepto_transporte`, `pesos`, `demanda_mwh`, `pesos_por_mwh`).

**Conteos finales:**

```
rows: 9.240
periodos: 63
dupes (source_table, source_id, concepto_transporte): 0
```

Distribución exactamente uniforme: 1.155 filas por concepto × 8 conceptos = 9.240. ~144 agentes promedio por mes durante los 63 meses.

### 4.4 `cuenta_corriente_agente` (T2.6)

**Origen.** `raw_rscj` (Anexo 13 — Resol. Conjunta 1/2017). Una fila por `(agente, distribuidor, anio_calendario, mes_calendario)` derivada de los 6 meses del semestre (long format).

**Función.** `public.refresh_cuenta_corriente_agente(_anio int, _mes int)`. Idempotente.

**Schema:** ver [migration 102000 líneas 510-528](../supabase/migrations/20260429102000_l2_phase2_batch1_parsers.sql). Campos: `anio_semestre`, `semestre`, `mes_in_semestre`, `anio_calendario`, `mes_calendario`, `v_fisico_mwh`, `v_monetario_pesos`. `distribuidor_nemo` permite `NULL`.

**Conteos finales:**

```
rows: 86.754
periodos: 57          (faltan 2025-02 → 2025-07 en local; cobertura natural)
dupes (source_table, source_id, mes_in_semestre): 0

con distribuidor:    29.286   (33,8 %)
sin distribuidor:    57.468   (66,2 %)  — preservadas por fix 102100
```

---

## 5. Bugs y decisiones aplicadas durante el batch

### 5.1 MATER — `raw_anexo_mat` parcial

- **Síntoma.** En meses 2025-08/09/10 el HTML traía 10 filas mientras `raw_amat` traía ~700. El parser inicial usaba HTML por encima de TXT cuando había `> 0` filas, descartando el resto.
- **Fix.** Subir el umbral mínimo a `>= 100` filas HTML **y** que cubra `>= 90 %` de las filas TXT del mismo período. Aplicado en migrations 102200 + 102300.
- **Estado.** Resuelto. Hoy sólo 2026-02 y 2026-03 (2 períodos) usan HTML; el resto va por TXT.

### 5.2 MATER — sublayouts espurios en `raw_amat`

- **Síntoma.** `raw_amat` tiene varios sublayouts; algunos con `col_count ∈ {11,12}` traían `col_003` numérico (no NEMO), generando filas tipo `demandante_nemo='9 542,84'`.
- **Fix.** Validar regex `^[A-Z0-9-]{8}$` sobre `col_001` y `col_003` (ambos). Aplicado en migration 102400.
- **Verificación.** `bad_nemo = 0` post-repoblación.

### 5.3 GUMA — layout nuevo con y sin distribuidor

- **Síntoma.** `raw_anexo_guma` html_new venía con `col_count=31` (con distribuidor en `col_002`) o `col_count=30` (sin distribuidor; `col_002` ya es número de demanda). El parser inicial asumía siempre distribuidor → en el caso sin distribuidor desplazaba todas las métricas una columna a la izquierda y guardaba un NEMO inventado.
- **Fix.** En el SELECT del refresh, evaluar `case when col_002 ~ '^[A-Z0-9-]{8}$' then ... else (corrimiento) end` para cada métrica. `distribuidor_nemo` ahora es `NULL` cuando no hay distribuidor. Aplicado en migration 102400.
- **Verificación.** `bad_new_total_sum = 0` post-repoblación; 40 filas con `distribuidor_nemo IS NULL` preservadas.

### 5.4 RSCJ — distribuidor faltante

- **Síntoma.** Algunas filas históricas de `raw_rscj.col_001` traen solo un NEMO (sin distribuidor en posiciones 10-17). La tabla exigía `distribuidor_nemo NOT NULL`, perdiendo esas filas.
- **Fix.** `distribuidor_nemo` → nullable. Aplicado en migration 102100.
- **Verificación.** 57.468 filas históricas preservadas con `distribuidor_nemo IS NULL`.

---

## 6. Validaciones de cierre — script reproducible

```sql
-- 6.1 MATER
select 'totales' q, count(*) rows, count(distinct (anio,mes)) periodos,
       count(*) - count(distinct (source_table, source_id)) dupes_source,
       count(*) filter (
         where generador_nemo !~ '^[A-Z0-9-]{8}$'
            or demandante_nemo !~ '^[A-Z0-9-]{8}$'
       ) bad_nemo
  from public.mater_contrato_mensual;
-- esperado: 38989, 62, 0, 0

select source_table, count(*) rows, count(distinct (anio,mes)) periodos
  from public.mater_contrato_mensual
 group by source_table order by source_table;
-- esperado: raw_amat / raw_anexo_mat

-- 6.2 GUMA
select 'totales' q, count(*) rows, count(distinct (anio,mes)) periodos,
       count(*) - count(distinct (source_table, source_id)) dupes_source
  from public.guma_detalle_mensual;
-- esperado: 23743, 63, 0

select source_layout, count(*) rows, count(distinct (anio,mes)) periodos
  from public.guma_detalle_mensual
 group by source_layout order by source_layout;
-- esperado: html_legacy 21750/58, html_new 1993/5

select count(*) bad_new_total_sum
  from public.guma_detalle_mensual
 where source_layout='html_new'
   and demanda_real_pico_mwh is not null
   and demanda_real_valle_mwh is not null
   and demanda_real_resto_mwh is not null
   and abs((demanda_real_pico_mwh + demanda_real_valle_mwh + demanda_real_resto_mwh)
           - demanda_real_total_mwh) > 1;
-- esperado: 0

-- 6.3 Transporte y Cuenta Corriente
select 'transporte' tabla, count(*) rows, count(distinct (anio,mes)) periodos,
       count(*) - count(distinct (source_table, source_id, concepto_transporte)) dupes
  from public.transporte_concepto_mensual
union all
select 'cuenta_corriente', count(*), count(distinct (anio,mes)),
       count(*) - count(distinct (source_table, source_id, mes_in_semestre))
  from public.cuenta_corriente_agente;
-- esperado: transporte 9240/63/0, cuenta_corriente 86754/57/0

select concepto_transporte, count(*) rows
  from public.transporte_concepto_mensual
 group by 1 order by 1;
-- esperado: 8 conceptos x 1155 filas c/u
```

---

## 7. Warnings aceptados

1. **Cobertura natural parcial — esperada.**
   - MATER 62 períodos (no 63): `raw_amat` no tiene 2023-01 en local. Ya documentado en [T0.2](cammesa/T0.2_supabase_gap.md).
   - Cuenta Corriente 57 períodos (no 63): `raw_rscj` no tiene 2025-02 → 2025-07 en local. Ya documentado.

2. **MATER no incluye contratos PLUS / RENOVABLE / CVT.**
   El parser actual sólo lee `raw_amat` (12 cols) y `raw_anexo_mat` (8/9 cols). Los contratos de `raw_anexo_mat_plus` (37.454 filas), `raw_anexo_mat_renovable` (223.248 filas) y `raw_anexo_mat_cvt` (80.379 filas) están **fuera del scope** de Batch 1 — entran en **T2.14** (Batch 4).

3. **GUMA layout nuevo bajo (5 períodos / 1.993 filas).**
   Sólo 2026 (4 meses) + 2025-12 traen el formato `anexo_guma.html` con headers nominales. El resto (2021-2025-11) viene del export `MDB#ANEXO_GUMA` (layout legacy). Ambos están parseados.

4. **Transporte sólo del A2.5 (CUST).**
   El parser cubre la sub-sección de cargos CUST por agente. Las sub-secciones A2.1-A2.4 (transporte por generador, OyM por usuario, obras, recaudaciones) están **fuera del scope de Batch 1** — pueden entrar en T2.3.b si los marts L3 las requieren.

5. **`source_layout` en GUMA distingue layouts pero no versiones de parser.**
   Si en el futuro se cambia el parser sin tocar `parser_version`, hay que invalidar manualmente. Mitigación: el campo `parser_version` queda en cada fila para invalidar por versión.

---

## 8. Pendientes para Batch 2 (T2.4 + T2.5)

### T2.4 — `excedente_mensual` desde `raw_dexc`

- **Fuente:** `raw_dexc` (1.327.948 filas locales, ahora cargadas en Supabase remoto).
- **Sub-secciones a parsear:** A11.1 (Demanda Base vs Real GUMA, 18 cols), A11.2 (Cargos DEx por GUMA, 14-15 cols), A11.3 (GUME), A11.GUDI (12 cols), A11.detalle (9 cols).
- **Riesgo principal:** profiling correcto de las sub-secciones (ver [T0.1 §3 raw_dexc](cammesa/T0.1_dictionary.md)).
- **Brief:** [`docs/briefs/cammesa_t2_4_excedente_mensual.md`](briefs/cammesa_t2_4_excedente_mensual.md).
- **Habilita:** Mart **T3.4** (`exposicion_spot_mensual`) → pantalla T4.7 (Exposición Spot/DEXC, oportunidad 1.4).

### T2.5 — `dte_resumen_agente` desde `raw_dte`

- **Fuente:** `raw_dte` (1.148.753 filas locales).
- **Schema target:** long format `(agente_nemo, anio, mes, concepto, subconcepto, mwh, pesos, parser_version)` con enum de 17+ conceptos (`spot_compra`, `spot_venta`, `mater_compra`, `transp_at`, `transp_dt`, `cargo_excedente`, `reliquidacion`, `sanciones`, etc.).
- **Riesgo principal:** state machine para detectar headers de sub-secciones `1.`, `1.5`, `2.`, …, `15.` y rutear al mapping correspondiente.
- **Brief:** [`docs/briefs/cammesa_t2_5_dte_resumen_agente.md`](briefs/cammesa_t2_5_dte_resumen_agente.md).
- **Habilita:** Mart **T3.1** (`factura_sombra_mensual`) → pantalla T4.4 (Factura-sombra, oportunidad 1.1).

> **Recomendación.** T2.4 y T2.5 son paralelos entre sí (no comparten origen ni destino). Pueden despacharse a 2 chats hijos en simultáneo.

### Batches siguientes (post T2.4/T2.5)

- T2.7 reliquidaciones (`raw_aama`)
- T2.8 GUME (`raw_anexo_gume`, 299.082 filas)
- T2.9 GUDI/ADIS (`raw_gudi`, `raw_adis`)
- T2.10 generación máquina (`raw_agen`, `raw_anexo_gen111…114`)
- T2.11 disponibilidad (`raw_anexo_gen_disp_mejora`, `raw_anexo_generacion_forzada`)
- T2.12 imp/exp (`raw_aexp`)
- T2.13 autogeneradores (`raw_auto`)
- T2.14 MATER tecnología/CVT (`raw_anexo_mat_*`)
- T2.15 cargos comerciales (`raw_adco`)

---

## 9. Próximos pasos sugeridos al CTO

1. **Marcar T2.1/T2.2/T2.3/T2.6 como cerrados** en el roadmap de Fase 2.
2. **Confirmar arranque de T2.4 y T2.5** (paralelizables).
3. **No iniciar Fase 3 todavía:** los marts L3 dependen de T2.4 y T2.5 mínimo (factura-sombra y exposición spot son los marts ancla).
4. **Crear job mensual de refresh** (T5.4 del roadmap) recién cuando T2.4+T2.5 estén cerrados, para no agendar parciales.

---

## 10. Cómo retomar este Batch si se rompe algo

```powershell
# 1. Verificar que las migrations aplicadas remoto incluyan hasta 102400
npx --yes supabase migration list --linked

# 2. Si falta alguna, pushear
npx --yes supabase db push --linked --yes

# 3. Reprocesar MATER
$env:PYTHONIOENCODING='utf-8'
$q = "with periods as (select distinct anio, mes from public.raw_amat union select distinct anio, mes from public.raw_anexo_mat) select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version from periods p cross join lateral public.refresh_mater_contrato_mensual(p.anio, p.mes) r order by p.anio, p.mes;"
npx --yes supabase db query --linked --output csv $q

# 4. Reprocesar GUMA
$qg = "with periods as (select distinct anio, mes from public.raw_anexo_guma) select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version from periods p cross join lateral public.refresh_guma_detalle_mensual(p.anio, p.mes) r order by p.anio, p.mes;"
npx --yes supabase db query --linked --output csv $qg

# 5. Correr el script de validaciones del §6 de este documento.
```

> Idempotencia probada: las funciones `refresh_*` borran el período antes de insertar (`DELETE WHERE anio=_anio AND mes=_mes` + `INSERT … SELECT`). Reejecutar es seguro.
