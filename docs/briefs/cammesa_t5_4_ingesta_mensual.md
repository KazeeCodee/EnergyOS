# Brief T5.4 - Ingesta Mensual Automatizada

## Objetivo

Automatizar descarga CAMMESA mensual e ingesta incremental.

## Depende de

- Fase 1 cerrada.
- Pipeline historico validado.
- Decision de fuente oficial mensual.

## Entregables

- Job mensual.
- Modo dry-run.
- Registro en `ingest_runs`.
- Al finalizar L1, disparar refresh L2/L3 del periodo.

## Reglas

- Idempotencia por `(source_zip, source_file, source_row)`.
- Nunca borrar un mes historico sin flag explicito.
- Alertar si conteo local/parser/remoto no cuadra.
