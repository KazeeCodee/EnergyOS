# EnergyOS CAMMESA — Handoff completo para terminar el sistema

> **Audiencia.** Este documento es el handoff para el desarrollador que va a continuar y cerrar el sistema EnergyOS CAMMESA. Asume que sabés SQL/Postgres, TypeScript/React, y que ya cloneaste el repo. **No** asume que conocés el dominio CAMMESA ni el contexto de las conversaciones previas.
>
> **Repo.** `E:\Proyectos\GitHub\EnergyOS`. Rama actual: `codex/audit-calculation-engine`.
>
> **Última fecha de corte.** 2026-04-29.
>
> **Lectura previa obligatoria (en este orden):**
> 1. `docs/energyos_handoff_fase2_contexto.md` — handoff técnico Fase 1/2.
> 2. `docs/cammesa_phase2_batch1_status.md` — qué quedó cerrado del Batch 1 de L2.
> 3. `docs/cammesa/T0.1_dictionary.md` — diccionario `raw_*` (4500+ líneas, columna por columna).
> 4. `docs/cammesa/T0.2_supabase_gap.md` — qué hay cargado en Supabase y qué falta.
> 5. `docs/cammesa/T0.3_target_model.md` — modelo lógico L1/L2/L3 y todas las decisiones arquitectónicas.
> 6. Briefs por tarea: `docs/briefs/cammesa_t2_*.md`.

---

## 0. TL;DR

EnergyOS quiere ser un servicio premium de inteligencia de datos del MEM (Mercado Eléctrico Mayorista de Argentina) para grandes consumidores (GUMA/GUME/GUDI). Vendemos: factura-sombra, P&L de contratos MATER, exposición a spot y benchmark vs pares, basados en los DTE/anexos mensuales de CAMMESA.

**Estado a la fecha:**
- ✅ **Fase 0** (fundaciones, diccionarios, modelo): cerrada.
- ✅ **Fase 1** (ingesta histórica de los 42 archivos `raw_*`, 6,1 M filas, 2021-01 → 2026-03): cerrada y auditada.
- 🟡 **Fase 2** (parsers L2): **Batch 1 cerrado** (T2.1/T2.2/T2.3/T2.6 = MATER + GUMA + Transporte + Cuenta Corriente). **Batch 2 (T2.4 + T2.5) y Batch 3 (T2.7-T2.15) pendientes.**
- 🔵 **Fase 3** (marts L3): no arrancada.
- 🔵 **Fase 4** (UI/pantallas premium): no arrancada.
- 🔵 **Fase 5** (operación, cron, RLS por plan, observabilidad): no arrancada.

**Tu camino crítico:** terminar Fase 2 → Fase 3 marts ancla (factura-sombra + spot + MATER P&L) → Fase 4 las 4 pantallas nivel 1. Eso es lo que pone plata en la mesa.

---

## 1. Cómo arrancar (10 minutos)

```powershell
# 1. Ubicación
cd E:\Proyectos\GitHub\EnergyOS

# 2. Rama
git status
git checkout codex/audit-calculation-engine
git pull --ff-only

# 3. Verificar que el linked esté ok
$env:PYTHONIOENCODING='utf-8'
npx --yes supabase --version           # >= 2.95
npx --yes supabase projects list       # debe mostrar el proyecto linked

# 4. Probe rápido al remoto
npx --yes supabase db query --linked --output csv "select count(*) as raws from public.raw_amat;"
# Esperado: 417814

# 5. Verificar Batch 1 ya cerrado
npx --yes supabase db query --linked --output csv "select 'mater' t, count(*) c, count(distinct (anio,mes)) p from public.mater_contrato_mensual union all select 'guma', count(*), count(distinct (anio,mes)) from public.guma_detalle_mensual union all select 'transp', count(*), count(distinct (anio,mes)) from public.transporte_concepto_mensual union all select 'cc', count(*), count(distinct (anio,mes)) from public.cuenta_corriente_agente;"
# Esperado: mater 38989/62, guma 23743/63, transp 9240/63, cc 86754/57
```

Si los conteos coinciden, estás listo para arrancar Batch 2.

---

## 2. Convenciones canónicas (no las cambies)

### 2.1 Capas de datos

```
L1 raw_*  →  parser/refresh_*  →  L2 *_mensual / *_horaria  →  refresh_mart_*  →  L3 marts  →  UI
```

- **L1** son las 42 tablas `raw_*` con columnas posicionales `col_001 … col_NNN`. **Nunca** se consultan desde la UI.
- **L2** son tablas tipadas con `numeric`/`text`/`date`. Las pueblan funciones SQL `refresh_<tabla>(_anio int, _mes int)` idempotentes (DELETE + INSERT por período).
- **L3** son marts ya digeridos para consumir por la UI con una sola query.

### 2.2 Clave canónica de unión

```sql
periodo     = (anio int, mes int)
agente_nemo = public.nemo_from(col_001)   -- = left(col_001, 8) saneado
```

`agente_nemo` siempre es `text(8)` con regex `^[A-Z0-9-]{8}$`. Cuando una fila trae 2 nemos pegados (`'YPF-13MZ DISTROCT'`), los primeros 8 son el agente y los siguientes 8 (después del espacio) son el distribuidor / contraparte.

### 2.3 Idempotencia obligatoria

Toda función `refresh_*` debe:

```sql
delete from public.<tabla> where anio=_anio and mes=_mes;
insert into public.<tabla> (...) select ... from raw_xxx where anio=_anio and mes=_mes ...;
return query select <inserted>, <deleted>, <parser_version>;
```

Reejecutar la misma función con los mismos parámetros tiene que dar exactamente el mismo resultado. **Esto es no-negociable.**

### 2.4 Trazabilidad

Toda fila L2/L3 lleva 3 columnas adicionales:

```sql
source_table   text not null   -- de qué raw_* viene la fila
source_id      bigint not null -- el id de esa fila raw
parser_version text not null   -- ej. 'mater_contrato_mensual_v1'
procesado_en   timestamptz not null default now()
```

Y un **índice único** sobre `(source_table, source_id)` para evitar duplicados al re-procesar. Cuando una fila raw se desdobla en N filas L2 (long format, ej. transporte por concepto), agregar la dimensión al índice único: `(source_table, source_id, concepto_transporte)`.

### 2.5 Helpers SQL (T2.0)

Disponibles desde [`20260429024649_t2_sql_helpers.sql`](../supabase/migrations/20260429024649_t2_sql_helpers.sql):

```sql
public.parse_es_number(text) returns numeric    -- '1 234,56' / '1.234,56' / '1234.56'
public.parse_es_date(text)   returns date       -- '13-12-2025' / '08-02-24'
public.nemo_from(text)       returns text       -- limpia y normaliza primeros 8 chars
```

**Usalas siempre.** No reescribas casteo en cada parser.

### 2.6 RLS

- **L1 raw_*:** `select_authenticated` libre + `admin_all` con `is_admin()`.
- **L2:** mismas políticas que L1. Cualquier user logueado puede leer (la privacidad por cliente se aplica recién en L3).
- **L3 marts:**
  - **Por agente** (factura_sombra, mater_pnl, etc.) → policy `using` que cruza `empresas` ↔ `nemos` con `auth.uid()`.
  - **Globales** (peer_benchmark, mater_pricing_index) → libres.
  - **Premium-only** (todas las marts L3 menos peer_benchmark básico) → flag adicional por `empresas.plan_activo`.

### 2.7 Migrations

Una migration por tabla L2/L3. Naming: `YYYYMMDDHHMMSS_<capa>_<descripcion>.sql`. Ejemplos válidos:

```
20260430000010_l2_excedente_mensual.sql
20260430000020_l2_dte_resumen_agente.sql
20260430000030_l2_cammesa_parametros_mensuales.sql
20260501000010_l3_factura_sombra_mensual.sql
```

Pushear con `npx --yes supabase db push --linked --yes`.

### 2.8 Parsers — patrón estándar

Toda función `refresh_*` sigue el mismo esqueleto. Copialo, no lo reinventes:

```sql
create or replace function public.refresh_<tabla>(_anio int, _mes int)
returns table (rows_inserted int, rows_deleted int, parser_version text)
language plpgsql as $$
declare
  v_parser_version text := '<tabla>_v1';
  v_inserted int := 0;
  v_deleted  int := 0;
begin
  -- 1) Borrar el período (idempotencia)
  delete from public.<tabla> where anio=_anio and mes=_mes;
  get diagnostics v_deleted = row_count;

  -- 2) Insertar
  with src as (
    select
      r.id as source_id,
      r.anio, r.mes,
      public.nemo_from(r.col_001) as agente_nemo,
      public.parse_es_number(r.col_NNN) as <campo>,
      ...
    from public.raw_<xxx> r
    where r.anio=_anio and r.mes=_mes
      and r.col_count = <esperado>           -- discriminador de layout
      and public.nemo_from(r.col_001) is not null
      and trim(coalesce(r.col_001,'')) ~ '^[A-Z0-9-]{8}$'
      and upper(trim(coalesce(r.col_001,''))) not in ('AGENTE','TOTAL','TOTALES','...')
      and coalesce(r.col_001,'') !~ '^-+$'
  ), ins as (
    insert into public.<tabla> (
      anio, mes, agente_nemo, <campos>,
      source_table, source_id, parser_version
    )
    select
      anio, mes, agente_nemo, <campos>,
      'raw_<xxx>', source_id, v_parser_version
    from src
    where <al menos un campo no nulo para evitar filas vacías>
    returning 1
  )
  select count(*) into v_inserted from ins;

  return query select v_inserted, v_deleted, v_parser_version;
end;
$$;
```

### 2.9 Validación obligatoria al cerrar una tarea L2

Toda tarea L2 cierra **solo si**:

1. `dupes_source = 0`: ninguna fila L2 viene del mismo `(source_table, source_id, …)` que otra.
2. `bad_nemo = 0` cuando aplique: regex `^[A-Z0-9-]{8}$` sobre todos los campos NEMO.
3. `periodos == esperado` (no necesariamente 63 — usar T0.2 para saber el esperado de cada raw).
4. **Reproceso completo idempotente:** correr `refresh_*` para todos los períodos y obtener `rows_inserted == rows_deleted` (señal de idempotencia perfecta cuando ya hay datos cargados).
5. Documentar en `docs/cammesa_phase2_batch<N>_status.md`.

---

## 3. Lo que se acaba de cerrar (Batch 1)

Para que tengas el contexto exacto del último tramo. Detalle completo en `docs/cammesa_phase2_batch1_status.md`.

