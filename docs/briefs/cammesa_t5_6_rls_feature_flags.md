# Brief T5.6 - RLS Y Feature Flags Por Plan

## Objetivo

Controlar acceso a marts/pantallas segun `empresas.plan_activo`.

## Entregables

- Matriz plan -> feature.
- Helper SQL o vista para resolver plan activo.
- Policies L3 por agente y plan cuando aplique.
- Guards UI para ocultar navegacion no incluida.

## Reglas

- L1/L2 siguen `select_authenticated`.
- L3 por agente restringe por nemos asociados al usuario.
- L3 global puede ser visible si el plan lo permite.
- No confiar solo en UI para datos premium.

## Checks

Probar con usuarios de cada plan:

- compliance
- gestion
- full
- white-label
