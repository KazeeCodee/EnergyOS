# Brief T3.8 - `disponibilidad_generador_mensual`

## Objetivo

Crear mart de salud del generador contratado por cliente.

## Depende de

- T2.10 `generacion_maquina_mensual`
- T2.11 `disponibilidad_maquina_mensual`
- CRM `contratos`

## Campos

- `cliente_empresa_id`
- `generador_nemo`
- `unidad_comerc`
- `anio`, `mes`
- `factor_capacidad_pct`
- `disp_declarada_pct`
- `disp_realizada_pct`
- `desvio_disp_pp`
- `horas_forzadas`
- `score_salud`
- `flag_alerta`

## Checks

```sql
select * from public.refresh_disponibilidad_generador_mensual(2026, 2);

select count(*), avg(score_salud), sum(case when flag_alerta then 1 else 0 end)
from public.disponibilidad_generador_mensual
where anio = 2026 and mes = 2;
```