| Tabla L2 | Filas | Períodos | Función refresh |
|---|---:|---:|---|
| `mater_contrato_mensual` | 38.989 | 62 | `refresh_mater_contrato_mensual(int,int)` |
| `guma_detalle_mensual` | 23.743 | 63 | `refresh_guma_detalle_mensual(int,int)` |
| `transporte_concepto_mensual` | 9.240 | 63 | `refresh_transporte_concepto_mensual(int,int)` |
| `cuenta_corriente_agente` | 86.754 | 57 | `refresh_cuenta_corriente_agente(int,int)` |

Migrations aplicadas (en orden):
1. `20260429024649_t2_sql_helpers.sql` — helpers T2.0
2. `20260429025751_fix_t2_sql_helpers_formats.sql` — fix formatos numéricos
3. `20260429102000_l2_phase2_batch1_parsers.sql` — base parsers
4. `20260429102100_l2_phase2_batch1_fix_rscj_nullable_distribuidor.sql` — RSCJ nullable
5. `20260429102200_l2_phase2_fix_mater_html_partial_threshold.sql` — MATER threshold 90 %
6. `20260429102300_l2_phase2_fix_mater_ignore_tiny_html.sql` — MATER min 100 filas HTML
7. `20260429102400_l2_phase2_fix_batch1_parser_quality.sql` — regex NEMO + GUMA col_002 dinámico

**Aprendizajes que aplican a las próximas tareas:**

- **Layouts múltiples por archivo.** Casi todos los `raw_*` TXT tienen sub-secciones con distinto `col_count`. El parser tiene que discriminar por `col_count` y por el header de sub-anexo (regex sobre `col_001`/`raw_text`).
- **Regex NEMO siempre.** Pasar `col_001` y cualquier otra columna que pretenda ser NEMO por `^[A-Z0-9-]{8}$` para evitar arrastrar filas de otros sub-anexos.
- **Layouts viejos (MDB) ≠ HTML nuevos.** Algunas tablas vienen de export `*.MDB#TABLA` (2021-2025) con más columnas, y de `anexo_*.html` (2026+) con menos. Discriminar por `col_count` y guardar `source_layout` en la fila L2.
- **Cobertura natural parcial.** Algunas raw no tienen 63 períodos porque CAMMESA no los publicaba antes. No marcar como fallo. Documentar el período real en T0.2.

---

## 4. Fase 2 restante — qué falta para cerrar la capa L2

### 4.1 Visión general

| Tarea | Tabla L2 | Origen | Filas raw | Habilita mart | Brief |
|---|---|---|---:|---|---|
| **T2.4** 🔴 | `excedente_mensual` | `raw_dexc` | 1.327.948 | T3.4 (Spot/DEXC) | `docs/briefs/cammesa_t2_4_excedente_mensual.md` |
| **T2.5** 🔴 | `dte_resumen_agente` | `raw_dte` | 1.148.753 | T3.1 (Factura-sombra) | `docs/briefs/cammesa_t2_5_dte_resumen_agente.md` |
| **T2.X** 🟡 | `cammesa_parametros_mensuales` | preámbulos AGUM/ATRA/ADCO/DEXC | parámetros | todos los marts | (crear brief) |
| T2.7 🟡 | `reliquidacion_mensual` | `raw_aama` | 4.193 | T3.1 (Factura-sombra) | crear brief |
| T2.8 🟡 | `gume_detalle_mensual` | `raw_anexo_gume` | 299.082 | T3.1, T3.5 | crear brief |
| T2.9 🟡 | `gudi_detalle_mensual` | `raw_gudi` + `raw_adis` | ~190.000 | T3.1, T3.5 | crear brief |
| T2.10 🟡 | `generacion_maquina_mensual` | `raw_agen` + `raw_anexo_gen111…114/13` | ~470.000 | T3.3, T3.8 | crear brief |
| T2.11 🟢 | `disponibilidad_maquina_mensual` | `raw_anexo_gen_disp_mejora` + forzada | 13.345 | T3.8 | crear brief |
| T2.12 🟢 | `imp_exp_mensual` | `raw_aexp` | 9.874 | T3.11 | crear brief |
| T2.13 🟢 | `auto_mensual` | `raw_auto` | 16.346 | (uso interno) | crear brief |
| T2.14 🟡 | `mater_renovable_mensual` + `mater_cvt_mensual` | `raw_anexo_mat_*` (5 tablas) | ~340.000 | T3.2, T3.6, T3.9 | crear brief |
| T2.15 🟢 | `cargos_comerc_mensual` | `raw_adco` | 143.683 | T3.1 | crear brief |

🔴 = bloquea marts ancla. Hacer primero. 🟡 = Batch 3, paralelizable. 🟢 = Batch 4, baja prioridad.

### 4.2 T2.X — `cammesa_parametros_mensuales` (parámetros del mes)

> **Nueva tarea no listada en el plan original.** Es el insumo común de casi todos los marts L3 y conviene cerrarla primero (10 minutos de trabajo, 1 chat hijo).

**Por qué.** Los archivos AGUM/ATRA/ADCO/DEXC traen en sus filas preámbulo los precios de mercado del mes (precio spot pico/valle/resto, precio transp AT, % obj. Ley 27.191, precios DEx). Esos números los usa cada mart. Mejor tenerlos en una sola tabla que ir a buscarlos cada vez.

**Tabla L2 a crear:**

```sql
create table if not exists public.cammesa_parametros_mensuales (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  parametro text not null,
  valor numeric null,
  unidad text null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index cammesa_parametros_mensuales_periodo_param_uidx
  on public.cammesa_parametros_mensuales(anio, mes, parametro);
```

**Parámetros a extraer** (cada uno desde su preámbulo):

| `parametro` | Origen | Regex sobre `raw_text` | Unidad |
|---|---|---|---|
| `precio_spot_pico_pesos_mwh` | `raw_agum` preámbulo | `Pico\s*\(\$/MWh\)\s*:\s*([0-9.,\s]+)` | $/MWh |
| `precio_spot_valle_pesos_mwh` | `raw_agum` preámbulo | `Valle\s*\(\$/MWh\)\s*:` | $/MWh |
| `precio_spot_resto_pesos_mwh` | `raw_agum` preámbulo | `Resto\s*\(\$/MWh\)\s*:` | $/MWh |
| `precio_energia_adic_pico_pesos_mwh` | `raw_agum` (segundo bloque) | idem | $/MWh |
| `precio_servicios_pesos_mwh` | `raw_agum` | `Precio Servicios.*?:\s*([0-9.,\s]+)` | $/MWh |
| `precio_recupero_costos_op_pesos_mwh` | `raw_agum` | idem | $/MWh |
| `precio_serv_confiabilidad_pesos_mwh` | `raw_agum` | idem | $/MWh |
| `precio_transp_at_pesos_mwh` | `raw_atra` | `Precio Mensual de Transporte en Alta Tensi.*\$\/MWh.*:\s*([0-9.,\s]+)` | $/MWh |
| `cargo_max_comercializ_pesos_mwh` | `raw_adco` | `Cargo Maximo Comercializacion.*:\s*([0-9.,]+)` | $/MWh |
| `pct_obligatorio_ley_27191` | `raw_adco` | `Porcentaje Obligatorio Ley 27191.*?:\s*([0-9.]+)` | % |
| `precio_dex_hab_valle_pesos_mwh` | `raw_dexc` | `Prec\.Dem\.Exc\.Dias Hab\.Hs\.Valle.*?:\s*([0-9.,\s]+)` | $/MWh |
| `precio_dex_hab_diurna_pesos_mwh` | `raw_dexc` | (3 valores en la misma fila) | $/MWh |
| `precio_dex_hab_pico_pesos_mwh` | `raw_dexc` | idem | $/MWh |
| `precio_dex_sab_*` | `raw_dexc` | (3) | $/MWh |
| `precio_dex_dom_*` | `raw_dexc` | (3) | $/MWh |

**Función:** `refresh_cammesa_parametros_mensuales(_anio int, _mes int)`. Patrón estándar. Cada parámetro es una fila distinta en long format.

**Validación de cierre:**

```sql
-- Debe haber al menos 18 parámetros por período (ajustar según los disponibles)
select anio, mes, count(*) as n_param
  from public.cammesa_parametros_mensuales
 group by 1,2
 order by 1,2;

-- Sanity: spot pico > 0 en todos los meses 2024+
select count(*) bad
  from public.cammesa_parametros_mensuales
 where parametro = 'precio_spot_pico_pesos_mwh'
   and anio >= 2024
   and (valor is null or valor <= 0);
-- esperado: 0
```

### 4.3 T2.4 — `excedente_mensual` desde `raw_dexc` 🔴

> **Brief detallado:** `docs/briefs/cammesa_t2_4_excedente_mensual.md` (lectura obligatoria para esta tarea).
>
> **Diccionario de columnas:** `docs/cammesa/T0.1_dictionary.md` § raw_dexc.

**Origen.** `raw_dexc` (1,33 M filas, ANEXO 11 — Resol. SE 1281/06 — Demanda Excedente). Multi-sección:

| Sub-anexo | Marcador | `col_count` | Naturaleza |
|---|---|---|---|
| A11.precios | `Prec.Dem.Exc.Dias Hab.Hs.Valle,Diurnas,Pico:` | 4 | precios DEx (van a `cammesa_parametros_mensuales`) |
| A11.1 GUMA | `Demanda Base - Dias Habiles ...` | 19 | demanda base vs real (18 valores: 9 base + 9 real) |
| A11.2 GUMA cargos | `Demanda Demanda Contratos ... Cargo Costo ... Saldo` | 14-15 | importes en pesos + saldo |
| A11.3 GUME | similar a A11.1/A11.2 con GUME | 9-11 | idem para GUME |
| A11.GUDI | `Agente Ag.GUDI Hs.Valle ...` | 12 | DEx para GUDI |

**Tabla L2 sugerida:**

