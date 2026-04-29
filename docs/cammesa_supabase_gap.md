# T0.2 — Auditoría: estado de Supabase vs. SQL locales

> **Propósito.** Comparar las 42 tablas `raw_*` del banco local de SQL contra el estado real de Supabase, identificar qué existe, qué está cargado, qué falta crear y qué períodos cubre cada fuente.
>
> **Insumo local.** `C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03`
>
> **Auditoría remota.** Consulta REST de Supabase con `SUPABASE_SERVICE_ROLE_KEY` local, sólo lectura, el 2026-04-28.

---

## 1. Resumen ejecutivo

- **Local:** 42 archivos `raw_*.sql`, **6.123.113 filas**, **4.022.824.233 bytes** (~4,02 GB decimal / 3,75 GiB).
- **Período local general:** 2021-01 → 2026-03. La mayoría de tablas cubre 63/63 meses; algunas son naturalmente parciales por cambios regulatorios o porque el archivo CAMMESA no publica filas todos los meses.
- **Supabase remoto:** sólo **2 tablas `raw_*` existen y están cargadas**:
  - `raw_amat`: 417.814 filas, 2021-01 → 2026-03, **62/63 meses**; falta 2023-01 también en local.
  - `raw_agum`: 820.036 filas, 2021-01 → 2026-03, **63/63 meses**.
- **Gap real:** faltan **40 tablas en remoto**.
  - `raw_atra` tiene migration local (`20260426123000_cammesa_raw_m234_tables.sql`) pero **no existe en el schema remoto** consultado por REST. Tratarla como `migration_local_pendiente`.
  - Las otras 39 requieren migrations nuevas o incorporar su DDL en los grupos de T1.1.
- **Acción Fase 1:** aplicar/verificar `raw_atra`, crear 39 tablas restantes y cargar ~4,89 M filas faltantes. El pipeline debe ser idempotente para poder re-ejecutar `raw_amat`/`raw_agum` sin duplicar.

---

## 2. Estado remoto por tabla

Convenciones:

- `cargada`: existe en Supabase remoto y tiene filas.
- `no_existe`: Supabase REST devuelve `PGRST205` para `public.<tabla>`.
- `migration_local_pendiente`: hay migration en repo, pero la tabla no aparece en remoto.
- `Meses local`: cantidad de períodos con al menos una fila sobre la grilla 2021-01 → 2026-03.

