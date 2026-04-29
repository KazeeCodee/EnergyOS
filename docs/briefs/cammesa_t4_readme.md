# CAMMESA T4 UI Briefs

Briefs para pantallas/producto. No implementar UI hasta que el mart L3 correspondiente exista y tenga smoke tests.

## Principio de diseño

EnergyOS es una herramienta operativa para energia y finanzas: interfaz densa, sobria, auditable y orientada a drilldown. Evitar landing pages, heroes, cards decorativas y visualizaciones sin trazabilidad.

## Orden sugerido

1. T4.1-T4.3: migrar AdminModule1/2/4 despues de T3.0.
2. T4.4-T4.7: features Nivel 1.
3. T4.8-T4.11: features Nivel 2.
4. T4.12-T4.15: Nivel 3 / exploratorio.

## Check comun de UI

- La pantalla no consulta `raw_*`.
- Todo numero importante tiene source/drilldown a L2/L3.
- Loading, empty, error y restricted-plan states.
- Export CSV o PDF cuando aplique.
- Test visual desktop y mobile antes de cerrar.