```sql
create table if not exists public.excedente_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  agente_nemo text not null,
  distribuidor_nemo text null,
  tipo_agente text not null check (tipo_agente in ('GUMA','GUME','GUDI')),
  -- Demanda base (3 días × 3 bandas)
  dem_base_hab_valle_mwh numeric null,
  dem_base_hab_diurna_mwh numeric null,
  dem_base_hab_pico_mwh numeric null,
  dem_base_sab_valle_mwh numeric null,
  dem_base_sab_diurna_mwh numeric null,
  dem_base_sab_pico_mwh numeric null,
  dem_base_dom_valle_mwh numeric null,
  dem_base_dom_diurna_mwh numeric null,
  dem_base_dom_pico_mwh numeric null,
  -- Demanda real (idem)
  dem_real_hab_valle_mwh numeric null,
  dem_real_hab_diurna_mwh numeric null,
  dem_real_hab_pico_mwh numeric null,
  dem_real_sab_valle_mwh numeric null,
  dem_real_sab_diurna_mwh numeric null,
  dem_real_sab_pico_mwh numeric null,
  dem_real_dom_valle_mwh numeric null,
  dem_real_dom_diurna_mwh numeric null,
  dem_real_dom_pico_mwh numeric null,
  -- Excedente computado
  dem_excedente_total_mwh numeric null,
  -- Cargos
  cargo_dex_pesos numeric null,
  costo_dex_pesos_mwh numeric null,
  cargo_complementario_pesos numeric null,
  recupero_pesos numeric null,
  saldo_pesos numeric null,
  source_table text not null,
  source_id bigint not null,
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index excedente_mensual_source_uidx
  on public.excedente_mensual(source_table, source_id);
create index excedente_mensual_agente_periodo_idx
  on public.excedente_mensual(agente_nemo, anio, mes);
```

**Función:** `refresh_excedente_mensual(_anio int, _mes int)`.

Estrategia del parser:
1. Filtrar `raw_dexc` por `(_anio, _mes)`.
2. Detectar el sub-anexo por `col_count` y `col_001`.
3. Para A11.1 (`col_count=19`): hacer un INSERT INTO con las 18 columnas de demanda + dejar nulos los cargos.
4. Para A11.2 (`col_count=14-15`): hacer UPDATE sobre las filas ya insertadas en el mismo `(agente, distribuidor)` para llenar los cargos. **O** insertar como filas nuevas con `tipo_agente='GUMA-cargos'` y luego unificar en mart. Definí cuál preferís (recomiendo el primero: una fila por agente con todo).
5. Idem para A11.3 GUME y A11.GUDI.

**Cuidado.** El parser tiene que validar que la suma `9 base + 9 real = 18 valores` matchee el `col_count` esperado. Si encuentra `col_count` distinto al esperado, descartar la fila y logear (no insertar parcial).

**Validación de cierre:**

```sql
select count(*) rows, count(distinct (anio,mes)) periodos,
       count(*) - count(distinct (source_table, source_id)) dupes,
       count(*) filter (where agente_nemo !~ '^[A-Z0-9-]{8}$') bad_nemo,
       count(*) filter (where dem_real_hab_pico_mwh < 0) negs
  from public.excedente_mensual;
-- esperado: rows ~ 25k-50k según ya cuántos GUMA/GUME/GUDI hay/mes,
-- periodos = 63, dupes = 0, bad_nemo = 0, negs = 0

-- Sanity: para cada fila A11.2, dem_real_total > 0 implica saldo no-nulo
select count(*) rows_sin_saldo
  from public.excedente_mensual
 where (dem_real_hab_pico_mwh + dem_real_hab_valle_mwh + dem_real_hab_diurna_mwh) > 0
   and saldo_pesos is null
   and anio >= 2024;
-- esperado: 0 o muy bajo (warning)

-- Distribución por tipo_agente
select tipo_agente, count(*) from public.excedente_mensual group by 1;
```

### 4.4 T2.5 — `dte_resumen_agente` desde `raw_dte` 🔴

> **Brief detallado:** `docs/briefs/cammesa_t2_5_dte_resumen_agente.md` (lectura obligatoria).

**Origen.** `raw_dte` (1,15 M filas). Es el archivo "índice" del DTE: contiene un resumen económico por agente para cada concepto del mes (compra spot, venta spot, MATER, transporte, sanciones, fondos, etc.). Está dividido en sub-secciones numeradas: `1.`, `1.5`, `2.`, …, `15.`.

**Tabla L2 sugerida (long format):**

```sql
create table if not exists public.dte_resumen_agente (
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

create unique index dte_resumen_agente_uidx
  on public.dte_resumen_agente(source_table, source_id, concepto, coalesce(subconcepto,''));
create index dte_resumen_agente_agente_periodo_idx
  on public.dte_resumen_agente(agente_nemo, anio, mes);
create index dte_resumen_agente_concepto_periodo_idx
  on public.dte_resumen_agente(concepto, anio, mes);
```

**Enum de `concepto`** (ampliable, mantener consistencia):

```
spot_compra            spot_venta             mater_compra
mater_venta            transp_at              transp_dt
transp_pesos_mwh       sobrec_combustible     cargo_servicios
cargo_serv_conf        cargo_recupero_op      cargo_comercializ
cargo_excedente        reliquidacion          fondos
sanciones              penal_capacidad        penal_supervision
cargo_obras            oym_transporte         remun_pot_disp_base
remun_pot_digo         servicios_aux          venta_pot_res_op
imp_exp                cargo_ampliac_at       cargo_ampliac_dt
energia_adic           potencia_pesos
```

**Estrategia del parser (state machine):**

```
estado := 'inicio'
para cada fila r ordenada por (anio, mes, source_file, source_row):
    if r.col_001 matchea '^(\d+)\.\s+(.+)':
        sección actual := capturar (sección_numero, sección_nombre)
        estado := 'header'
        continuar
    if r.col_001 matchea '^Agente|^Generad' o todas celdas en {MWh,$,PESOS}:
        estado := 'leyendo_datos'
        continuar
    if r.col_001 matchea '^TOTAL|^TOTALES':
        # subtotal — usar para validación cruzada, no insertar
        continuar
    if estado == 'leyendo_datos' y col_001 matchea NEMO:
        rutear a parser_seccion_<n>(r)
```

Los parsers `parser_seccion_<n>` saben qué `concepto` emitir según la sub-sección actual y qué columnas son MWh y cuáles son pesos según el header detectado.

**Idempotencia:** delete + insert por `(_anio, _mes)`.

**Validación de cierre:**

```sql
select count(*) rows, count(distinct (anio,mes)) periodos,
       count(*) - count(distinct (source_table, source_id, concepto, coalesce(subconcepto,''))) dupes,
       count(distinct concepto) conceptos
  from public.dte_resumen_agente;
-- esperado: rows >> 100k, periodos=63, dupes=0, conceptos >= 20

-- Que cada agente tenga al menos 1 concepto por mes (sanity)
select count(distinct (agente_nemo, anio, mes)) tuplas
  from public.dte_resumen_agente;

-- Que los subtotales del archivo cuadren contra la suma del concepto
-- Ejemplo: spot_compra suma debería ~ aparecer en dte_resumen_agente.mwh
-- (validar con muestra de 3 períodos)
```

### 4.5 Batch 3 — T2.7 a T2.15 (paralelizables, prioridad baja-media)

Para cada uno: brief con esquema L2, función refresh, validación de cierre. Son recetas similares a Batch 1.

| Tarea | Tabla L2 | Origen | Notas |
|---|---|---|---|
| T2.7 | `reliquidacion_mensual` | `raw_aama` (4.193 filas) | Long format. Concepto ∈ {`transporte`, `penal_capacidad`, …}. Sólo 16 períodos publicados (esperado). |
| T2.8 | `gume_detalle_mensual` | `raw_anexo_gume` (299 k filas) | 4 layouts en el tiempo (ver T0.1). Mismo schema que GUMA pero recortado. |
| T2.9 | `gudi_detalle_mensual` | `raw_gudi` (98 k) + `raw_adis` (91 k) | Combinar las 2 fuentes con `tipo_distrib ∈ {GUDI, ADIS}`. Sólo 25 períodos para GUDI (Res. 976/2023 desde 2024-03). |
| T2.10 | `generacion_maquina_mensual` | `raw_agen` + `raw_anexo_gen111…114/13` | La más compleja. Cubre energía, potencia, escala (TG/TV/CC/HI/EO/FV/NU/BIO), cargos, disponibilidad. **Estimar 1 chat hijo dedicado por 3-4 días.** |
| T2.11 | `disponibilidad_maquina_mensual` | `raw_anexo_gen_disp_mejora` + `raw_anexo_generacion_forzada` | 13.345 filas combinadas. Liviano. |
| T2.12 | `imp_exp_mensual` | `raw_aexp` (9.874) | Por país (CHILE, BRASIL, URUGUAY, PARAGUAY) + tipo (IMP/EXP). |
| T2.13 | `auto_mensual` | `raw_auto` (16.346) | Mismo schema que `guma_detalle_mensual` + columna `generacion_autogenerada_mwh`. Tipo agente = AUTOGEN. |
| T2.14 | `mater_renovable_mensual` + `mater_cvt_mensual` | `raw_anexo_mat_*` (5 tablas) | Ya tenemos parser MATER base; éste extiende para PLUS, RENOVABLE, CVT. |
| T2.15 | `cargos_comerc_mensual` | `raw_adco` (143.683) | Layout simple (8 cols). |

**Cómo despachar cada uno:** crear `docs/briefs/cammesa_t2_<n>_<tabla>.md` siguiendo el formato de los briefs T2.1-T2.6. Cada brief contiene esquema, mapping de columnas, regex de detección de sub-anexo, validaciones, ejemplos.

---

## 5. Fase 3 — Marts L3

> **Modelo target:** `docs/cammesa/T0.3_target_model.md` § 4 (detalle de cada mart).

### 5.1 Visión general

11 marts. Cada uno es una tabla denormalizada lista para consumir por una pantalla, con 1 sola query. Todas las marts:

- Tienen función `refresh_<mart>(_anio int, _mes int)` idempotente.
- Llevan `parser_version`, `source_marts text[]` (qué L2 consumieron) y `procesado_en`.
- RLS adecuada (por agente / globales / por plan).

| Mart | Depende | Habilita pantalla | Prioridad |
|---|---|---|---|
| **T3.0** `rebuild_datos_mensuales` | T2.1 + T2.2 + T2.3 + T2.4 + T2.15 + parametros | refactor del legacy | 🔴 |
| T3.1 `factura_sombra_mensual` | T2.1+T2.4+T2.5+T2.6+T2.3+T2.7+T2.15 | 1.1 Factura-Sombra | 🔴 |
| T3.2 `mater_pnl_contrato_mensual` | T2.1 + T2.14 + `contratos` + parametros | 1.2 MATER P&L | 🔴 |
| T3.3 `curva_costo_marginal_horaria` | series-tiempo (`cammesa_generacion`, `cammesa_combustibles`) | 1.3 Curva costo marg. | 🔴 |
| T3.4 `exposicion_spot_mensual` | T2.1 + T2.2 + T2.4 + parametros | 1.4 Exposición Spot/DEXC | 🔴 |
| T3.5 `peer_benchmark_mensual` | `cammesa_demanda_historica` + T2.5 | 2.1 Benchmark | 🟡 |
| T3.6 `mater_pricing_index_mensual` | T2.1 + T2.14 + `cammesa_potencia_instalada` | 2.2 MATER Pricing Index | 🟡 |
| T3.7 `transporte_forensics_mensual` | T2.3 + parametros | 2.3 Transporte Forensics | 🟡 |
| T3.8 `disponibilidad_generador_mensual` | T2.10 + T2.11 + `contratos` | 2.4 Disponibilidad gen. | 🟡 |
| T3.9 `compliance_renovable_mensual` | T2.1 + T2.14 + T2.5 + parametros | 3.4 Compliance Ley 27.191 | 🟢 |
| T3.10 `combustibles_vs_spot_mensual` | series-tiempo + T2.10 | 3.1 Combustibles vs Spot | 🟢 |
| T3.11 `imp_exp_impacto_mensual` | T2.12 + series-tiempo | 3.2 Imp/Exp | 🟢 |

