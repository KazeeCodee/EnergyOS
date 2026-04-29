# EnergyOS KPI Catalog

## Planes

| Plan | Uso |
|---|---|
| compliance | cumplimiento y alertas basicas |
| gestion | gestion mensual y costos |
| full | optimizacion, benchmarks y generadores |
| white-label | todo + branding/export avanzado |

## KPIs

| KPI | Origen | Plan minimo | Pantalla |
|---|---|---|---|
| Cumplimiento Ley 27.191 | `compliance_renovable_mensual` | compliance | T4.14 |
| Demanda total mensual | `datos_mensuales` / `guma_detalle_mensual` | compliance | T4.1 |
| MATER MWh | `mater_contrato_mensual` | compliance | T4.1 |
| Factura sombra total | `factura_sombra_mensual` | gestion | T4.4 |
| Desvio factura vs DTE | `factura_sombra_mensual` | gestion | T4.4 |
| Exposicion spot | `exposicion_spot_mensual` | gestion | T4.7 |
| Cargo DEXC | `exposicion_spot_mensual` | gestion | T4.7 |
| Transporte pesos/MWh | `transporte_forensics_mensual` | gestion | T4.10 |
| Ahorro MATER vs spot | `mater_pnl_contrato_mensual` | full | T4.5 |
| Under-delivery contrato | `mater_pnl_contrato_mensual` | full | T4.5 |
| Peer benchmark percentil | `peer_benchmark_mensual` | full | T4.8 |
| MATER pricing index | `mater_pricing_index_mensual` | full | T4.9 |
| Salud generador contratado | `disponibilidad_generador_mensual` | full | T4.11 |
| Combustibles vs spot | `combustibles_vs_spot_mensual` | full | T4.12 |
| Imp/Exp impacto | `imp_exp_impacto_mensual` | full | T4.13 |

## Regla

La UI debe consultar esta matriz antes de mostrar navegacion premium. La base debe aplicar RLS/feature flags para datos L3 sensibles.
