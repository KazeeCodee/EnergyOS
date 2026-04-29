# Brief T4.3 - AdminModule4 calidad auditable

## Depende de

- T3.0 `rebuild_datos_mensuales`
- Auditor global Fase 1
- Smoke tests L2/L3

## Objetivo

Reemplazar el indicador opaco `dato_sospechoso` por reglas auditables con causa y severidad.

## UX

- Lista de reglas con estado: ok, warning, fail.
- Drilldown por periodo/agente.
- Mostrar fuente: tabla, periodo, metrica esperada, metrica observada.

## Checks

- Cada warning tiene explicacion accionable.
- No bloquear todo el dashboard por warnings historicos ya reconciliados.