### 5.2 Detalle de cada mart

#### T3.0 — `rebuild_datos_mensuales` (refactor legacy)

**Por qué.** `datos_mensuales` ya existe y la consume `AdminModule1-4` (`src/services/adminData.ts`). Se mantiene **por compatibilidad** pero se repuebla desde L2 (no desde lógica ad-hoc en `adminData.ts`).

**Función:** `public.rebuild_datos_mensuales(_anio int, _mes int)`.

**Lógica:**

```sql
-- Para cada empresa cliente (CRM)
for empresa in (select id, nemo from empresas inner join nemos on …):
  -- demanda + cargos
  d := select * from guma_detalle_mensual where agente_nemo=empresa.nemo and anio=_anio and mes=_mes;
  -- mater
  m := select sum(energia_total_mwh), sum(importe_contrato_pesos), sum(precio_efectivo_pesos_mwh*energia_total_mwh)/sum(energia_total_mwh)
       from mater_contrato_mensual where demandante_nemo=empresa.nemo and anio=_anio and mes=_mes;
  -- transporte
  t := select sum(pesos), sum(pesos_por_mwh) from transporte_concepto_mensual where agente_nemo=empresa.nemo and anio=_anio and mes=_mes;
  -- excedente
  e := select dem_excedente_total_mwh, cargo_dex_pesos, saldo_pesos from excedente_mensual where agente_nemo=empresa.nemo and anio=_anio and mes=_mes;
  -- parametros
  p := select valor from cammesa_parametros_mensuales where parametro=… and anio=_anio and mes=_mes;

  -- Computar y upsert
  insert into datos_mensuales (...)
  on conflict (empresa_id, anio, mes) do update set ...;
```

**Compatibilidad obligatoria.** No cambiar el schema de `datos_mensuales` — los Modules 1-4 actuales lo leen.

---

#### T3.1 — `factura_sombra_mensual` (mart estrella)

**Tabla L3:**

```sql
create table public.factura_sombra_mensual (
  id bigserial primary key,
  anio int not null,
  mes int not null,
  agente_nemo text not null,
  -- Cargos (sumados desde L2)
  cargo_compra_spot_pesos numeric not null default 0,
  cargo_energ_adic_pesos numeric not null default 0,
  cargo_servicios_pesos numeric not null default 0,
  cargo_recupero_oper_pesos numeric not null default 0,
  cargo_serv_conf_pesos numeric not null default 0,
  cargo_transp_at_pesos numeric not null default 0,
  cargo_transp_dt_pesos numeric not null default 0,
  cargo_potencia_pesos numeric not null default 0,
  cargo_comercializ_pesos numeric not null default 0,
  cargo_excedente_pesos numeric not null default 0,
  cargo_mater_pesos numeric not null default 0,
  creditos_aama_pesos numeric not null default 0,
  -- Totales
  factura_sombra_total_pesos numeric not null,
  factura_real_total_pesos numeric null,
  desvio_pesos numeric null,           -- sombra - real
  desvio_pct numeric null,             -- desvio / real
  flag_revisar boolean not null default false,  -- abs(desvio_pct) > 1.0
  -- Trazabilidad
  parser_version text not null,
  procesado_en timestamptz not null default now()
);

create unique index factura_sombra_mensual_agente_periodo_uidx
  on public.factura_sombra_mensual(agente_nemo, anio, mes);
```

**Función:** `public.refresh_factura_sombra_mensual(_anio int, _mes int)`.

**Cálculo:**

```sql
-- Para cada agente (todos los GUMA/GUME/GUDI con datos en el período)
with cargos_guma as (
  select agente_nemo,
         compra_spot_pesos as cargo_compra_spot_pesos,
         cargo_energia_adicional_pesos as cargo_energ_adic_pesos,
         cargo_servicios_pesos,
         recupero_costos_operat_pesos as cargo_recupero_oper_pesos,
         cargo_serv_confiabilidad_pesos as cargo_serv_conf_pesos,
         cargo_transp_at_pesos,
         cargo_transp_dt_pesos,
         potencia_pesos as cargo_potencia_pesos,
         cargo_comercializ_cc_pesos as cargo_comercializ_pesos
    from public.guma_detalle_mensual
   where anio=_anio and mes=_mes
),
mater_agg as (
  select demandante_nemo as agente_nemo,
         sum(importe_contrato_pesos) as cargo_mater_pesos
    from public.mater_contrato_mensual
   where anio=_anio and mes=_mes
   group by demandante_nemo
),
exc_agg as (
  select agente_nemo, cargo_dex_pesos as cargo_excedente_pesos
    from public.excedente_mensual
   where anio=_anio and mes=_mes
),
aama_agg as (
  select agente_nemo, sum(pesos) as creditos_aama_pesos
    from public.reliquidacion_mensual
   where anio=_anio and mes=_mes
   group by agente_nemo
),
real_total as (
  select agente_nemo, sum(pesos) as factura_real_total_pesos
    from public.dte_resumen_agente
   where anio=_anio and mes=_mes
   group by agente_nemo
)
insert into public.factura_sombra_mensual (...)
select
  cg.agente_nemo, _anio, _mes,
  coalesce(cg.cargo_compra_spot_pesos, 0),
  coalesce(cg.cargo_energ_adic_pesos, 0),
  …,
  coalesce(m.cargo_mater_pesos, 0),
  coalesce(a.creditos_aama_pesos, 0),
  -- factura_sombra
  (cg.cargo_compra_spot_pesos + cg.cargo_energ_adic_pesos + … + m.cargo_mater_pesos - a.creditos_aama_pesos) as factura_sombra_total_pesos,
  rt.factura_real_total_pesos,
  factura_sombra_total_pesos - rt.factura_real_total_pesos as desvio_pesos,
  …
on conflict ...;
```

**Output esperado:** ~150-200 agentes/mes con factura sombra calculada y comparada contra el DTE real.

---

#### T3.2 — `mater_pnl_contrato_mensual`

**Una fila por** `(demandante_nemo, generador_nemo, conjunto_generador, anio, mes)`. Schema y cálculo en T0.3 § 4.2.

**Insumos clave:**
- `mater_contrato_mensual` (L2): volumen real y precio efectivo del mes.
- `contratos` (CRM): volumen contratado, precio contrato (USD/MWh).
- `cammesa_parametros_mensuales`: precio spot promedio del mes para comparación.
- `cammesa_potencia_instalada`: tecnología y MW del generador para factor de capacidad.

**Métricas calculadas:**
- `volumen_contratado_mwh` vs `volumen_real_mwh` → `desvio_volumen_mwh`, `under_delivery_pct`
- `ahorro_vs_spot_pesos = volumen_real * (precio_spot - precio_contrato_pesos)`
- `factor_capacidad_pct = volumen_real / (potencia_mw * horas_mes)`
- `flag_under_delivery = under_delivery_pct > 5%`

---

#### T3.3 — `curva_costo_marginal_horaria` (la única horaria)

**Tabla L3:**

```sql
create table public.curva_costo_marginal_horaria (
  fecha_hora timestamp primary key,
  demanda_total_mw numeric,
  gen_termico_mw numeric,
  gen_hidro_mw numeric,
  gen_renov_mw numeric,
  gen_nuclear_mw numeric,
  gen_importacion_mw numeric,
  tecnologia_marginal text,    -- enum: 'Hidro','CC Gas','TG Gas','TV Carbon','TG GasOil','TG Fuel'
  costo_marginal_estim_usd_mwh numeric,
  precio_spot_publicado_usd_mwh numeric,
  parser_version text,
  procesado_en timestamptz default now()
);
```

**Insumos:** `cammesa_generacion`, `cammesa_porcentaje_generacion`, `cammesa_demanda_temperatura`, `cammesa_combustibles`, `datos_mercado.precio_spot_usd_mwh`.

**Lógica del costo marginal:** ordenar la generación despachada por precio variable; la última térmica activa fija el costo marginal de la hora. El precio variable estimado por tecnología (USD/MWh):

| Tecnología | Costo variable estimado |
|---|---|
| Nuclear | 5-10 |
| Hidro / EOL / Solar | 0 |
| CC Gas | 25-45 (según precio gas) |
| TG Gas | 50-90 |
| TV Carbón | 60-110 |
| TG GasOil | 200-350 |
| TG Fuel | 250-400 |

> **Nota:** los rangos son guidance. El parser debe usar precios de combustible reales si están en `cammesa_combustibles` (heat-rate × precio combustible).

---

#### T3.4 — `exposicion_spot_mensual`

Por agente y mes. Schema en T0.3 § 4.4. Calcula:

```
demanda_total_mwh = guma_detalle_mensual.demanda_real_total_mwh
mater_mwh         = sum(mater_contrato_mensual.energia_total_mwh)
mat_base_mwh      = sum(mater_contrato_mensual.energia_total_mwh) where tipo_contrato='BASE'
acuerdo_mensual_mwh = empresas.acuerdo_mensual_mwh                    -- desde CRM
spot_legitimo_mwh = max(0, demanda - mater - acuerdo)
excedente_*       = excedente_mensual.dem_real_*_mwh - dem_base_*_mwh
cargo_excedente_evitable_pesos = (excedente_pico_mwh * 0.10) * precio_dex_hab_pico
```

---

#### T3.5 — `peer_benchmark_mensual`

Anonimizado (no por agente). Una fila por `(tipo_agente, region, tarifa, anio, mes)` con percentiles 25/50/75 de demanda, % MATER y costo monomico USD/MWh.

**Insumos:**
- `cammesa_demanda_historica` (catálogo público de demanda por nemo + tipo + región + tarifa).
- `dte_resumen_agente` para sumar cargos y derivar costo monomico.