| Tabla | Cols L1 | Filas local | Meses local | Cobertura local | Estado remoto | Filas remoto | Cobertura remoto | Nota |
|---|---:|---:|---:|---|---|---:|---|---|
| `raw_aama` | 16 | 4.193 | 16/63 | 2021-05 → 2025-11 | no_existe |  |  | Parcial esperado; sólo meses con créditos/débitos anteriores. |
| `raw_adco` | 8 | 143.683 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_adis` | 17 | 91.046 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_aexp` | 19 | 9.874 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_agen` | 25 | 420.197 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_agfq` | 12 | 6.670 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_agum` | 24 | 820.036 | 63/63 | 2021-01 → 2026-03 | cargada | 820.036 | 2021-01 → 2026-03 | Migration `20260426110000`. |
| `raw_amat` | 16 | 417.814 | 62/63 | 2021-01 → 2026-03 | cargada | 417.814 | 2021-01 → 2026-03 | Falta 2023-01 en local y remoto. Migration `20260426110000`. |
| `raw_anexo_gen111` | 18 | 25.173 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen112` | 14 | 25.173 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | DDL reserva 14 cols; layout activo usa 12. |
| `raw_anexo_gen113` | 11 | 6.250 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen114` | 11 | 6.250 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | DDL reserva 11 cols; layout activo usa 8. |
| `raw_anexo_gen115` | 19 | 305 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen116` | 6 | 14.163 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen117` | 12 | 3.565 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen118` | 10 | 1.364 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen119` | 8 | 315 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen12` | 18 | 22.387 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen13` | 16 | 73.503 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gen_294ene` | 11 | 1.017 | 16/63 | 2024-12 → 2026-03 | no_existe |  |  | Parcial esperado; Res. SE 294 aparece desde 2024-12. |
| `raw_anexo_gen_294pot` | 10 | 1.017 | 16/63 | 2024-12 → 2026-03 | no_existe |  |  | Parcial esperado; Res. SE 294 aparece desde 2024-12. |
| `raw_anexo_gen_disp_mejora` | 12 | 13.143 | 36/63 | 2023-04 → 2026-03 | no_existe |  |  | Parcial esperado por vigencia del anexo. |
| `raw_anexo_generacion_forzada` | 6 | 202 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_genmovil` | 15 | 189 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gennuc` | 6 | 190 | 38/63 | 2023-02 → 2026-03 | no_existe |  |  | Parcial esperado por vigencia del anexo. |
| `raw_anexo_guma` | 52 | 23.810 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_gume` | 34 | 299.082 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_mat` | 9 | 2.304 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_mat_cequip724` | 6 | 63 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | 1 fila/mes. |
| `raw_anexo_mat_compromiso` | 26 | 63 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | 1 fila/mes. |
| `raw_anexo_mat_cont_delivery` | 13 | 63 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | 1 fila/mes. |
| `raw_anexo_mat_cvt` | 8 | 80.379 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_mat_cvt_plus` | 12 | 63 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | 1 fila/mes. |
| `raw_anexo_mat_plus` | 8 | 37.454 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_anexo_mat_renovable` | 6 | 223.248 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_atra` | 10 | 59.619 | 63/63 | 2021-01 → 2026-03 | migration_local_pendiente |  |  | Migration `20260426123000` existe en repo, no en remoto. |
| `raw_auto` | 19 | 16.346 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_dexc` | 19 | 1.327.948 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | Candidata a partición por año. |
| `raw_dte` | 13 | 1.148.753 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  | Candidata a partición por año. |
| `raw_game` | 13 | 477.582 | 63/63 | 2021-01 → 2026-03 | no_existe |  |  |  |
| `raw_gudi` | 16 | 98.146 | 25/63 | 2024-03 → 2026-03 | no_existe |  |  | Parcial esperado; Res. 976/2023. |
| `raw_rscj` | 15 | 220.471 | 57/63 | 2021-01 → 2026-03 | no_existe |  |  | Faltan 2025-02 → 2025-07 en local. |

---

## 3. Migrations locales ya identificadas

| Migration | Tablas | Estado remoto |
|---|---|---|
| `20260426110000_cammesa_raw_m1_tables.sql` | `raw_amat`, `raw_agum` | Aplicada y cargada. |
| `20260426123000_cammesa_raw_m234_tables.sql` | `raw_atra` + columnas de calidad en `datos_mensuales` | Pendiente o no reflejada en schema remoto; `raw_atra` devuelve `PGRST205`. |

> Antes de crear nuevas migrations para `raw_atra`, verificar si el remoto simplemente no recibió `20260426123000`. Si se usa `supabase db push` desde este repo, debería aplicar esa migration; si se genera un set nuevo agrupado, evitar duplicar la creación de `raw_atra`.

---

## 4. Agrupación sugerida para T1.1

### T1.1.a — DTE-base TXT

Crear o verificar:

`raw_dte`, `raw_dexc`, `raw_aexp`, `raw_agen`, `raw_agfq`, `raw_aama`, `raw_rscj`, `raw_gudi`, `raw_adis`, `raw_adco`, `raw_auto`, `raw_game`, `raw_atra`.

Notas:

- `raw_dte` y `raw_dexc` superan 1 M de filas locales; decidir partición por `anio` antes de cargar.
- `raw_aama`, `raw_gudi` y `raw_rscj` tienen cobertura naturalmente parcial; no marcar esos huecos como fallo automático sin regla por tabla.

### T1.1.b — Anexos Generación HTML

Crear:

`raw_anexo_gen111`, `raw_anexo_gen112`, `raw_anexo_gen113`, `raw_anexo_gen114`, `raw_anexo_gen115`, `raw_anexo_gen116`, `raw_anexo_gen117`, `raw_anexo_gen118`, `raw_anexo_gen119`, `raw_anexo_gen12`, `raw_anexo_gen13`, `raw_anexo_gen_disp_mejora`, `raw_anexo_generacion_forzada`, `raw_anexo_gen_294pot`, `raw_anexo_gen_294ene`, `raw_anexo_genmovil`, `raw_anexo_gennuc`.

Notas:

- `raw_anexo_gen112`: crear 14 `col_NNN`, aunque el layout activo use 12.
- `raw_anexo_gen114`: crear 11 `col_NNN`, aunque el layout activo use 8.

### T1.1.c — Anexos MAT/MATER HTML

Crear:

`raw_anexo_mat`, `raw_anexo_mat_plus`, `raw_anexo_mat_renovable`, `raw_anexo_mat_cvt`, `raw_anexo_mat_cvt_plus`, `raw_anexo_mat_compromiso`, `raw_anexo_mat_cont_delivery`, `raw_anexo_mat_cequip724`.

### T1.1.d — Anexos GUMA/GUME HTML

Crear:

`raw_anexo_guma`, `raw_anexo_gume`.

---

## 5. Convenciones obligatorias para todas las tablas faltantes

Mismo envelope que `raw_amat`/`raw_agum`:

```sql
id bigint primary key,
anio integer not null,
mes integer not null check (mes between 1 and 12),
source_zip text not null,
source_file text not null,
source_row integer not null,
section_index integer null,
col_count integer not null,
raw_text text null,
col_001 text null,
...
```

Índices:

```sql
create index if not exists <tabla>_periodo_idx
  on public.<tabla>(anio, mes);

