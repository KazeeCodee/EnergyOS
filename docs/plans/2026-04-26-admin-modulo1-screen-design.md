# Diseno: pantalla admin del Modulo 1

## Objetivo

Agregar una pantalla nueva al admin para validar con datos reales el funcionamiento del Modulo 1: filtros por agente y rango mensual, calculos de demanda/MATER/SPOT y estabilidad visual de graficos y tabla.

## Alcance

- Ruta nueva: `/admin/modulo-1`
- Un solo agente por vez
- Filtros `Desde` y `Hasta` por mes/anio
- Fuente real: `agentes_monitoreados` + `datos_mensuales`
- Sin mocks, sin ZIP y sin simulaciones

## Reglas de datos

- Los selectores de periodo usan la cobertura global mensual del sistema.
- La serie del agente muestra solo los meses reales que existan dentro del rango pedido.
- Si el agente no tenia datos al inicio del rango, la vista no inventa `0`.
- Los calculos de rango se hacen solo sobre las filas mensuales reales devueltas.

## Componentes

- Cabecera con agente activo, rango y ultimo procesamiento
- Filtros de agente, desde y hasta
- KPIs del rango
- Grafico de demanda/MATER/SPOT
- Grafico de porcentaje renovable
- Tabla mensual detallada

## Resultado esperado

La pantalla permite probar con datos reales si el pipeline del Modulo 1 esta dejando `datos_mensuales` consistentes y si los filtros temporales responden bien sin romper graficos ni vistas administrativas.