---

#### T3.6 — `mater_pricing_index_mensual`

Por mes y tecnología. Insumos: `mater_contrato_mensual` + `mater_renovable_mensual` (T2.14) + `cammesa_potencia_instalada` para identificar tecnología del generador. Mediana/percentiles ponderados de precio efectivo (USD/MWh).

---

#### T3.7 — `transporte_forensics_mensual`

Pivote de `transporte_concepto_mensual` con benchmark contra mediana de la zona. Una fila por `(agente_nemo, concepto_transporte, anio, mes)`.

```
pesos_por_mwh = transporte_concepto_mensual.pesos / demanda_real_total_mwh
mediana_zona  = percentile(pesos_por_mwh) en agentes de la misma zona del mes
desvio_pct    = (pesos_por_mwh - mediana_zona) / mediana_zona
flag_outlier  = abs(desvio_pct) > 0.15
```

---

#### T3.8 — `disponibilidad_generador_mensual`

Solo por contratos del cliente (CRM). Una fila por `(cliente_empresa_id, generador_nemo, unidad_comerc, anio, mes)`. Métricas:

- `factor_capacidad_pct = energia_real_mwh / (potencia_mw * horas_mes)`
- `disp_declarada_pct` vs `disp_realizada_pct` → `desvio_disp_pp`
- `horas_forzadas` (de `disponibilidad_maquina_mensual`)
- `score_salud` (0..100): heurística sobre los 3 anteriores
- `flag_alerta = score_salud < 60`

---

#### T3.9 — `compliance_renovable_mensual`

Por agente y mes. Cumplimiento Ley 27.191 (mínimo 20 % renovable).

```
mater_renovable_mwh = sum from mater_renovable_mensual + mater_contrato_mensual where tipo_contrato='RENOVABLE'
demanda_total_mwh   = guma_detalle_mensual.demanda_real_total_mwh
pct_renovable_mes   = mater_renovable_mwh / demanda_total_mwh
pct_renovable_ytd   = sum(mater_renovable_mwh ytd) / sum(demanda ytd)
pct_objetivo        = cammesa_parametros_mensuales['pct_obligatorio_ley_27191']
cumple              = pct_renovable_ytd >= pct_objetivo / 100
cargo_incumplimiento_estim_pesos = (pct_objetivo*demanda_ytd - mater_renov_ytd) * precio_mater_index
```

---

#### T3.10 / T3.11

Marts agregados a nivel país (no por agente). Útiles para AdminModule3 (mercado) y para el "MATER Pricing Index" público de marketing.

### 5.3 Validación de cierre Fase 3

```sql
-- Cobertura de los marts ancla
select 'factura_sombra' m, count(*) rows, count(distinct agente_nemo) agentes, count(distinct (anio,mes)) periodos
  from public.factura_sombra_mensual
union all
select 'mater_pnl', count(*), count(distinct demandante_nemo), count(distinct (anio,mes))
  from public.mater_pnl_contrato_mensual
union all
select 'spot_exp', count(*), count(distinct agente_nemo), count(distinct (anio,mes))
  from public.exposicion_spot_mensual;

-- Sanity: factura_sombra cierra contra dte_resumen_agente con desvio < 5% en >95% de los agentes
select count(*) total, count(*) filter (where abs(desvio_pct) < 5) ok, round(avg(abs(desvio_pct)), 2) avg_desvio
  from public.factura_sombra_mensual
 where factura_real_total_pesos > 0
   and anio >= 2024;
-- esperado: ok / total > 0.95
```

---

## 6. Fase 4 — UI / Pantallas premium

> **Stack actual del frontend:**
> - React 18 + TypeScript + Vite.
> - Tailwind CSS para estilos.
> - **Recharts** para gráficos (no MUI, no Chart.js).
> - Componentes UI custom: `Badge`, `Button`, `LoadingScreen`, `Panel`, `StatCard` (en `src/components/ui/`).
> - Helpers compartidos: `src/pages/admin/moduleScreenShared.tsx` (formatters, FilterPicker, EmptyState, ChartPanel).
> - Hook `useAsyncData` para carga.
> - Cliente Supabase desde `src/lib/supabase.ts`.
>
> **Convenciones a respetar:**
> - Una pantalla = un archivo `.tsx` en `src/pages/admin/` o `src/pages/clientes/` (premium).
> - Datos cargados por una sola función `loadX()` desde `src/services/adminData.ts` o equivalente cliente.
> - Filtros: rango de meses (`desde`/`hasta`) + selector de agente. Se persiste a query string.
> - Loading: `<LoadingScreen />`. Empty: `<EmptyState />`. Error: toast + retry.
> - **Mobile-first** para las pantallas cliente; admin puede ser desktop-first.

### 6.1 Pantallas a construir (mapa)

| ID | Pantalla | Audiencia | Plan requerido | Mart L3 |
|---|---|---|---|---|
| T4.1 | AdminModule1 (refactor) | Admin EnergyOS | n/a | datos_mensuales (refactor) |
| T4.2 | AdminModule2 (refactor) | Admin | n/a | datos_mensuales |
| T4.3 | AdminModule4 (refactor) | Admin | n/a | datos_mensuales |
| T4.4 | **Factura-Sombra** 🔴 | Cliente | gestion+ | factura_sombra_mensual |
| T4.5 | **MATER P&L** 🔴 | Cliente | gestion+ | mater_pnl_contrato_mensual |
| T4.6 | **Curva Costo Marginal** 🔴 | Cliente | full+ | curva_costo_marginal_horaria |
| T4.7 | **Exposición Spot/DEXC** 🔴 | Cliente | gestion+ | exposicion_spot_mensual |
| T4.8 | Peer Benchmark 🟡 | Cliente | full+ | peer_benchmark_mensual |
| T4.9 | MATER Pricing Index 🟡 | Cliente + público | gestion+ (público gancho) | mater_pricing_index_mensual |
| T4.10 | Transporte Forensics 🟡 | Cliente | full+ | transporte_forensics_mensual |
| T4.11 | Disponibilidad Generador 🟡 | Cliente | full+ | disponibilidad_generador_mensual |
| T4.12 | Combustibles vs Spot 🟢 | Cliente | white-label | combustibles_vs_spot_mensual |
| T4.13 | Imp/Exp Impacto 🟢 | Cliente | white-label | imp_exp_impacto_mensual |
| T4.14 | Compliance Ley 27.191 🟢 | Cliente | gestion+ | compliance_renovable_mensual |
| T4.15 | Forecast demanda+clima 🟢 | Cliente | white-label | (proyecto aparte) |

### 6.2 Detalle por pantalla nivel 1 (las 4 que justifican el ticket alto)

#### T4.4 — Factura-Sombra

**Filename:** `src/pages/clientes/FacturaSombra.tsx`.
**Ruta:** `/clientes/factura-sombra`.
**Audiencia:** CFO / Energy Manager del agente.
**Pitch:** "Cuanto dice CAMMESA que pagaste vs cuánto deberías haber pagado, desglosado por concepto."

**Layout (top-to-bottom):**

1. **Header** con nombre del agente, periodo seleccionado, último procesado_en.
2. **Filtros (sticky):** agente (selector con search), rango mes desde/hasta.
3. **Banner de alerta** si `flag_revisar = true` para el último mes: "Detectamos un desvío de X% sobre tu factura CAMMESA del mes pasado. Revisar conceptos en rojo."
4. **Cards de KPI (StatCard, 4 columnas):**
   - Factura CAMMESA del mes: **$X,XXX,XXX**
   - Factura sombra: **$X,XXX,XXX** (calculada por nosotros)
   - Desvío: **+X,XX%** (verde si <1%, amarillo 1-5%, rojo >5%)
   - Ahorro detectado YTD: **$X,XXX,XXX**
5. **Gráfico A — Composición de factura (bar stacked horizontal)**:
   - 1 barra por concepto (compra spot, energ adic, servicios, transp AT, transp DT, MATER, excedente, cargos…), ordenadas de mayor a menor.
   - Color rojo si el concepto tiene desvío vs lo esperado, gris si está OK.
   - Tooltip: pesos absolutos + % del total + delta vs mes anterior.
6. **Gráfico B — Evolución mensual (composed: bars + line)**:
   - Eje X: meses del rango.
   - Bars: factura sombra desglosada por categoría grande (energía / transporte / cargos / MATER / créditos AAMA).
   - Line overlay: factura real total CAMMESA.
   - Drilldown click: lleva al detalle del mes.
7. **Tabla detalle (abajo):**

   | Concepto | Sombra ($) | Real CAMMESA ($) | Desvío ($) | Desvío (%) | Flag |
   |---|---:|---:|---:|---:|---|
   | Compra spot | … | … | … | … | ✓/⚠ |
   | Cargo MATER | … | … | … | … | … |
   | Cargo transporte AT | … | … | … | … | … |
   | … (todas) | | | | | |
   | **TOTAL** | **…** | **…** | **…** | **…** | |

   Columnas ordenables. Click en una fila → modal con drilldown:
   - "Cargo transporte AT": muestra `transporte_concepto_mensual` desglosado por concepto del CUST, con cada cargo en pesos y comparación con la mediana de la zona.
   - "Cargo MATER": muestra cada contrato `mater_contrato_mensual` con volumen, precio efectivo, generador.

8. **Botón "Exportar PDF"** (genera PDF de la factura-sombra del mes seleccionado).

**Datos consumidos:**

```sql
select * from factura_sombra_mensual
 where agente_nemo = $1 and anio*100+mes between $2 and $3
 order by anio, mes;
```

**Drilldowns adicionales:**
- `transporte_concepto_mensual` filtrado por agente y periodo (concepto del cargo de transporte).
- `mater_contrato_mensual` filtrado por demandante_nemo y periodo (cada contrato).
- `dte_resumen_agente` filtrado por agente y periodo (línea por concepto del DTE real).

**RLS:** policy en `factura_sombra_mensual`:
```sql
using (
  exists (select 1 from public.empresas e
          inner join public.nemos n on n.empresa_id = e.id
          where e.user_id = auth.uid()
            and n.nemo = factura_sombra_mensual.agente_nemo)
)
```

**Plan:** `gestion`, `full`, `white-label`. NO disponible en `compliance`.

---

#### T4.5 — MATER P&L (Profit & Loss por contrato)

**Filename:** `src/pages/clientes/MaterPnL.tsx`.
**Ruta:** `/clientes/mater-pnl`.
**Audiencia:** Energy Manager / Trading.
**Pitch:** "Cada contrato MATER tuyo: cuánta energía recibiste vs contrataste, qué precio efectivo te quedó, y cuánto ahorraste vs el spot."

