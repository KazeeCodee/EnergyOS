# Brief T4.2 - AdminModule2 costos con transporte por concepto

## Depende de

- T3.0 `rebuild_datos_mensuales`
- T2.3 `transporte_concepto_mensual`
- T3.7 `transporte_forensics_mensual` opcional

## Objetivo

Actualizar AdminModule2 para desglosar costos de transporte por concepto y mostrar outliers frente a pares/zona.

## UX

- Tabla por agente/mes con columnas: total transporte, AT, DT, ampliaciones, peajes, otros.
- Panel de comparacion contra mediana zona.
- Drilldown por concepto con pesos y pesos/MWh.

## Checks

- Total transporte = suma de conceptos.
- Outlier flag visible solo cuando hay mediana suficiente.
- Sin dependencia directa de `raw_atra`.
