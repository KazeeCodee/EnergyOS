# Brief T4.4 - Pantalla Factura Sombra

## Depende de

- T3.1 `factura_sombra_mensual`

## Objetivo

Pantalla mes a mes que compara factura sombra vs factura real CAMMESA, con drilldown por concepto y export PDF.

## UX

- Header con agente, periodo, desvio pesos y desvio pct.
- Tabla de conceptos: sombra, real, diferencia, evidencia.
- Drilldown por concepto a L2: DTE, transporte, excedente, reliquidaciones.
- Export PDF con resumen ejecutivo y anexos.

## Checks

- `factura_sombra_total_pesos - factura_real_total_pesos = desvio_pesos`.
- Conceptos con `flag_revisar` resaltados.
