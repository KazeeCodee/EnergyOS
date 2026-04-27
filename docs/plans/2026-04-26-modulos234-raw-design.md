# Diseno: Modulos 2, 3 y 4 desde raw CAMMESA historico

## Objetivo

Extender el enfoque ya aplicado al Modulo 1 para que los Modulos 2, 3 y 4 de EnergyOS dejen de depender operativamente del ZIP CAMMESA y usen `raw_*.sql` historicos consolidados en Supabase como fuente primaria o como verificacion estructural del periodo.

La salida canonica del sistema no cambia:

- `datos_mensuales` sigue siendo la tabla final de Modulos 1, 2 y 4
- `datos_mercado` sigue siendo la tabla final del Modulo 3

## Criterio general

- No inventar meses ni completar faltantes con `0`.
- No publicar filas parciales dudosas.
- Separar claramente:
  - fuente raw
  - calculo del modulo
  - persistencia final
- Usar fallback solo como transicion cuando el raw del periodo no alcanza.

## Modulo 2

### Que muestra

Costos mensuales por agente:

- `costo_total_estimado_usd`
- `costo_monomico_usd_mwh`
- `costo_spot_usd_mwh`
- `costo_renovable_usd_mwh`
- `cargo_transporte_pesos_mwh`
- `precio_spot_pesos_mwh`

### Tablas de salida

- `datos_mensuales`

### Fuentes raw minimas

- `raw_amat`
  - aporta `mater_mwh`
  - aporta `importe_mater_pesos`
- `raw_agum`
  - aporta `demanda_total_mwh`
  - aporta `spot_mwh`
  - aporta precios spot pico/valle/resto en pesos
- `raw_atra`
  - aporta `cargo_transporte_pesos_mwh`

### Mapeo de metricas

- `costo_total_estimado_usd`
  - formula actual del pipeline:
  - `importe_mater_pesos + spot_mwh * precio_spot_promedio_pesos_mwh + demanda_total_mwh * cargo_transporte_pesos_mwh`
- `costo_monomico_usd_mwh`
  - `costo_total_estimado_usd / demanda_total_mwh`
- `costo_spot_usd_mwh`
  - promedio de spot pico/valle/resto construido desde `raw_agum`
- `costo_renovable_usd_mwh`
  - `importe_mater_pesos / mater_mwh`
- `cargo_transporte_pesos_mwh`
  - valor mensual reconstruido desde `raw_atra`

### Reemplazo de flujo

- antes:
  - `ZIP -> parse_cammesa_zip -> process_empresa_from_cammesa_zip -> datos_mensuales`
- ahora:
  - `raw_amat/raw_agum/raw_atra en Supabase -> parse_cammesa_raw_period -> process_empresa_from_cammesa_zip -> datos_mensuales`

### Regla de publicacion

- El raw es suficiente para publicar Modulo 2 cuando existen `raw_amat` y `raw_agum`.
- `raw_atra` no bloquea la reconstruccion de Modulo 2, pero su ausencia marca el mes como `dato_sospechoso`.
- Si faltan `raw_amat` o `raw_agum`, el sistema puede usar un archivo fallback solo como transicion.

## Modulo 3

### Que muestra

Contexto mensual de mercado:

- mix termico, hidraulico, nuclear y renovable
- `precio_spot_usd_mwh`
- `costo_renovable_usd_mwh`
- `costo_cammesa_usd_mwh`

### Tabla de salida

- `datos_mercado`

### Fuentes raw minimas elegidas

- `raw_agum`
  - aporta precios spot del periodo en pesos
- `raw_amat`
  - aporta costo renovable observado del agente MATER
- `raw_atra`
  - aporta cargo de transporte del periodo

### Fuentes no reemplazadas en esta etapa

El mix de generacion del MEM no se reconstruye aun desde los `raw_anexo_gen*` porque esa derivacion hoy no existe con la robustez suficiente en el pipeline.

Por eso el Modulo 3 queda con un esquema hibrido controlado:

