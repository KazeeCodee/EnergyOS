# Brief T3.9 - `compliance_renovable_mensual`

## Objetivo

Crear mart mensual/YTD de cumplimiento Ley 27.191.

## Depende de

- T2.1 `mater_contrato_mensual`
- T2.14 `mater_renovable_mensual`
- T2.5 `dte_resumen_agente`
- `cammesa_parametros_mensuales`

## Campos

- `agente_nemo`
- `anio`, `mes`
- `demanda_total_mwh`
- `mater_renovable_mwh`
- `pct_renovable_mes`
- `pct_renovable_ytd`
- `pct_objetivo_ley_27191`
- `cumple`
- `cargo_incumplimiento_estim_pesos`

## Checks

```sql
select * from public.refresh_compliance_renovable_mensual(2026, 2);

select count(*), avg(pct_renovable_ytd), sum(case when cumple then 1 else 0 end)
from public.compliance_renovable_mensual
where anio = 2026 and mes = 2;
```
