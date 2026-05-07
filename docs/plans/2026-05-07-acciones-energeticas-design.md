# Acciones Energeticas Design

## Objetivo

Convertir los indicadores de EnergyOS en una bandeja operativa donde el usuario vea problemas energeticos abiertos, los priorice y registre su resolucion.

## Alcance v1

- Generar acciones automaticas desde reglas confiables: DTE, spot, compliance 27.191 y consumo.
- Guardar acciones por NEMO y periodo, con severidad, impacto estimado, origen, estado y datos de soporte.
- Permitir cambiar estado y dejar comentario.
- Mostrar solo acciones de NEMOs autorizados mediante la misma validacion usada por los modulos `gu-*`.

## Arquitectura

- Railway Postgres conserva las tablas operativas y el motor de reglas porque las vistas analiticas viven alli.
- Supabase Edge Function valida JWT, obtiene `current_user_nemos` y consulta Railway con filtros por NEMO.
- React consume la Edge Function y presenta una vista densa de trabajo: resumen, filtros por estado y lista priorizada.

## Reglas iniciales

- `DTE_RECONCILIACION`: liquidacion DTE con desvio relevante.
- `DTE_VARIACION_ALTA`: costo DTE sube fuerte vs mes anterior.
- `SPOT_ALTA`: exposicion spot mensual alta.
- `COMPLIANCE_BRECHA`: brecha o multa estimada Ley 27.191.
- `CONSUMO_VARIACION`: consumo mensual cambia fuerte contra el mismo mes del anio anterior.

## Seguridad

La tabla no se expone directo al cliente. Toda lectura/escritura pasa por Edge Function autenticada y filtro por NEMOs autorizados.
