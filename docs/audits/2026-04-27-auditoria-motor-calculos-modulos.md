# Auditoria del motor de calculos y datos de modulos 1-4

Fecha: 2026-04-27
Rango auditado: 2021-01 a 2026-03 inclusive, 63 meses.
Objetivo: validar si EnergyOS funciona como sistema de gestion de datos por agente y periodo.

## Resumen ejecutivo

El sistema cumple parcialmente.

Lo que si esta completo:

- `datos_mensuales` tiene cobertura completa para el rango auditado: 9 agentes activos x 63 meses = 567 filas esperadas y 567 filas presentes.
- `procesamientos` tiene una corrida `completo` para cada uno de los 63 meses.
- Las pruebas unitarias agregadas para parsers y formulas criticas pasan: 12/12.
- El build frontend compila correctamente.

Lo que impide afirmar que el sistema esta correcto de punta a punta:

- Falta `raw_amat` para 2023-01. Ese mes tiene datos procesados, pero no queda respaldo raw completo para reconstruir modulo 1 desde la fuente primaria.
- `raw_atra` no esta disponible o no esta aplicada en la base remota para ninguno de los 63 meses. El auditor recibio 404 al consultar la tabla para todo el rango.
- `datos_mercado` existe para 63/63 meses, pero las 63 filas violan invariantes: campos requeridos nulos y mix de mercado que suma 0%.
- Hay 327 filas donde campos nombrados como USD (`costo_renovable_usd_mwh`) contienen el mismo valor que campos en pesos (`precio_efectivo_pesos_mwh`). Ejemplo real: `costo_renovable_usd_mwh = 73360.03718466866` y `precio_efectivo_pesos_mwh = 73360.03718466866` para 2026-03. Eso compromete modulo 2 y cualquier lectura economica en USD.
- El alta operativa de agentes no esta implementada en la app: `createEmpresaCliente` lanza error y la Edge Function `admin-create-user` devuelve 410 antes de ejecutar el flujo viejo.

Conclusion: EnergyOS hoy sirve como visor historico mensual por agente para consumo/cobertura, pero no todavia como sistema plenamente confiable para costos, mercado y trazabilidad raw completa.

## Flujo de informacion

Modulo 1: consumo y cobertura

- Fuente primaria: `raw_amat` y `raw_agum`.
- Parser: `pipeline/procesar_mes.py`.
- Salida: `datos_mensuales`.
- Campos clave: `demanda_total_mwh`, `mater_mwh`, `spot_mwh`, `porcentaje_renovable`, `importe_mater_pesos`, `precio_efectivo_pesos_mwh`.
- Estado: cobertura procesada completa, pero respaldo raw incompleto por falta de `raw_amat` en 2023-01.

Modulo 2: costos

- Fuente: `datos_mensuales` y cobertura raw.
- Calculo actual raw: `importe_mater_pesos + spot_mwh * precio_spot_pesos_mwh + demanda_total_mwh * cargo_transporte_pesos_mwh`.
- Riesgo principal: el resultado se guarda en campos con sufijo `_usd`, aunque los componentes estan en pesos.
- Contratos: el modelo `contratos` fue eliminado por migracion y `fetch_contratos` hoy devuelve `[]`; por lo tanto no hay scoring contractual real.

Modulo 3: mercado

- Fuente: `datos_mercado`.
- Campos esperados: generacion total/MATER, mix termico/hidraulico/nuclear/renovable, spot, costo renovable y costo CAMMESA.
- Estado: hay fila para todos los meses, pero las 63 filas tienen campos requeridos nulos y mix 0%, asi que no son confiables.

Modulo 4: calidad y completitud

- Fuente: `datos_mensuales`, `datos_mercado`, `raw_amat`, `raw_agum`, `raw_atra`.
- Estado: detecta calidad de fila, pero la auditoria externa encontro brechas estructurales: `raw_atra` faltante completo y `raw_amat` faltante para 2023-01.

Alta de agentes

- Modelo actual: `agentes_monitoreados`, creado desde migracion y relacionado con `cammesa_agentes_mem`.
- Flujo app: deshabilitado. `src/services/adminData.ts` expone `createEmpresaCliente`, pero lanza error.
- Edge Function: `supabase/functions/admin-create-user/index.ts` devuelve 410 y no ejecuta el alta vieja.
- Implicacion: agregar agentes hoy depende de SQL/migraciones o scripts no expuestos como flujo admin completo.

## Ejemplos verificados

Cobertura procesada:

- Agentes activos: 9.
- Meses esperados por agente: 63.
- Filas esperadas: 567.
- Filas presentes: 567.
- Faltantes en `datos_mensuales`: 0.

Fuente raw:

- `raw_agum`: completo para 63/63 meses.
- `raw_amat`: 62/63 meses; falta 2023-01.
- `raw_atra`: 0/63 meses consultables en remoto; las consultas devolvieron 404.

Mercado:

- `datos_mercado`: 63/63 meses presentes.
- Invariantes fallidos: 63/63 meses.
- Ejemplo: 2021-01 tiene `precio_spot_usd_mwh` y `costo_cammesa_usd_mwh` nulos, y mix total 0%.

Unidades economicas:

- Hallazgos: 327 filas.
- Ejemplo: en 2026-03, una fila tiene `costo_renovable_usd_mwh` igual a `precio_efectivo_pesos_mwh`. Esto indica que el valor esta en pesos aunque el campo y la UI lo tratan como USD.

Bug corregido durante la auditoria:

- `infer_period_from_filename("variables_2024_07.xlsx")` devolvia `(2020, 24)` por una regex demasiado permisiva.
- Se corrigio para aceptar formatos `DTE2603`, `AMAT2101` y `YYYY_MM` sin inferir meses invalidos.

## Evidencia ejecutada

Comandos:

```powershell
npm run build
python -m unittest discover -s tests -v
python -m py_compile scripts\audit_energyos_data.py
python scripts\audit_energyos_data.py --desde 2021-01 --hasta 2026-03
```

Resultados:

- Build: OK.
- Unit tests: 12 tests, OK.
- Auditoria Supabase: finalizo OK y genero `tmp/audit-energyos-data.json`.
- Hallazgos auditoria: 1 critico, 3 altos.

## Archivos agregados

- `docs/plans/2026-04-27-auditoria-motor-calculos-modulos.md`
- `tests/test_procesar_mes.py`
- `scripts/audit_energyos_data.py`
- `docs/audits/2026-04-27-auditoria-motor-calculos-modulos.md`

## Recomendaciones

1. Aplicar/verificar la migracion de `raw_atra` en Supabase remoto y cargar ATRAs historicos.
2. Reimportar o reconstruir `raw_amat` para 2023-01.
3. Separar de forma explicita campos en pesos y USD, o agregar tipo de cambio y conversion auditada antes de poblar campos `_usd`.
4. Reconstruir `datos_mercado` para 2021-01 a 2026-03 con valores reales de mix, spot y costos.
5. Definir el nuevo flujo de alta de agentes sobre `agentes_monitoreados`, incluyendo UI/admin action, auditoria y validacion contra `cammesa_agentes_mem`.
6. Mantener `python -m unittest discover -s tests -v` y `python scripts\audit_energyos_data.py --desde 2021-01 --hasta 2026-03 --fail-on-findings` como gates de confianza antes de publicar nuevos datos.
