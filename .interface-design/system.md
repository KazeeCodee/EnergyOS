# EnergyOS Interface System

## Product direction
- Contexto: backoffice tecnico para monitoreo energetico, trazabilidad CAMMESA y lectura mensual de agentes monitoreados.
- Usuario principal: operador/admin interno que necesita entender rapido estructura, datos, cobertura historica y consistencia del sistema.
- Sensacion buscada: clara, tecnica, ordenada, tranquila y legible. No SaaS generico, no marketing, no panel recargado.

## Visual world
- Base cromatica: papel tecnico y superficies blancas sobre fondo `navy` muy claro.
- Acentos: `forest` para validacion/seguimiento, `alert` para riesgo o sospecha, `mist` para contexto y texto secundario.
- No usar gradientes decorativos ni colores sin funcion analitica.

## Depth strategy
- Estrategia unica: `borders + subtle shadows`.
- Paneles y tarjetas con borde suave `border-navy-border` y sombra `shadow-panel`.
- Sidebar y main comparten la misma familia de fondos; separar con borde, no con bloques de color agresivos.

## Typography
- Headings y labels fuertes: `Space Grotesk` via tokens `fraunces` / `syne`.
- Texto corrido: `Inter`.
- Datos y cantidades: `IBM Plex Mono` con alineacion tabular cuando corresponda.

## Spacing
- Base de espaciado: bloques de `4px` usando combinaciones `p-4`, `p-5`, `p-6`, `gap-4`, `gap-6`, `space-y-4`, `space-y-8`.
- Secciones principales con respiracion amplia y subcomponentes densos pero legibles.

## Navigation patterns
- Shell admin con sidebar izquierda fija en desktop.
- Navegacion vigente:
  - `Inicio`
  - `Analitica`
- Header superior con contexto de sesion, recarga y salida.

## Page patterns
- `Inicio (/admin)`:
  - portada de auditoria del sistema
  - resumen superior
  - inventario de tablas
  - mapa de calculos
  - lista de agentes monitoreados
- `Analitica (/admin/analitica)`:
  - filtros globales arriba
  - selector de agente monitoreado
  - rango mensual `desde / hasta`
  - cuatro modulos fijos:
    - `Consumo y cobertura`
    - `Costos`
    - `Mercado`
    - `Calidad del dato`

## Component patterns
- `Panel`: contenedor base para cualquier bloque analitico.
- `StatCard`: tarjeta numerica resumida con borde superior semantico.
- `Badge`: estados compactos y capsulares.
- `FilterPicker`: selector custom tipo dropdown, nunca usar `<select>` nativo para vistas principales.
- `SectionHeading`: cada modulo de pantalla debe arrancar con icono, numero y descripcion corta.
- `ChartPanel`: cada grafico vive dentro de panel con titulo y lectura funcional, no solo nombre tecnico.

## Data visualization rules
- Los graficos deben salir de datos reales del sistema, no mocks.
- Las series temporales deben trabajar por mes completo, nunca por dias sueltos.
- Mostrar referencias operativas cuando ayuden a leer el dato:
  - ejemplo: linea del `20%` renovable.
- Evitar charts decorativos. Cada grafico debe responder una pregunta concreta.

## Avoid
- Sidebars oscuras o pesadas.
- Cards de SaaS genericas con icono a la izquierda y numero sin contexto.
- Mezclar demasiados colores de acento.
- Bloques que no indiquen claramente para que sirven.
- Formularios o filtros nativos sin tratamiento visual.