**Layout:**

1. **Filtros:** agente, rango fecha.
2. **Cards KPI:**
   - Total energía MATER recibida (MWh): X,XXX
   - Cumplimiento promedio (%): XX% (volumen real / contratado)
   - Ahorro vs spot YTD ($): $X,XXX,XXX
   - N° contratos under-delivery: X (de Y totales)
3. **Gráfico A — Ranking de contratos (bar horizontal):**
   - Eje Y: cada contrato (`generador_nemo` / `conjunto_generador`).
   - Eje X: ahorro vs spot acumulado del rango ($).
   - Colores: verde >0 (ahorro), rojo <0 (sobrecosto).
   - Click → drilldown del contrato.
4. **Gráfico B — Cumplimiento mensual (composed):**
   - Eje X: meses.
   - Bars apiladas: volumen recibido por contrato.
   - Line overlay: volumen total contratado (target).
   - Visualiza under-delivery por mes.
5. **Tabla detalle:**

   | Generador | Conjunto | Tipo | Vol. contratado (MWh) | Vol. real (MWh) | Cumplimiento (%) | Precio contrato (USD/MWh) | Precio efectivo (USD/MWh) | Precio spot (USD/MWh) | Ahorro vs spot ($) | Factor capac. (%) | Flag |
   |---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
   | … | … | RENOVABLE | … | … | … | … | … | … | … | … | ⚠ |

   Columnas ordenables. Click en fila → modal con timeline mensual del contrato (12 últimos meses), curva de despacho del generador (de `generacion_maquina_mensual`).

**Datos:** `select * from mater_pnl_contrato_mensual where demandante_nemo=$1 …`.

**RLS:** por demandante_nemo igual que T4.4.

**Plan:** `gestion+`.

---

#### T4.6 — Curva de Costo Marginal

**Filename:** `src/pages/clientes/CurvaCostoMarginal.tsx`.
**Ruta:** `/clientes/costo-marginal`.
**Audiencia:** Operaciones / Demand Manager.
**Pitch:** "Las 200 horas más caras del mes pasado y cómo desplazar tu carga para ahorrar."

**Layout:**

1. **Filtros:** mes (un solo mes — esta vista es horaria).
2. **Cards KPI:**
   - Costo marginal promedio del mes: $XX/MWh
   - Hora más cara: 19:00 del 13/02 con $XXX/MWh
   - % horas con CC Gas marginal: XX%
   - Ahorro potencial estimado desplazando 10% de pico→valle: $X,XXX
3. **Gráfico A — Heat-map 24×31 (días × horas):**
   - Color: costo marginal de cada hora (verde-amarillo-rojo).
   - Hover: tooltip con costo $ + tecnología marginal + demanda MW.
4. **Gráfico B — Curva diaria típica (line, 24 puntos):**
   - Promedio de costo marginal por hora del día (a lo largo del mes).
   - Línea verde: hidro. Roja: TG GasOil. Banda: rango p25-p75.
5. **Gráfico C — Mix de generación apilado (area chart, 24 puntos):**
   - Eje X: hora del día.
   - Áreas apiladas: nuclear / hidro / térmica / renovable / importación.
6. **Recomendación automática:**
   - "Tu pico se da entre las 18-21 hs. Desplazar 10% de carga al valle (02-06) podría ahorrar $XX,XXX/mes."

**Datos:**

```sql
select * from curva_costo_marginal_horaria
 where extract(year from fecha_hora)=$1 and extract(month from fecha_hora)=$2
 order by fecha_hora;
```

**RLS:** datos globales, libre. Plan `full+`.

---

#### T4.7 — Exposición Spot / DEXC

**Filename:** `src/pages/clientes/ExposicionSpot.tsx`.
**Ruta:** `/clientes/exposicion-spot`.
**Audiencia:** Energy Manager / Compras.
**Pitch:** "Cuánta energía quedó expuesta al spot el mes pasado, cuánta penalty de demanda excedente pagaste, y simulador de derating."

**Layout:**

1. **Filtros:** agente + rango.
2. **Cards KPI:**
   - Demanda total (MWh): X,XXX
   - Cubierta por MATER + acuerdo (MWh / %): X,XXX / XX%
   - Spot legítimo (MWh): X,XXX
   - Excedente pico (MWh): XXX
   - Cargo excedente del mes ($): $X,XXX,XXX
3. **Gráfico A — Pirámide de cobertura (bar stacked horizontal por mes):**
   - 1 fila por mes.
   - Categorías apiladas: MATER (verde), acuerdo (azul), spot legítimo (gris), excedente (rojo).
   - Permite ver evolución de la exposición a precios spot.
4. **Gráfico B — Cargo excedente vs cargo evitable (bar):**
   - 2 barras por mes: lo que se pagó de DEx vs lo que se hubiera ahorrado con derating del 10% del pico.
5. **Simulador interactivo:**
   - Slider: "% derating de tu pico en horas habiles" (0-30%).
   - En tiempo real recalcula:
     - Excedente esperado (MWh)
     - Cargo evitable ($)
     - Riesgo de no alcanzar producción (warning textual)
   - Botón "Exportar plan de derating PDF".
6. **Tabla detalle por mes:**

   | Mes | Demanda total | MATER | Acuerdo | Spot legítimo | Excedente pico | Excedente valle | Cargo DEx ($) | Saldo neto ($) |
   |---|---:|---:|---:|---:|---:|---:|---:|---:|

**Datos:** `select * from exposicion_spot_mensual where agente_nemo=$1 …`.

**RLS:** por `agente_nemo`. Plan `gestion+`.

---

### 6.3 Detalle por pantalla nivel 2 (resumido)

#### T4.8 — Peer Benchmark

- **Datos:** `peer_benchmark_mensual` + `factura_sombra_mensual` del agente.
- **Vista:** scatter plot (eje X: demanda mensual, eje Y: costo monomico USD/MWh) con puntos del peer group y un punto destacado para el agente. Tooltip anonimizado ("GUMA Cuyo, p35"). Permite identificar si el agente está sub o sobre la mediana.
- **Plan:** `full+`.

#### T4.9 — MATER Pricing Index

- **Datos:** `mater_pricing_index_mensual`.
- **Vista pública (gancho marketing):** `/index/mater` — gráfico simple line chart con precio mediana mes a mes por tecnología (eolico/solar/bio/PAH).
- **Vista premium:** dashboard con percentiles 25/50/75, volumen total, cantidad de contratos, comparativa vs precio del agente.
- **Plan:** público (limitado a 12 meses) + `gestion+` (5 años).

#### T4.10 — Transporte Forensics

- **Datos:** `transporte_forensics_mensual`.
- **Vista:** tabla con cada concepto del CUST, su pesos/MWh y comparación contra mediana de zona. Highlight rojo en outliers.
- **Plan:** `full+`.

#### T4.11 — Disponibilidad Generador

- **Datos:** `disponibilidad_generador_mensual` filtrado por contratos del cliente.
- **Vista:** una card por generador contratado con el `score_salud`, gráfico de FC mensual, y alertas activas.
- **Plan:** `full+`.

### 6.4 Detalle por pantalla nivel 3

#### T4.12 — Combustibles vs Spot
Vista de mercado: correlación gas/gasoil/fuel-oil consumidos vs precio spot mensual. Una línea por combustible + bar de spot. Útil como narrativa para reports.

#### T4.13 — Imp/Exp Impacto
Por país: MWh importados/exportados y delta sobre el spot del bloque horario.

#### T4.14 — Compliance Ley 27.191
Por agente: % renovable mensual vs YTD vs objetivo legal. Card con flag de cumplimiento + cargo estimado por incumplimiento. Generación de reporte PDF para auditoría.

#### T4.15 — Forecast demanda+clima
Requiere ingesta horaria de la curva del agente (proyecto separado, no parte del Batch actual de Fase 4).

### 6.5 Refactor de los AdminModule existentes

#### T4.1 — AdminModule1 (Demanda + MATER + Spot)

**Cambio principal:** agregar drilldown por contrato MATER. Hoy muestra `mater_mwh` agregado; debe permitir click → ver lista de contratos con generador, precio efectivo, volumen.

**Archivo:** `src/pages/admin/AdminModule1.tsx`. **Servicio:** `src/services/adminData.ts → loadAdminModule1()`.

#### T4.2 — AdminModule2 (Costos)

**Cambio principal:** desglose de transporte por concepto (hoy es agregado). Agregar mini-bar chart con los 8 conceptos del CUST.

#### T4.3 — AdminModule4 (Calidad)

**Cambio principal:** reemplazar el flag binario `dato_sospechoso` por reglas auditables explícitas. Cada regla muestra:
- Nombre (ej. "MATER > demanda total")
- % de períodos en que falla
- Lista de períodos sospechosos
- Severidad (P0/P1/P2/P3)

### 6.6 Validación de cierre Fase 4

- Cada pantalla con captura `docs/screenshots/` antes/después.
- Smoke test e2e con Playwright (3 escenarios por pantalla mínimo).
- Performance: cada vista debe cargar en < 2s con 24 meses de datos.
- Mobile: responsive en clientes (admin puede ser desktop).
- Accesibilidad: contraste WCAG AA mínimo, focus visible.

---

## 7. Fase 5 — Operación, observabilidad y planes

### 7.1 T5.1 — Observabilidad de refresh

Extender la tabla existente `ingest_runs` (creada en Fase 1) para registrar también las corridas de refresh L2/L3:

```sql
alter table public.ingest_runs
  add column kind text not null default 'ingest'
    check (kind in ('ingest','refresh_l2','refresh_l3','refresh_mart'));

-- Por refresh:
-- archivo / tabla = nombre de la función o tabla destino
-- filas_insertadas / filas_skipped = output de la función
-- duracion_ms
-- error_text si falla
```

Wrapper estándar para llamar refreshes con instrumentación:

```sql
create or replace function public.run_refresh(_func text, _anio int, _mes int)
returns int as $$
declare
  v_inserted int; v_deleted int; v_pv text; v_t0 timestamptz := clock_timestamp();
begin
  execute format('select * from %s($1,$2)', _func) into v_inserted, v_deleted, v_pv using _anio, _mes;
  insert into ingest_runs(kind, archivo, tabla, filas_insertadas, filas_skipped, duracion_ms, completed_at)
  values ('refresh_l2', _func, _func, v_inserted, v_deleted, extract(milliseconds from clock_timestamp()-v_t0)::int, now());
  return v_inserted;
exception when others then
  insert into ingest_runs(kind, archivo, tabla, error_text, duracion_ms, completed_at)
  values ('refresh_l2', _func, _func, sqlerrm, extract(milliseconds from clock_timestamp()-v_t0)::int, now());
  raise;
end;
$$ language plpgsql;
```

