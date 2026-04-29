# Brief T2.14 - MATER tecnologia, renovable y CVT

## Objetivo

Crear parsers L2 para:

- `public.mater_renovable_mensual`
- `public.mater_cvt_mensual`

Opcional v1.1:

- plus/cvt_plus/compromiso/cont_delivery/cequip724 como tablas auxiliares o columnas extendidas.

## Estado

Listo para implementar cuando cierre Fase 1. Fuentes cargadas: `raw_anexo_mat*`.

## Referencias

- `docs/cammesa_dictionary.md`: secciones `raw_anexo_mat_renovable`, `raw_anexo_mat_cvt`, `raw_anexo_mat_cvt_plus`, `raw_anexo_mat_compromiso`
- `docs/cammesa_target_model.md`: secciones `mater_renovable_mensual`, `mater_cvt_mensual`

## `mater_renovable_mensual`

Mapping:

- `col_001` -> `generador_nemo`
- `col_002` -> `conjunto_generador`
- `col_003` -> `demandante_nemo`
- `col_004` -> `comercializador`
- `col_005` -> `energia_contrato_mwh`
- `col_006` -> `importe_contrato_pesos`

## `mater_cvt_mensual`

Campos:

- `vendedor_agente`
- `conjunto_generador`
- `comprador_agente`
- `participante_vendedor`
- `participante_comprador`
- `comercializador`
- `pot_despachada_mwh`
- `cargo_pot_despachada_pesos`

## Reglas

- Usar `public.parse_es_number`.
- No insertar headers/unidades.
- `parser_version` separado por tabla: `mater_renovable_mensual_v1`, `mater_cvt_mensual_v1`.

## Checks

```sql
select * from public.refresh_mater_renovable_mensual(2026, 2);
select * from public.refresh_mater_cvt_mensual(2026, 2);

select count(*), sum(energia_contrato_mwh), sum(importe_contrato_pesos)
from public.mater_renovable_mensual
where anio = 2026 and mes = 2;
```