- `datos_mercado` existente sigue siendo la base canonica del mix y del mercado agregado
- si hay `Variables Relevantes.xlsx`, se usa como override explicito
- si hay ZIP CAMMESA, se puede usar como fallback
- si hay raw del periodo, `raw_amat/raw_agum/raw_atra` enriquecen o completan las referencias economicas con `build_mercado_from_parsed`

### Reemplazo de flujo

- antes:
  - `Variables Relevantes o ZIP -> extract_mercado -> datos_mercado`
- ahora:
  - `datos_mercado existente + raw_amat/raw_agum/raw_atra del periodo -> resolve_mercado -> datos_mercado`

### Alcance del reemplazo

- Reemplazo fuerte:
  - precios spot
  - costo renovable observado
  - transporte
- Reemplazo parcial:
  - `costo_cammesa_usd_mwh` cuando se deduce desde raw spot
- Se conserva la capa agregada existente para:
  - `mix_termica_pct`
  - `mix_hidraulica_pct`
  - `mix_nuclear_pct`
  - `mix_renovable_pct`
  - cualquier campo de mercado que no pueda derivarse con exactitud desde raw minimo

## Modulo 4

### Que muestra

Calidad del dato y cobertura por agente:

- meses visibles del agente
- meses con raw minimo completo
- meses con mercado publicado
- meses sospechosos
- ultimo procesamiento

### Tablas de salida

- `datos_mensuales`
- `datos_mercado`

### Fuentes raw minimas

- `raw_amat`
- `raw_agum`
- `raw_atra`

No participan para calcular una metrica economica nueva, sino para determinar completitud operativa real del periodo.

### Reemplazo de flujo

- antes:
  - la existencia del ZIP y de los derivados definia implicitamente si el mes estaba sano
- ahora:
  - la calidad del dato se apoya en:
    - fila real del agente en `datos_mensuales`
    - publicacion del mercado en `datos_mercado`
    - cobertura raw minima del periodo
    - reglas de sospecha persistidas en `datos_mensuales`

### Reglas de sospecha agregadas

El pipeline ahora persiste:

- `dato_sospechoso`
- `sospechoso_motivo`

Motivos actuales:

- demanda total no positiva
- energia negativa
- `mater_mwh > demanda_total_mwh`
- `spot_mwh > demanda_total_mwh`
- `mater_mwh + spot_mwh > demanda_total_mwh`
- falta `raw_atra` en un periodo resuelto desde raw
- faltan precios spot en pesos
- falta cargo de transporte en pesos

## Cambios de schema

### Tablas nuevas

- `public.raw_atra`

### Columnas nuevas

En `public.datos_mensuales`:

- `dato_sospechoso boolean not null default false`
- `sospechoso_motivo text`

## Importacion historica

La migracion de schema es liviana. Los historicos consolidados no se insertan dentro de migraciones.

La carga se hace con un importador separado:

- `pipeline/import_raw_sql_to_supabase.py`

Tablas habilitadas ahora:

- `raw_amat`
- `raw_agum`
- `raw_atra`

## Robustez

- El raw incompleto no se transforma en valores sinteticos.
- La cobertura global del sistema se calcula con todos los meses presentes en `datos_mensuales`.
- La cobertura real del agente se calcula solo con los meses efectivamente publicados para ese agente.
- Si un agente entra tarde al rango, la vista y los agregados usan solo sus meses reales.
- Las divisiones por cero quedan blindadas.
- Los promedios se calculan solo con filas reales visibles del rango.

## Validacion esperada

- verificar rangos cargados en `raw_amat/raw_agum/raw_atra`
- verificar que `procesar_mes.py` resuelva Modulo 2 desde raw cuando existe cobertura minima
- verificar que `procesar_pendientes.py` ya no exija ZIP de forma obligatoria si el raw del periodo existe
- verificar que `datos_mensuales` persista flags de calidad
- verificar que las pantallas admin de Modulos 2, 3 y 4 muestren datos reales sin romperse en rangos parciales
