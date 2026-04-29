# Brief T5.2 - Tests De Regresion Snapshot

## Objetivo

Crear snapshots por agente/mes para detectar cambios no deseados en L2/L3.

## Dataset minimo

- 5 agentes representativos.
- 6 meses: 2021-01, 2022-06, 2023-12, 2024-09, 2025-11, 2026-02.

## Entregables

- `tests/cammesa_snapshots/`
- Script `pipeline/export_cammesa_snapshots.py`
- Test `tests/test_cammesa_snapshots.py`

## Reglas

- Snapshots de montos deben tolerar diferencias minimas por redondeo.
- Cambios de schema requieren actualizar snapshot con nota.

## Comando

```powershell
python -m unittest tests.test_cammesa_snapshots -v
```
