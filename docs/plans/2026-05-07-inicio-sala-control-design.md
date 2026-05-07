# Inicio Sala De Control Design

## Objetivo

Mejorar la pantalla `Inicio` para que funcione como sala de control ejecutiva:
mostrar mas valor de EnergyOS desde el primer vistazo, usando datos y modulos
ya existentes, sin cambiar permisos, roles ni logica de usuarios trial.

## Direccion

La home deja de ser solo un resumen basico y pasa a ordenar tres niveles:

1. Diagnostico inmediato: empresa, periodo, estado de riesgo, KPIs principales.
2. Lectura ejecutiva: insights automaticos sobre spot, renovables, perfil horario
   y auditoria economica cuando los datos esten disponibles.
3. Foco principal dinamico: uno de los modulos ocupa protagonismo segun la
   situacion del cliente. La prioridad es DTE revisable, spot alto, brecha
   renovable y carga concentrada en pico.
4. Radar de modulos: los demas previews se mantienen con sus graficos, metricas
   y accesos, pero con menor peso visual para que no compitan todos al mismo
   nivel.

## Alcance

- Modificar `src/pages/app/AppHome.tsx`.
- Reutilizar `StatCard`, `ChartCard`, `AlertaBanner`, `DataFooter` y `recharts`.
- Agregar helpers puros para construir insights ejecutivos y previews.
- Usar servicios existentes para enriquecer la home si hace falta.
- Mantener skeletons, empty state y footer actuales.

## Fuera De Alcance

- Crear usuario `prueba`.
- Bloquear rutas por plan.
- Cambiar login, onboarding, Supabase RLS o permisos.
- Crear nuevas edge functions.

## Criterios De Aceptacion

- La home muestra mas graficos y previews de modulos pagos, sin retirar ninguno.
- Hay un modulo protagonista que cambia segun el estado del cliente.
- Los previews usan datos reales ya disponibles.
- Si un dataset no existe, la pantalla degrada con estado vacio compacto.
- El build TypeScript pasa.
- La app corre localmente para prueba manual.
