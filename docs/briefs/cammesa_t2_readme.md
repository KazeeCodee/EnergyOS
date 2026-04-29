# CAMMESA T2 Briefs

Briefs autocontenidos para despachar parsers L2 a chats separados.

## Regla de despacho

Antes de poblar cualquier L2, correr:

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --fail-on-mismatch --output docs\cammesa_phase1_audit.md
```

Se puede implementar la migration antes, pero no hacer refresh historico completo hasta que Fase 1 este cerrada.

## Orden sugerido

1. `cammesa_t2_1_mater_contrato_mensual.md`
2. `cammesa_t2_2_guma_detalle_mensual.md`
3. `cammesa_t2_3_transporte_concepto_mensual.md`
4. `cammesa_t2_6_cuenta_corriente_agente.md`
5. `cammesa_t2_4_excedente_mensual.md` cuando cierre `raw_dexc`
6. `cammesa_t2_5_dte_resumen_agente.md` cuando cierre `raw_dte`

Luego, despachar los parsers restantes:

7. `cammesa_t2_7_reliquidacion_mensual.md`
8. `cammesa_t2_8_gume_detalle_mensual.md`
9. `cammesa_t2_9_gudi_detalle_mensual.md`
10. `cammesa_t2_10_generacion_maquina_mensual.md`
11. `cammesa_t2_11_disponibilidad_maquina_mensual.md`
12. `cammesa_t2_12_imp_exp_mensual.md`
13. `cammesa_t2_13_auto_mensual.md`
14. `cammesa_t2_14_mater_tecnologia_cvt.md`
15. `cammesa_t2_15_cargos_comerc_mensual.md`

## Convenciones comunes

- Usar `npx supabase migration new l2_<tabla>`.
- Crear tabla en `public`, habilitar RLS y policies `select_authenticated` + `admin_all`.
- Crear funcion `public.refresh_<tabla>(_anio int, _mes int)`.
- Usar siempre `public.parse_es_number`, `public.parse_es_date`, `public.nemo_from`.
- Agregar `parser_version`, `procesado_en`, `source_table`, `source_id`.
- Probar 3 periodos: 2021, 2024, 2026.
