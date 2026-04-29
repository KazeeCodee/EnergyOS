# CAMMESA Execution Handoff

## Estado actual

| Fase | Estado |
|---|---|
| Fase 0 | completa |
| Fase 1 | grupos A-F completos; Grupo G en curso por implementador |
| T2.0 helpers | aplicado y smoke testeado |
| Auditor Fase 1 | listo en `pipeline/audit_fase1_raw.py` |
| Briefs T2 | listos en `docs/briefs/cammesa_t2_*` |
| Briefs T3 | listos en `docs/briefs/cammesa_t3_*` |
| Briefs T4 | listos en `docs/briefs/cammesa_t4_*` |
| Briefs T5 | listos en `docs/briefs/cammesa_t5_*` |

## Cuando termine Grupo G

1. Verificar `raw_dexc` y `raw_dte` con el reporte del implementador.
2. Correr auditor global:

```powershell
$env:PYTHONIOENCODING='utf-8'
python pipeline\audit_fase1_raw.py --fail-on-mismatch --output docs\cammesa_phase1_audit.md
```

3. Si falla, no arrancar Fase 2.
4. Si pasa con `ok` o `warn_prior_errors`, congelar Fase 1 y despachar T2.

## Despacho T2

Primera ola:

- `docs/briefs/cammesa_t2_1_mater_contrato_mensual.md`
- `docs/briefs/cammesa_t2_2_guma_detalle_mensual.md`
- `docs/briefs/cammesa_t2_3_transporte_concepto_mensual.md`
- `docs/briefs/cammesa_t2_6_cuenta_corriente_agente.md`
- `docs/briefs/cammesa_t2_4_excedente_mensual.md`
- `docs/briefs/cammesa_t2_5_dte_resumen_agente.md`

Segunda ola:

- T2.7-T2.15 segun `docs/briefs/cammesa_t2_readme.md`

## No hacer

- No borrar tablas raw.
- No ejecutar refresh historico L2 antes de cerrar Fase 1.
- No permitir que UI lea `raw_*`.
- No renombrar migrations ya aplicadas remotamente.
