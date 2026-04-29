# Brief T4.1 - AdminModule1 trazabilidad Demanda/MATER/Spot

## Depende de

- T3.0 `rebuild_datos_mensuales`
- T2.1 `mater_contrato_mensual`
- T2.2/T2.8 demanda GUMA/GUME
- T3.4 `exposicion_spot_mensual` opcional

## Objetivo

Migrar AdminModule1 para mostrar demanda, MATER y spot con drilldown auditable por contrato y periodo.

## UX

- Vista mensual compacta.
- Tabla principal por empresa/agente.
- Drilldown lateral: contratos MATER, energia spot legitima, excedente.
- Badges de estado: completo, parcial, inconsistente.

## Checks

- No consultar `raw_*`.
- Los totales de la pantalla cuadran con `datos_mensuales`.
- Drilldown MATER suma igual al total MATER mostrado.
