# Brief T3.7 - `transporte_forensics_mensual`

## Objetivo

Crear mart para detectar outliers de transporte por concepto y zona.

## Depende de

- T2.3 `transporte_concepto_mensual`
- dimension de zona/transporte por agente si existe

## Campos

- `agente_nemo`
- `zona_transporte`
- `anio`, `mes`
- `concepto_transporte`
- `pesos`
- `pesos_por_mwh`
- `pesos_por_mwh_mediana_zona`
- `desvio_vs_mediana_pct`
- `flag_outlier`

## Checks

```sql
select * from public.refresh_transporte_forensics_mensual(2026, 2);

select concepto_transporte, count(*), sum(case when flag_outlier then 1 else 0 end) as outliers
from public.transporte_forensics_mensual
where anio = 2026 and mes = 2
group by concepto_transporte;
```