Vista útil:

```sql
create view public.refresh_health as
select kind, tabla,
       count(*) corridas,
       count(*) filter (where error_text is null) ok,
       count(*) filter (where error_text is not null) errores,
       max(completed_at) ultimo,
       avg(duracion_ms) avg_ms
  from public.ingest_runs
 where kind like 'refresh_%'
 group by kind, tabla;
```

### 7.2 T5.4 — Cron mensual

Un job que, después del cierre del DTE de CAMMESA (~día 12 del mes siguiente), ejecute en orden:

```
1. ingest del nuevo mes (raw_*)
2. refresh L2:
   - cammesa_parametros_mensuales
   - mater_contrato_mensual
   - guma_detalle_mensual
   - gume_detalle_mensual
   - gudi_detalle_mensual
   - excedente_mensual
   - dte_resumen_agente
   - cuenta_corriente_agente
   - reliquidacion_mensual
   - transporte_concepto_mensual
   - cargos_comerc_mensual
   - mater_renovable_mensual
   - mater_cvt_mensual
   - generacion_maquina_mensual
   - disponibilidad_maquina_mensual
   - imp_exp_mensual
   - auto_mensual
3. refresh L3:
   - rebuild_datos_mensuales
   - factura_sombra_mensual
   - mater_pnl_contrato_mensual
   - exposicion_spot_mensual
   - peer_benchmark_mensual
   - mater_pricing_index_mensual
   - transporte_forensics_mensual
   - disponibilidad_generador_mensual
   - compliance_renovable_mensual
4. refresh marts globales:
   - curva_costo_marginal_horaria
   - combustibles_vs_spot_mensual
   - imp_exp_impacto_mensual
5. notificación a admins (Slack/email) con resumen
```

Implementación sugerida: Edge Function de Supabase + `pg_cron` + retry con backoff exponencial. Falla → notificación.

### 7.3 T5.5 — Catálogo de KPIs por plan

Tabla `public.plan_features`:

```sql
create table public.plan_features (
  plan text not null check (plan in ('compliance','gestion','full','white-label')),
  feature text not null,    -- ej. 'factura_sombra', 'mater_pnl', 'curva_costo_marginal'
  enabled boolean not null default true,
  primary key (plan, feature)
);

insert into public.plan_features values
  ('compliance', 'datos_mensuales', true),
  ('compliance', 'compliance_renovable', true),
  ('compliance', 'factura_sombra', false),
  ('gestion', 'datos_mensuales', true),
  ('gestion', 'factura_sombra', true),
  ('gestion', 'mater_pnl', true),
  ('gestion', 'exposicion_spot', true),
  ('gestion', 'curva_costo_marginal', false),
  ('gestion', 'peer_benchmark', false),
  ('full', 'datos_mensuales', true),
  ('full', 'factura_sombra', true),
  ('full', 'mater_pnl', true),
  ('full', 'exposicion_spot', true),
  ('full', 'curva_costo_marginal', true),
  ('full', 'peer_benchmark', true),
  ('full', 'transporte_forensics', true),
  ('full', 'disponibilidad_generador', true),
  ('white-label', 'datos_mensuales', true),
  ...;
```

Función helper:

```sql
create function public.has_feature(_feature text)
returns boolean
language sql stable as $$
  select exists (
    select 1
      from public.empresas e
      join public.plan_features pf on pf.plan = e.plan_activo and pf.feature = _feature
     where e.user_id = auth.uid()
       and pf.enabled = true
  );
$$;
```

### 7.4 T5.6 — RLS por plan

Cada mart L3 que sea premium tiene policy:

```sql
create policy factura_sombra_select_premium
  on public.factura_sombra_mensual
  for select to authenticated
  using (
    public.has_feature('factura_sombra')
    and exists (
      select 1 from public.empresas e
        join public.nemos n on n.empresa_id = e.id
       where e.user_id = auth.uid()
         and n.nemo = factura_sombra_mensual.agente_nemo
    )
  );
```

### 7.5 T5.2 — Tests de regresión

Tabla `public.test_snapshots`:

```sql
create table public.test_snapshots (
  id bigserial primary key,
  test_name text not null,
  agente_nemo text not null,
  anio int not null, mes int not null,
  campo text not null,
  valor_esperado numeric,
  tolerance_pct numeric default 0.5,
  created_at timestamptz default now()
);
```

Seed con 5 agentes × 6 meses de cada mart ancla. Función `run_regression_tests()` que verifica `abs(valor_actual - valor_esperado) / valor_esperado <= tolerance_pct`.

Correr en cada CI (GitHub Actions) post-deploy.

### 7.6 T5.3 — Documentación dataflow

Crear `docs/dataflow.md` con diagrama Mermaid mostrando L1 → L2 → L3 → UI con:
- Tablas
- Funciones refresh
- Cron mensual y orden
- Dependencias entre marts

### 7.7 Backups y recovery

Supabase ya hace backups diarios. Adicional sugerido:
- Snapshot pre-refresh de marts críticos (factura_sombra) con `create table … as select from … _backup_YYYYMMDD`.
- TTL: 90 días.
- Procedimiento de recovery documentado (`docs/runbooks/restore_mart.md`).

---

## 8. Roadmap secuenciado completo

```
SEMANA 1 (paralelo)
├── T2.X cammesa_parametros_mensuales (1 chat hijo, 1-2 días)
├── T2.4 excedente_mensual            (1 chat hijo, 3-4 días)
├── T2.5 dte_resumen_agente           (1 chat hijo, 4-5 días)
└── T5.1 observabilidad refresh       (1 chat hijo, 1-2 días)

SEMANA 2 (paralelo)
├── T2.7 reliquidacion_mensual        (1 chat hijo, 1-2 días)
├── T2.8 gume_detalle_mensual         (1 chat hijo, 2-3 días)
├── T2.9 gudi_detalle_mensual         (1 chat hijo, 2-3 días)
├── T2.14 mater_renovable + cvt       (1 chat hijo, 3-4 días)
└── (revisión de Batch 2)

SEMANA 3 (paralelo)
├── T2.10 generacion_maquina          (1 chat hijo, 4-5 días)
├── T2.11 disponibilidad_maquina      (1 chat hijo, 1-2 días)
├── T2.12 imp_exp_mensual             (1 chat hijo, 1-2 días)
├── T2.13 auto_mensual                (1 chat hijo, 1-2 días)
├── T2.15 cargos_comerc_mensual       (1 chat hijo, 1-2 días)
└── T3.0 rebuild_datos_mensuales      (1 chat hijo, 2-3 días)
                          🔒 (depende T2.1-T2.4-T2.15)

SEMANA 4 (paralelo)
├── T3.1 factura_sombra_mensual       (1 chat hijo, 3-4 días)
├── T3.2 mater_pnl_contrato_mensual   (1 chat hijo, 2-3 días)
├── T3.4 exposicion_spot_mensual      (1 chat hijo, 2-3 días)
├── T3.7 transporte_forensics_mensual (1 chat hijo, 1-2 días)
└── T5.4 cron mensual (versión beta)  (1 chat hijo, 2 días)

SEMANA 5
├── T3.3 curva_costo_marginal_horaria (1 chat hijo, 4-5 días — el más complejo)
├── T3.5 peer_benchmark_mensual       (1 chat hijo, 2-3 días)
├── T3.6 mater_pricing_index_mensual  (1 chat hijo, 1-2 días)
├── T3.8 disponibilidad_generador     (1 chat hijo, 2-3 días)
└── T5.5/T5.6 plans + RLS por plan    (1 chat hijo, 2-3 días)

SEMANA 6 (UI nivel 1, paralelo)
├── T4.4 Factura-Sombra              (1 chat hijo, 4-5 días)
├── T4.5 MATER P&L                   (1 chat hijo, 3-4 días)
├── T4.7 Exposición Spot/DEXC        (1 chat hijo, 4-5 días)
└── T4.1-T4.3 Refactor AdminModule1-4 (1 chat hijo, 3-4 días)

SEMANA 7 (UI nivel 1 cont. + nivel 2)
├── T4.6 Curva Costo Marginal        (1 chat hijo, 4-5 días)
├── T4.8 Peer Benchmark              (1 chat hijo, 3 días)
├── T4.10 Transporte Forensics       (1 chat hijo, 3 días)
└── T4.11 Disponibilidad Generador   (1 chat hijo, 3 días)

SEMANA 8 (UI nivel 2 cont. + nivel 3 + cierre)
├── T3.9 compliance_renovable        (1 chat hijo, 2-3 días)
├── T3.10 + T3.11 marts globales      (1 chat hijo, 3-4 días)
├── T4.9 MATER Pricing Index         (1 chat hijo, 3 días)
├── T4.14 Compliance Ley 27.191      (1 chat hijo, 2-3 días)
└── T5.2 tests de regresión           (1 chat hijo, 2-3 días)

SEMANA 9-10 (polish + lanzamiento)
├── T4.12 + T4.13 Combustibles + Imp/Exp (1 chat hijo, 4-5 días)
├── T4.15 Forecast demanda+clima      (1 chat hijo, 4-5 días)
├── Hardening: smoke tests, performance, accesibilidad
├── Doc usuario final por plan
└── Beta cerrado con 3 clientes
```

**Estimado:** 10 semanas con 1 dev senior + 3-4 chats hijos en paralelo en los picos.

---

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Layouts CAMMESA cambian sin aviso (tipico cuando cambia regulación) | alto | Detección de drift: si `col_count` esperado de un raw cambia entre meses, alertar. Mantener mapping `(parser_version, layout)` versionado. |
| `dte_resumen_agente` (T2.5) tiene >20 conceptos, fácil olvidar uno | medio | Subtotal por concepto debe matchear los `'TOTALES >>>>>>>'` del archivo (sanity automatica). |
| Reproceso histórico tarda mucho con 1.3 M de filas DEXC | medio | Particionar `raw_dexc` y `raw_dte` por `anio` (tiene sentido también para queries normales). |
| Cliente premium descubre desvío en factura-sombra que es nuestro bug, no de CAMMESA | crítico | Tests de regresión sólidos + tolerance margin de 1 % + flag "verificar manualmente" en lugar de afirmar. |
| Performance de marts con > 1 año de datos en pantalla | medio | Marts L3 con índice por `(agente_nemo, anio, mes)` + cache de UI por agente+rango. |
| Vol. RLS lookups (cada query mart × empresas+nemos) | medio | View materializada `public.user_agentes` con `(user_id, agente_nemo)` refrescada al login. |
| Conflictos al pushear varias migrations en paralelo | bajo | Cada chat hijo crea migrations con timestamp único; pushear secuencialmente al final. |
| Changes en `datos_mensuales` rompen Modules existentes | alto | T3.0 mantiene mismo schema. Tests de smoke en cada deploy. |
| Datos de CAMMESA inconsistentes entre meses (ej. NEMO renombrado) | medio | Catálogo `cammesa_agentes_mem` mantenido + tabla `agente_nemo_alias` para mapear renombres. |

