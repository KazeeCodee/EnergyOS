# Diseno: pantallas admin de Modulos 2, 3 y 4

## Objetivo

Agregar tres pantallas nuevas de validacion real:

- `/admin/modulo-2`
- `/admin/modulo-3`
- `/admin/modulo-4`

Cada pantalla debe permitir probar el flujo real del modulo con datos persistidos, sin mocks y sin depender de ZIPs cargados manualmente.

## Reglas comunes

- Un solo agente por vez.
- Filtros `Desde` y `Hasta` por mes/anio.
- Los selectores usan la cobertura global del sistema.
- La serie del agente muestra solo meses reales existentes dentro del rango.
- Si el agente no tenia datos al inicio del rango, no se inventan filas vacias.
- Los KPIs del rango se calculan solo sobre meses reales visibles.

## Modulo 2

### Fuente

- `agentes_monitoreados`
- `datos_mensuales`
- `raw_amat/raw_agum/raw_atra` solo para cobertura del mes

### Componentes

- cabecera con agente, rango y ultimo procesamiento
- KPIs de costo total, monomico, spot, renovable y transporte
- grafico de costo total por mes
- grafico de monomico y referencias
- grafico de transporte y spot en pesos
- tabla mensual con flag raw completo y flag sospechoso

### Regla de lectura

- la fila del agente sigue siendo la canonica
- la cobertura raw solo califica si el mes tenia fuente minima completa

## Modulo 3

### Fuente

- `agentes_monitoreados`
- `datos_mensuales` para saber en que meses el agente existe
- `datos_mercado` para mercado agregado
- `raw_amat/raw_agum/raw_atra` para cobertura economica del periodo

### Componentes

- cabecera con agente y rango
- KPIs de mix renovable, spot, renovable y CAMMESA
- donut de mix promedio
- lineas de precios de mercado
- area de evolucion del mix
- tabla mensual con flag de raw economico completo

### Regla de lectura

- la serie de mercado se recorta a los meses donde el agente tenia datos reales
- si el agente no existia al inicio del rango, no se fuerzan meses vacios

## Modulo 4

### Fuente

- `agentes_monitoreados`
- `datos_mensuales`
- `datos_mercado`
- `raw_amat/raw_agum/raw_atra`

### Componentes

- cabecera con agente, rango y ultimo procesamiento
- KPIs de meses del rango, meses del agente, raw completos, mercado publicado y sospechosos
- grafico de barras con estado operativo por mes
- panel de cobertura del agente
- tabla mensual con motivo sospechoso

### Regla de lectura

- la cobertura del rango es distinta de la cobertura real del agente
- un agente nuevo puede tener menos del 100 por ciento de cobertura sin que eso signifique error
- la tabla sigue mostrando solo meses existentes

## Resultado esperado

Las tres pantallas permiten validar visualmente:

- que el pipeline publica salidas consistentes
- que los filtros temporales no rompen los graficos
- que la cobertura real del agente se interpreta bien
- que el sistema no disfraza faltantes como ceros
