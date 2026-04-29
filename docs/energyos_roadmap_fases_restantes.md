# EnergyOS CAMMESA - Roadmap posterior a Fase 2

Fecha de corte: 2026-04-29

Este documento explica las fases posteriores para contexto estrategico. No es el handoff operativo inmediato.

## 1. Estado actual resumido

- Fase 1: terminada.
- Fase 2: en curso.
- Las fases posteriores dependen de cerrar L2.

No avanzar con estas fases hasta que Fase 2 tenga los parsers requeridos por cada mart.

## 2. Fase 3 - Marts y agregados L3

Objetivo:

Crear tablas agregadas listas para consumo por producto/UI. Estas tablas no deben leer `raw_*` directamente; deben apoyarse en L2.

Tarea bloqueante:

### T3.0 - Refactor de `datos_mensuales`

Objetivo:

- Repoblar `datos_mensuales` desde L2.
- Mantener compatibilidad de schema con los modulos actuales.
- Crear `public.rebuild_datos_mensuales(_anio int, _mes int)`.

Depende de:

- `mater_contrato_mensual`
- `guma_detalle_mensual` / `gume_detalle_mensual`
- `transporte_concepto_mensual`
- `excedente_mensual`
- posiblemente `cargos_comerc_mensual`

No comenzar T3.0 hasta cerrar al menos los parsers L2 de Nivel 1.

## 3. Marts L3 previstos

### T3.1 - `factura_sombra_mensual`

Objetivo:

- Comparar factura real DTE contra factura reconstruida por EnergyOS.

Depende de:

- `dte_resumen_agente`
- `cuenta_corriente_agente`
- `transporte_concepto_mensual`
- `excedente_mensual`
- `reliquidacion_mensual`

Habilita:

- Pantalla Factura-sombra.

### T3.2 - `mater_pnl_contrato_mensual`

Objetivo:

- Ranking y P&L de contratos MATER.
- Alertas de under-delivery.

Depende de:

- `mater_contrato_mensual`
- `mater_cvt_mensual`
- `mater_renovable_mensual`
- tabla CRM `contratos`
- `datos_mercado`

Pendiente importante:

- Confirmar si existe la tabla CRM `contratos` en Supabase y su schema real.

### T3.3 - `curva_costo_marginal_horaria`

Objetivo:

- Heatmap horario de costo marginal.
- Recomendador de desplazamiento de carga.

Depende de:

- `cammesa_generacion`
- `cammesa_combustibles`

No depende directamente de los `raw_*`.

### T3.4 - `exposicion_spot_mensual`

Objetivo:

- Medir exposicion spot y DEXC.
- Simular derating.

Depende de:

- `excedente_mensual`
- `guma_detalle_mensual`
- `mater_contrato_mensual`

### T3.5 - `peer_benchmark_mensual`

Objetivo:

- Benchmark anonimo por pares.

Depende de:

- `cammesa_demanda_historica`
- `dte_resumen_agente`
- opcionalmente GUMA/GUME/GUDI L2.

### T3.6 - `mater_pricing_index_mensual`

Objetivo:

- Indice de precios MATER.

Depende de:

- `mater_contrato_mensual`
- `mater_renovable_mensual`
- `cammesa_potencia_instalada`

### T3.7 - `transporte_forensics_mensual`

Objetivo:

- Ranking y explicacion de cargos de transporte.

Depende de:

- `transporte_concepto_mensual`

### T3.8 - `disponibilidad_generador_mensual`

Objetivo:

- Salud del generador contratado.

Depende de:

- `generacion_maquina_mensual`
- `disponibilidad_maquina_mensual`
- tabla CRM `contratos`

### T3.9 - `compliance_renovable_mensual`

Objetivo:

- Seguimiento Ley 27.191.

Depende de:

- `mater_contrato_mensual`
- `mater_renovable_mensual`
- `dte_resumen_agente`

### T3.10 - `combustibles_vs_spot_mensual`

Objetivo:

- Cruzar combustible y spot.

Depende de:

- `generacion_maquina_mensual`
- `cammesa_combustibles`

### T3.11 - `imp_exp_impacto_mensual`

Objetivo:

- Impacto importaciones/exportaciones.

Depende de:

- `imp_exp_mensual`
- `cammesa_generacion`

## 4. Fase 4 - UI y modulos de producto

Objetivo:

Exponer los marts L3 en pantallas usables.

No iniciar hasta que el mart correspondiente este cerrado y validado.

## 5. Bloque 4A - Actualizar modulos existentes

