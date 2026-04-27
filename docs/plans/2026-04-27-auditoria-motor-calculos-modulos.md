# Auditoria Motor Calculos Modulos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auditar de forma reproducible el motor de calculos, los flujos de informacion y la data de los modulos 1, 2, 3 y 4 para el rango 2021-01 a 2026-03 inclusive.

**Architecture:** La auditoria separa el sistema en tres capas: fuentes raw CAMMESA, tablas procesadas en Supabase y vistas/servicios admin que consumen los resultados. La ejecucion crea pruebas unitarias locales para formulas/parsers y un script de auditoria de datos que consulta Supabase sin modificar datos.

**Tech Stack:** Python 3, unittest, pandas, supabase-py, React, TypeScript, Vite, Supabase Postgres.

---

### Task 1: Inventario del motor y contratos de datos

**Files:**
- Read: `pipeline/procesar_mes.py`
- Read: `pipeline/procesar_pendientes.py`
- Read: `pipeline/carga_historica.py`
- Read: `pipeline/import_raw_sql_to_supabase.py`
- Read: `supabase/migrations/*.sql`
- Read: `src/services/adminData.ts`
- Read: `src/pages/admin/AdminModule1.tsx`
- Read: `src/pages/admin/AdminModule2.tsx`
- Read: `src/pages/admin/AdminModule3.tsx`
- Read: `src/pages/admin/AdminModule4.tsx`

**Step 1: Mapear entradas**

Identificar para cada modulo si depende de `raw_amat`, `raw_agum`, `raw_atra`, `datos_mensuales`, `datos_mercado`, `agentes_monitoreados`, `procesamientos` o `procesamiento_empresas`.

**Step 2: Mapear salidas**

Registrar campos calculados, formulas y tablas destino: `demanda_total_mwh`, `mater_mwh`, `spot_mwh`, `porcentaje_renovable`, `importe_mater_pesos`, `precio_efectivo_pesos_mwh`, `costo_total_estimado_usd`, `dato_sospechoso`, `mix_*`, `mater_mom_pct` y `mater_yoy_pct`.

**Step 3: Verificar alineacion schema-codigo**

Contrastar que las tablas usadas por el pipeline existen en las migraciones actuales, especialmente luego del cambio desde `empresas/nemos/contratos` hacia `agentes_monitoreados`.

### Task 2: Pruebas unitarias del motor local

**Files:**
- Create: `tests/test_procesar_mes.py`

**Step 1: Escribir tests de parser numerico y periodo**

Cubrir `to_float`, `infer_period_from_filename`, `previous_period` y reglas de rango.

**Step 2: Escribir tests de parsers CAMMESA minimos**

Cubrir `parse_amat_text`, `parse_agum_text`, `parse_atra_text` y `build_parsed_cammesa_period` con ejemplos sinteticos.

**Step 3: Escribir tests de formulas**

Cubrir `calculate_compliance_context`, `calculate_module_2`, `build_quality_payload`, `weighted_contract_price` y `calculate_market_variations` con clientes Supabase fake.

**Step 4: Ejecutar**

Run: `python -m unittest discover -s tests -v`

Expected: la suite debe exponer si las formulas actuales pasan o si hay errores reales.

### Task 3: Auditoria de datos reales en Supabase

**Files:**
- Create: `scripts/audit_energyos_data.py`

**Step 1: Leer credenciales locales sin imprimir secretos**

El script debe cargar `.env.local` si existe y exigir `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_KEY`.

**Step 2: Consultar tablas clave**

Consultar `agentes_monitoreados`, `datos_mensuales`, `datos_mercado`, `raw_amat`, `raw_agum`, `raw_atra`, `procesamientos` y `procesamiento_empresas`.

**Step 3: Validar cobertura**

Para el rango 2021-01 a 2026-03 inclusive, validar:
- meses esperados: 63
- por agente activo: presencia de `datos_mensuales` cuando el agente esta dentro de su ventana de seguimiento/cobertura
- cobertura raw mensual en `raw_amat`, `raw_agum`, `raw_atra`
- existencia de `datos_mercado` por mes
- existencia de procesamiento completo por mes

**Step 4: Validar invariantes numericos**

Detectar:
- demanda negativa o cero cuando hay energia
- `mater_mwh > demanda_total_mwh`
- `spot_mwh > demanda_total_mwh`
- `mater_mwh + spot_mwh > demanda_total_mwh`
- `porcentaje_renovable` distinto de `mater_mwh / demanda_total_mwh * 100`
- `precio_efectivo_pesos_mwh` distinto de `importe_mater_pesos / mater_mwh`
- `costo_total_estimado_usd` distinto de `importe_mater_pesos + spot_mwh * precio_spot_pesos_mwh + demanda_total_mwh * cargo_transporte_pesos_mwh` cuando existen los tres componentes
- mix de mercado que no suma aproximadamente 100
- variaciones MoM/YoY inconsistentes cuando existe periodo comparativo

**Step 5: Emitir reporte JSON**

Guardar resumen y hallazgos en `tmp/audit-energyos-data.json`.

### Task 4: Verificacion de build y flujo frontend

**Files:**
- Read: `src/services/adminData.ts`
- Read: `src/pages/admin/AdminModule1.tsx`
- Read: `src/pages/admin/AdminModule2.tsx`
- Read: `src/pages/admin/AdminModule3.tsx`
- Read: `src/pages/admin/AdminModule4.tsx`

**Step 1: Ejecutar build**

Run: `npm run build`

Expected: TypeScript y Vite deben compilar sin errores.

**Step 2: Revisar defaults de filtros**

Verificar que los modulos permiten seleccionar todo el rango historico y que no arrancan siempre en el ultimo mes ocultando faltantes.

### Task 5: Reporte final de auditoria

**Files:**
- Create: `docs/audits/2026-04-27-auditoria-motor-calculos-modulos.md`

**Step 1: Documentar flujos**

Explicar como se consigue informacion para modulos 1, 2, 3 y 4, y como se agregan agentes actualmente.

**Step 2: Documentar evidencia**

Incluir comandos ejecutados, resultados, ejemplos calculados y resumen de hallazgos.

**Step 3: Clasificar riesgos**

Separar hallazgos criticos, altos, medios y bajos; distinguir errores de codigo, faltantes de data y deuda de proceso.