---

## 10. Procedimiento estándar para cerrar una tarea

Cualquier tarea Lx (sea L2, L3 o UI) cierra siguiendo este checklist:

```
[ ] 1. Migration creada con naming canónico
[ ] 2. Tabla con índice único `(source_table, source_id, ...)` y RLS aplicada
[ ] 3. Función refresh_* implementada con patrón estándar (idempotente)
[ ] 4. Migration pusheada con `npx supabase db push --linked --yes`
[ ] 5. Refresh ejecutado para todos los períodos disponibles
[ ] 6. Validación: dupes=0, regex NEMO si aplica, conteos esperados
[ ] 7. Idempotencia probada: 2da corrida del refresh da rows_inserted == rows_deleted
[ ] 8. (si UI) Tests Playwright + screenshot
[ ] 9. (si UI) Performance < 2s con 24 meses
[ ] 10. Documento status `docs/cammesa_phase<N>_batch<M>_status.md` actualizado
[ ] 11. Brief siguiente (T2.<n+1>) creado/actualizado en `docs/briefs/`
[ ] 12. Commit: `feat(<scope>): <descripción> (<tarea>)` con mensaje técnico
[ ] 13. Push + PR si corresponde
```

---

## 11. Comandos PowerShell útiles (cheatsheet)

```powershell
# Ver migrations remoto vs local
npx --yes supabase migration list --linked

# Pushear migrations pendientes
$env:PYTHONIOENCODING='utf-8'
npx --yes supabase db push --linked --yes

# Ejecutar query rápida (usar UNA línea, los heredocs no llegan bien)
$q = "select count(*) from public.mater_contrato_mensual;"
npx --yes supabase db query --linked --output csv $q

# Reproceso completo de una L2 (template)
$q = "with periods as (select distinct anio, mes from public.raw_<XXX>) select p.anio, p.mes, r.rows_inserted, r.rows_deleted, r.parser_version from periods p cross join lateral public.refresh_<tabla>(p.anio, p.mes) r order by p.anio, p.mes;"
$result = npx --yes supabase db query --linked --output csv $q
$result | Out-File -FilePath "tmp/<tabla>_refresh.csv" -Encoding utf8

# Ver últimos refresh_runs
$q = "select * from public.refresh_health order by ultimo desc limit 20;"
npx --yes supabase db query --linked --output csv $q

# Validar que no hay procesos colgados antes de un reproceso
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*refresh_*' -or $_.CommandLine -like '*supabase db query*'
} | Select-Object ProcessId, Name, CreationDate, CommandLine | Format-List
```

---

## 12. Briefs por tarea (referencia rápida)

Briefs ya disponibles en `docs/briefs/`:

```
cammesa_t2_readme.md                    — overview general de la Fase 2
cammesa_t2_1_mater_contrato_mensual.md  — ✅ aplicado en Batch 1
cammesa_t2_2_guma_detalle_mensual.md    — ✅ aplicado en Batch 1
cammesa_t2_3_transporte_concepto_mensual.md — ✅ aplicado en Batch 1
cammesa_t2_4_excedente_mensual.md       — 🔴 leer y ejecutar
cammesa_t2_5_dte_resumen_agente.md      — 🔴 leer y ejecutar
cammesa_t2_6_cuenta_corriente_agente.md — ✅ aplicado en Batch 1
```

**A crear** (template basado en los existentes):

```
cammesa_t2_X_cammesa_parametros_mensuales.md
cammesa_t2_7_reliquidacion_mensual.md
cammesa_t2_8_gume_detalle_mensual.md
cammesa_t2_9_gudi_detalle_mensual.md
cammesa_t2_10_generacion_maquina_mensual.md
cammesa_t2_11_disponibilidad_maquina_mensual.md
cammesa_t2_12_imp_exp_mensual.md
cammesa_t2_13_auto_mensual.md
cammesa_t2_14_mater_renovable_cvt.md
cammesa_t2_15_cargos_comerc_mensual.md

cammesa_t3_0_rebuild_datos_mensuales.md
cammesa_t3_1_factura_sombra_mensual.md
... (uno por mart)

cammesa_t4_4_factura_sombra.md
cammesa_t4_5_mater_pnl.md
cammesa_t4_6_curva_costo_marginal.md
cammesa_t4_7_exposicion_spot.md
... (uno por pantalla)

cammesa_t5_1_observabilidad_refresh.md
cammesa_t5_4_cron_mensual.md
cammesa_t5_5_planes_features.md
```

Cada brief debe tener: contexto, esquema target, mapping detallado, regex de discriminación, validaciones, ejemplos reales, criterio de cierre.

---

## 13. Quién pregunta qué (FAQ del colega)

**Q: ¿Por qué hay tantas tablas raw_*?**
R: Cada archivo del DTE de CAMMESA es un anexo distinto con layout posicional (TXT) o tabular (HTML). Mantener 42 tablas espejo nos permite re-procesar cualquier mes sin volver a descargar de CAMMESA y trazar bugs de parsing al raw exacto.

**Q: ¿Por qué L2 en lugar de leer raw_* directo desde la UI?**
R: Por 3 razones: (1) los layouts cambian (regex y filtros sucios), (2) la UI necesita queries rápidas (joins entre 5 raw_* tabla cada vez sería inviable), (3) el versionado de parsers (`parser_version`) nos permite invalidar y regenerar cuando aparece un bug.

**Q: ¿Por qué Postgres SQL puro y no un ETL externo?**
R: Mantener todo en Supabase reduce dependencias, despliegues y costo. Las funciones `refresh_*` son SQL puro, fácilmente debuggeable y reproducible. Si en el futuro la complejidad lo justifica, se puede migrar a dbt sin reescribir desde cero.

**Q: ¿Por qué la idempotencia es tan importante?**
R: Porque el reproceso es la operación más común: cada vez que CAMMESA publica un mes nuevo, o que descubrimos un bug y corregimos un parser, tenemos que reprocesar sin duplicar ni perder datos. La idempotencia es la única manera de hacerlo seguro.

**Q: ¿Cómo me entero si CAMMESA cambia un layout?**
R: La validación post-refresh debería detectarlo (`col_count` no esperado, `dupes_source > 0`, regex NEMO falla). Adicionalmente, T5.1 (observabilidad) loguea cantidad de filas insertadas por mes y mart, y un job comparativo mes contra mes podría alertar diffs anómalos.

**Q: ¿Qué pasa si quiero agregar un parámetro nuevo (ej. precio de un servicio que aparece desde 2026)?**
R: Agregar la fila al diccionario T0.1, agregar al parser de `cammesa_parametros_mensuales` la regex correspondiente, y reprocesar los meses que lo traigan. No hay que modificar el resto del pipeline.

**Q: ¿Cómo manejo CAMMESA cuando publica un mes con datos errados (ya pasó)?**
R: Esperar al re-publish de CAMMESA, descargar el ZIP nuevo, regenerar el SQL local, ingresar y reprocesar. La tabla `ingest_runs` debe registrar el versionado del DTE.

**Q: ¿Por qué Recharts y no MUI/AntD?**
R: Stack ya elegido por el equipo. No cambiar. Todos los componentes UI base existen en `src/components/ui/`.

**Q: ¿Por qué Tailwind?**
R: Ídem.

---

## 14. Quién es quién en el negocio (glosario mínimo)

| Sigla | Significado |
|---|---|
| **CAMMESA** | Compañía Administradora del Mercado Mayorista Eléctrico SA. Operador del MEM argentino. |
| **MEM** | Mercado Eléctrico Mayorista. Donde se compran y venden energía y potencia. |
| **DTE** | Documento de Transacciones Económicas. Liquidación mensual del MEM. |
| **GUMA** | Gran Usuario Mayor (>= 1 MW). Compra directo en el MEM. |
| **GUME** | Gran Usuario Menor. |
| **GUDI** | Gran Usuario de Distribuidor. |
| **MATER** | Mercado A Término de Energías Renovables (pero también usado como "Mercado A Término" genérico). |
| **RENMER** | Generador renovable habilitado para vender en el MATER. |
| **RPB / RPE / BAS** | Tipos de contrato MAT (Renovable Plus Base / Renovable Plus Especial / Base). |
| **Spot** | Precio de la energía en el momento, fijado por CAMMESA según costo marginal. |
| **DEx** | Demanda Excedente. La que supera el contrato → se penaliza con el precio DEx. |
| **CUST** | Cargo por Uso del Sistema de Transporte. |
| **PAFTT** | Precio Adicional Función del Transporte. |
| **DIGO** | Disponibilidad Garantizada Operativa. |
| **PHMD** | Potencia para Habilitación del Mercado de Demanda. |
| **PPAD** | Compra de Potencia para Asegurar Demanda. |
| **Ley 27.191** | Establece que el MEM debe tener mínimo 20 % renovable. Cumplimiento por GUMA/GUDI. |
| **Resolución SE 1281/06** | Marco regulatorio para Demanda Excedente. |
| **Resolución SE 220** | Generación forzada. |
| **Resolución 976/2023** | Cargos a GUDI. |
| **Resolución MEyM 281-E/2017** | Cargos a Comercializadores. |

---

## 15. Contacto y handoff

- **Repo:** `E:\Proyectos\GitHub\EnergyOS`.
- **Rama de trabajo:** `codex/audit-calculation-engine`.
- **Supabase project:** ver `npx supabase projects list --linked`.
- **Briefs:** `docs/briefs/`.
- **Status docs:** `docs/cammesa_phase<N>_batch<M>_status.md`.
- **Diccionarios:** `docs/cammesa/`.

**Si algo no está documentado y crees que debería estarlo, agregalo al doc relevante y no asumas.** Todo el sistema descansa en que los layouts y reglas de parsing estén documentados — no en la memoria de quien los escribió.

---

**Última edición:** 2026-04-29.
**Próxima acción recomendada:** despachar T2.X (parametros) + T2.4 + T2.5 a 3 chats hijos en paralelo. Brief de cada uno listo en `docs/briefs/`.
