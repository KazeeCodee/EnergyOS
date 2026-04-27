# Diseno: Modulo 1 desde raw_amat/raw_agum

## Objetivo

Reemplazar la dependencia operativa del ZIP CAMMESA para el Modulo 1 y usar `raw_amat` + `raw_agum` en Supabase como fuente primaria del pipeline mensual.

## Decisiones

- El pipeline resuelve Modulo 1 desde `raw_amat/raw_agum` por `anio/mes` cuando ambas fuentes existen.
- El ZIP queda solo como fallback transitorio cuando el raw del periodo esta incompleto.
- `datos_mensuales` sigue siendo la salida canonica que consume el sistema.
- No se publican meses inventados con `0` cuando faltan fuentes.
- Para agentes fuera de cobertura del periodo, el pipeline no publica fila y tampoco los considera faltantes en la verificacion.

## Regla de exactitud

- Un dato faltante no se transforma en `0`.
- Si una empresa no tiene filas validas en el periodo, no se publica `datos_mensuales` para esa combinacion `empresa_id/anio/mes`.
- Las vistas de rango deben completar la grilla temporal en frontend o API con `null` para meses ausentes, no con `0`.

## Mercado

- Los precios spot del mes se pueden derivar desde `raw_agum`.
- Si existe una fuente mas completa de mercado para el mismo periodo, se fusiona.
- Si no existe informacion suficiente para un `datos_mercado` nuevo, no se publica una fila parcial.

## Robustez

- La serie mensual publicada queda lista para consultas por mes, anio o rangos.
- Los agregados de rango deben calcularse solo sobre meses publicados y validados.
- El pipeline usa `seguimiento_desde`, `cobertura_desde` y `cobertura_hasta` para decidir si un agente corresponde al periodo solicitado.