create index if not exists <tabla>_periodo_agente_idx
  on public.<tabla>(anio, mes, left(col_001, 8));
```

RLS:

- `enable row level security`
- policy `select_authenticated` para `authenticated using (true)`
- policy `admin_all` para `authenticated using (public.is_admin()) with check (public.is_admin())`

Para la ingesta histórica, agregar una restricción única idempotente:

```sql
create unique index if not exists <tabla>_source_unique_idx
  on public.<tabla>(source_zip, source_file, source_row);
```

---

## 6. Control de cobertura para T1.3

Grilla base: 2021-01 → 2026-03 (63 meses).

Tablas que deben tener 63/63 meses locales y, luego de ingesta, remotos:

`raw_adco`, `raw_adis`, `raw_aexp`, `raw_agen`, `raw_agfq`, `raw_agum`, `raw_anexo_gen111`, `raw_anexo_gen112`, `raw_anexo_gen113`, `raw_anexo_gen114`, `raw_anexo_gen115`, `raw_anexo_gen116`, `raw_anexo_gen117`, `raw_anexo_gen118`, `raw_anexo_gen119`, `raw_anexo_gen12`, `raw_anexo_gen13`, `raw_anexo_generacion_forzada`, `raw_anexo_genmovil`, `raw_anexo_guma`, `raw_anexo_gume`, `raw_anexo_mat`, `raw_anexo_mat_cequip724`, `raw_anexo_mat_compromiso`, `raw_anexo_mat_cont_delivery`, `raw_anexo_mat_cvt`, `raw_anexo_mat_cvt_plus`, `raw_anexo_mat_plus`, `raw_anexo_mat_renovable`, `raw_atra`, `raw_auto`, `raw_dexc`, `raw_dte`, `raw_game`.

Tablas con cobertura parcial esperada:

| Tabla | Regla de cobertura |
|---|---|
| `raw_amat` | 62/63; falta 2023-01 también en local. |
| `raw_aama` | Sólo meses con créditos/débitos anteriores; no exigir 63/63. |
| `raw_anexo_gen_294ene`, `raw_anexo_gen_294pot` | Desde 2024-12. |
| `raw_anexo_gen_disp_mejora` | Desde 2023-04. |
| `raw_anexo_gennuc` | Desde 2023-02. |
| `raw_gudi` | Desde 2024-03. |
| `raw_rscj` | 57/63; faltan 2025-02 → 2025-07 en local. |

---

## 7. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `raw_atra` existe como migration local pero no en remoto | T1.2 fallaría al cargar transporte | Verificar/applicar `20260426123000` antes de cargar; no asumir que existe. |
| Re-ingesta duplica `raw_amat`/`raw_agum` ya cargadas | Alto | Unique `(source_zip, source_file, source_row)` + `ON CONFLICT DO NOTHING`; ignorar `id` local. |
| `id` local se reinicia por archivo/mes | Alto | Usar `bigserial` remoto o re-clave; no confiar en `id` local para dedupe. |
| Tablas >1 M filas (`raw_dte`, `raw_dexc`) degradan refresh L2 | Medio | Evaluar partición por `anio` o índices parciales antes de ingesta masiva. |
| Huecos esperados se confunden con errores | Medio | `ingest_health` debe tener reglas por tabla, no una regla universal 63/63. |
| DDL con columnas reservadas en HTML (`gen112`, `gen114`) | Medio | Crear el máximo `col_NNN` del SQL local, aunque `col_count` activo sea menor. |

---

## 8. Checklist de cierre de T0.2

- [x] Inventario local completo de 42 tablas.
- [x] Conteo local exacto: 6.123.113 filas.
- [x] Estado remoto verificado por Supabase REST.
- [x] 2 tablas cargadas (`raw_amat`, `raw_agum`) con filas y cobertura.
- [x] 40 tablas faltantes en remoto identificadas.
- [x] `raw_atra` marcado como migration local pendiente, no como tabla existente.
- [x] Cobertura esperada por tabla documentada para T1.3.
- [x] Agrupación de migrations T1.1 actualizada.
