# Brief T2.2 - `guma_detalle_mensual`

## Objetivo

Crear la tabla L2 `public.guma_detalle_mensual` y la funcion `public.refresh_guma_detalle_mensual(_anio int, _mes int)`.

## Estado

Listo para implementar cuando cierre Fase 1. Fuente principal cargada: `raw_anexo_guma`. Fallback: `raw_agum`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones `raw_anexo_guma` y `raw_agum`
- `docs/cammesa_target_model.md`: seccion `guma_detalle_mensual`

## Fuente principal

`raw_anexo_guma`:

- layout nuevo 2026+: 31 columnas de datos
- layout legacy 2021-2025: 51/52 columnas; v1 debe mapear al menos las primeras metricas equivalentes

## Mapping layout nuevo

- `col_001` -> `agente_nemo`
- `col_002` -> `distribuidor_nemo`
- `col_003` -> `demanda_real_total_mwh`
- `col_004` -> `demanda_real_pico_mwh`
- `col_005` -> `demanda_real_valle_mwh`
- `col_006` -> `demanda_real_resto_mwh`
- `col_007` -> `demanda_contratada_total_mwh`
- `col_008` -> `demanda_contratada_pico_mwh`
- `col_009` -> `demanda_contratada_valle_mwh`
- `col_010` -> `demanda_contratada_resto_mwh`
- `col_011..col_031` -> metricas spot, cargos, transporte y potencia segun diccionario

## Reglas

- No insertar headers/unidades.
- `agente_nemo` y `distribuidor_nemo` deben tener 8 caracteres.
- Usar `public.parse_es_number` para numericos.
- `parser_version = 'guma_detalle_mensual_v1'`.

## Checks

```sql
select * from public.refresh_guma_detalle_mensual(2026, 2);

select count(*), sum(demanda_real_total_mwh), sum(compra_spot_pesos)
from public.guma_detalle_mensual
where anio = 2026 and mes = 2;

select count(*)
from public.guma_detalle_mensual
where length(agente_nemo) <> 8 or length(distribuidor_nemo) <> 8;
```

Aceptacion: ultimo query debe devolver `0`.