### T4.1 - AdminModule1

Objetivo:

- Migrar Demanda + MATER + Spot a trazabilidad nueva.
- Agregar drilldown a contrato.

Depende de:

- T3.0
- `mater_contrato_mensual`

### T4.2 - AdminModule2

Objetivo:

- Mostrar desglose de transporte por concepto.

Depende de:

- T3.0
- `transporte_concepto_mensual`

### T4.3 - AdminModule4

Objetivo:

- Usar reglas auditables, no `dato_sospechoso` binario.

Depende de:

- T3.0

## 6. Bloque 4B - Features Nivel 1

### T4.4 - Pantalla Factura-sombra

Depende de:

- `factura_sombra_mensual`

Debe incluir:

- vista mes a mes
- drill por concepto
- export PDF

### T4.5 - Pantalla MATER P&L

Depende de:

- `mater_pnl_contrato_mensual`

Debe incluir:

- ranking de contratos
- alertas under-delivery

### T4.6 - Heatmap costo marginal horario

Depende de:

- `curva_costo_marginal_horaria`

Debe incluir:

- heatmap horario
- recomendador de desplazamiento de carga

### T4.7 - Exposicion Spot/DEXC

Depende de:

- `exposicion_spot_mensual`

Debe incluir:

- simulador de derating

## 7. Bloque 4C - Features Nivel 2

### T4.8 - Peer Benchmark

Depende de:

- `peer_benchmark_mensual`

### T4.9 - MATER Pricing Index

Depende de:

- `mater_pricing_index_mensual`

Puede ser componente publico/marketing.

### T4.10 - Transporte Forensics

Depende de:

- `transporte_forensics_mensual`

### T4.11 - Salud del generador contratado

Depende de:

- `disponibilidad_generador_mensual`

## 8. Bloque 4D - Nivel 3

Tareas:

- T4.12 Combustibles vs Spot
- T4.13 Imp/Exp
- T4.14 Compliance Ley 27.191
- T4.15 Forecast demanda + clima

Nota:

- T4.15 requiere ingesta horaria del cliente y debe tratarse como proyecto aparte.

## 9. Fase 5 - Operacion y QA

Objetivo:

Hacer que el sistema sea mantenible, auditable y seguro en produccion.

Puede correr en paralelo cuando haya una base L2/L3 estable.

### T5.1 - Observabilidad

Extender:

- `ingest_runs`
- `audit_logs`

Registrar:

- refresh L2
- refresh L3
- latencia
- errores
- filas afectadas

### T5.2 - Tests de regresion

Crear snapshots por:

- 5 agentes representativos
- 6 meses representativos

Comparar en cada deploy.

### T5.3 - Documentacion dataflow

Mantener:

- `docs/dataflow.md`

Debe explicar:

```text
L1 raw -> L2 semantic -> L3 marts -> UI
```

### T5.4 - Job de ingesta mensual

Objetivo:

- Automatizar descarga/incremental mensual CAMMESA.
- Ejecutar carga raw.
- Ejecutar refresh L2/L3.
- Registrar salud.

### T5.5 - Catalogo de KPIs por plan

Objetivo:

Definir que ve cada plan:

- compliance
- gestion
- full
- white-label

Archivo relacionado:

- `docs/kpi_catalog.md`

### T5.6 - RLS / feature flags por plan

Objetivo:

- Esconder marts L3 segun `empresas.plan_activo`.
- Asegurar que clientes no vean datos ajenos.

## 10. Reglas para fases posteriores

- No consultar `raw_*` desde UI.
- UI debe consumir L3 o endpoints que lean L3.
- L3 debe leer L2, no L1.
- Cada mart debe tener funcion de refresh idempotente.
- Cada tabla debe tener `parser_version` o `mart_version`.
- No mezclar cambios de parsers masivos con UI.
- Validar con meses representativos antes de poblar historico completo.

## 11. Orden recomendado despues de cerrar Fase 2 batch 1

1. Cerrar `T2.4 excedente_mensual`.
2. Cerrar `T2.5 dte_resumen_agente`.
3. Cerrar `T2.7 reliquidacion_mensual`.
4. Cerrar `T2.15 cargos_comerc_mensual`.
5. Implementar `T3.0 rebuild_datos_mensuales`.
6. Implementar `T3.1 factura_sombra_mensual`.
7. Recién despues avanzar con UI T4.4.

Motivo:

Ese camino desbloquea la primera oportunidad fuerte de producto: factura-sombra auditada.

