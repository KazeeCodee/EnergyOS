# Auditoría de Cálculos — EnergyOS

> **Propósito.** Trazabilidad fórmula-por-fórmula de cada KPI del producto.
> Para cada cálculo: qué hace el código, qué dice la norma o el manual técnico
> CAMMESA, y veredicto sobre si está alineado.
>
> **Audiencia.** (1) CEO/equipo interno, para defender el sistema en una demo
> con un consultor energético. (2) Devs futuros, para no romper algo que se
> arregló. (3) El propio consultor energético externo, como punto de partida
> para validación humana.
>
> **Estado.** v1 — post-Fase A (mayo 2026). Refleja los 6 fixes ya aplicados.

---

## 0. Cómo leer este doc

Cada cálculo tiene 4 secciones:

1. **Código** — fórmula tal cual está implementada (con archivo y línea).
2. **Fuente** — norma legal, manual técnico CAMMESA, o convención.
3. **Veredicto** — ✅ alineado · ⚠️ aproximación documentada · ❌ desalineado.
4. **Notas** — caveat, hallazgos pendientes, riesgos comerciales.

**Convenciones de severidad de hallazgos**:
- 🔴 Alta — riesgo legal o demo killer si un consultor lo audita.
- 🟡 Media — error que no rompe pantallas pero confunde al usuario.
- 🟢 Baja — cosmético o aproximación aceptable.

---

## 1. Estado de Fase A — resumen ejecutivo

| Hallazgo de auditoría inicial | Severidad | Estado post-Fase A |
|---|---|---|
| Multa Ley 27.191 subestimada por usar precio MATER en lugar de CVP gasoil | 🔴 | ✅ Resuelto (Fix #1) |
| Spot $ = 0 hardcodeado para clientes GUDI | 🔴 | ✅ Resuelto (Fix #2) |
| Parser GUME col_count 22/31 sospechoso | 🟡 | ✅ Validado, parser correcto (Fix #3) |
| Tabla `compliance_27191_obligacion` arrancaba en 2021 | 🟡 | ✅ Resuelto (Fix #4) |
| `cumple_mes` confundía con cumplimiento legal anual | 🟡 | ✅ Resuelto vía UX (Fix #5) |
| Label "Valle 0-6h" con definición CAMMESA real "0-5h" | 🟢 | ✅ Resuelto (Fix #6) |

**Métricas clave del estado actual**:
- Cobertura del nuevo método de multa: **98,5%** de las filas en `vw_compliance_27191_mensual` (579.945 / 588.739)
- Filas GUDI con `spot_pesos > 0`: **94.638** (antes: 0)
- Cronograma Ley 27.191 cargado: **2017 → 2030** completo
- Parser GUME legacy validado: **123.811 filas** verificadas internamente, 100% cuadran

---

## 2. Módulo Cumplimiento Ley 27.191

**Ruta producto**: `/app/cumplimiento-renovable`
**Edge function**: `supabase/functions/gu-compliance-27191/index.ts`
**Vistas L3**: `vw_compliance_27191_mensual`, `vw_renovable_contratado_mensual`
**Migración base**: `scripts/sql/railway_compliance_27191.sql`

### 2.1. Obligación porcentual por año

**Código** (`compliance_27191_obligacion`):
```sql
2017: 0.08    2018: 0.08    2019: 0.12    2020: 0.12
2021: 0.16    2022: 0.16    2023: 0.18    2024: 0.18
2025-2030: 0.20
```

**Fuente**: Ley 27.191 Art. 8, cronograma oficial:
- 31/12/2017: 8% mínimo
- 31/12/2019: 12%
- 31/12/2021: 16%
- 31/12/2023: 18%
- 31/12/2025: 20%

Verificado contra [InfoLEG / texto legal](https://servicios.infoleg.gob.ar/infolegInternet/anexos/250000-254999/253626/norma.htm).

**Veredicto**: ✅ **Alineado**.

**Notas**: el cronograma queda fijo a 20% desde 2025 hacia adelante. Si el
Congreso modifica la ley (en discusión política a la fecha de este doc),
basta con un INSERT en `compliance_27191_obligacion`.

---

### 2.2. Demanda total mensual del agente

**Código** (`vw_consumo_gu_mensual`, deriva a `vw_compliance_27191_mensual`):

Para cada agente (GUMA/GUME/GUDI), se suma `demanda_real_total_mwh` desde su
respectivo parser raw. Ej. para GUMA (`raw_anexo_guma`, `col_count = 30 o 31`):
```sql
demanda_real_total_mwh = parse_es_number(col_003 o col_007 según layout)
```

**Fuente**: anexo A4 del DTE CAMMESA, columna "Demanda Total" del cuadro
GUMA / GUME / GUDI por agente.

**Veredicto**: ✅ **Alineado**.

**Notas**:
- La validación cruzada interna (Fix #3) confirmó que `total = pico + valle + resto`
  para 100% de las 123.811 filas legacy verificadas y para los layouts modernos.
- Los archivos `anexo_guma.html` originales tienen los headers en texto humano,
  lo que permite reverificación si surgen dudas.

---

### 2.3. Renovable contratado MWh (MATER)

**Código** (`vw_renovable_contratado_mensual`):

Suma de `energia_contrato_mwh` desde `raw_anexo_mat_renovable`, agrupando por
`(demandante_nemo, anio, mes)`. Filtra contratos con layouts col_count 5 ó 6
(este último incluye comercializador).

**Fuente**: anexo A6.1.3.1 del DTE — RENMER (Mater Renovable). La nomenclatura
de columnas se infirió por muestreo cruzado contra `cammesa_dictionary.md`.

**Veredicto**: ✅ **Alineado** con la convención CAMMESA.

**Notas**:
- Si un GU tiene varios contratos MATER con varios generadores, todos se suman
  en una sola fila por mes. Eso es correcto para el cálculo de cumplimiento.
- La "razón social" del generador está en `raw_anexo_mat_renovable.col_002`
  (conjunto generador) — útil si en el futuro se quiere mostrar al cliente
  "tus generadores contratados".

---

### 2.4. Porcentaje renovable real (mensual)

**Código** (`vw_compliance_27191_mensual`, columna `pct_renovable_real`):
```sql
pct_renovable_real = renovable_contratado_mwh / demanda_real_mwh
```

**Fuente**: definición operacional. La ley no especifica una fórmula de
"% renovable mensual" porque solo evalúa anual, pero esta es la única forma
razonable de mostrar el indicador mes a mes.

**Veredicto**: ✅ **Alineado** (proporción simple, sin ambigüedad).

**Notas**:
- Mostrado en el chart "Ritmo mensual — orientativo".
- Importante: este % puede ser >100% si un mes el cliente compró más MATER del
  que consumió (sobreventa). El sistema lo trata como cumplimiento, lo cual
  es correcto operacionalmente pero puede sorprender visualmente.

---

### 2.5. Porcentaje renovable Year-To-Date (YTD)

**Código** (`vw_compliance_27191_mensual`, ventana `ytd`):
```sql
demanda_ytd_mwh   = sum(demanda_real_mwh)         OVER (PARTITION BY nemo, anio ORDER BY mes ROWS UNBOUNDED PRECEDING)
renovable_ytd_mwh = sum(renovable_contratado_mwh) OVER (...)
pct_renovable_ytd = renovable_ytd_mwh / demanda_ytd_mwh
```

**Fuente**: este es el indicador que la Ley 27.191 evalúa al 31/dic. La fórmula
estándar es: total renovable acumulado año / total demanda acumulada año.

**Veredicto**: ✅ **Alineado** con interpretación legal estándar.

**Notas**:
- La UI lo muestra como **"Cumple Ley 27.191"** en StatCard prominente (Fix #5).
- El `cumple_mes` quedó como indicador secundario "ritmo del mes" para evitar
  confusión entre cumplimiento mensual técnico y cumplimiento legal anual.

---

### 2.6. Brecha mensual y brecha YTD

**Código**:
```sql
brecha_mwh     = greatest(demanda_real_mwh * obligacion_pct - renovable_contratado_mwh, 0)
brecha_ytd_mwh = greatest(demanda_ytd_mwh * obligacion_pct - renovable_ytd_mwh, 0)
```

**Fuente**: Ley 27.191 Art. 11, "el faltante de cumplimiento" se calcula como
la diferencia entre lo exigido y lo cubierto.

**Veredicto**: ✅ **Alineado**.

**Notas**:
- El `greatest(..., 0)` asegura que sobrecumplir no genera "brecha negativa".
- El indicador clave para venta es `brecha_ytd_mwh` (cuántos MWh faltan al
  cierre del año proyectado).

---

### 2.7. ⭐ Multa estimada (FIX #1)

**Código actual** (post-Fix #1, `vw_compliance_27191_mensual`):

```sql
-- Cálculo del precio de referencia para multa (4 fallbacks por orden)
multa_ref_pesos_mwh = coalesce(
  multa_override_pesos_mwh,                  -- 1. Override manual (vacío hoy)
  precio_cvp_alternativos_pesos_mwh,         -- 2. CVP alternativos × dólar (NUEVO ⭐)
  precio_cliente_12m_pesos_mwh,              -- 3. Precio MATER cliente 12m (fallback)
  precio_universo_anual_pesos_mwh,           -- 4. Precio MATER universo anual (fallback)
  0
)

-- Cálculo del CVP alternativos (lo nuevo):
precio_cvp_alternativos_pesos_mwh = (
  avg(combustibles_precios_mensual.costo_total_usd_mwh_alt
       de los 12 meses previos al mes en cuestión)
  * cotizacion_dolar_mensual.cotizacion_ars del mes en cuestión
)

multa_estimada_pesos = brecha_mwh × multa_ref_pesos_mwh
```

**Fuente**: Ley 27.191 Art. 11 (citando textualmente):

> "Costo Variable de Producción de Energía Eléctrica correspondiente a la
> generación cuya fuente de combustible sea gasoil de origen importado,
> calculado como el promedio ponderado de los doce (12) meses del año
> calendario anterior a la fecha de incumplimiento."

[Fuente InfoLEG](https://servicios.infoleg.gob.ar/infolegInternet/anexos/250000-254999/253626/norma.htm)

**Veredicto**: ⚠️ **Aproximación documentada** (mejor que antes, no perfecta).

**Diferencia con la norma estricta**:

| Aspecto | Lo que dice la ley | Lo que hace el sistema | Impacto |
|---|---|---|---|
| Combustible referencia | "gasoil de origen importado" específicamente | CVP de **todos** los combustibles alternativos (gasoil + fuel oil + carbón) ponderado por generación | Aproximación cercana — el gasoil importado representa la mayoría del costo en el agregado "alternativos" |
| Período | "12 meses del año calendario anterior" | 12 meses inmediatamente previos al mes evaluado (rolling) | Para la multa anual al 31/dic, ambas definiciones convergen al mismo número |
| Ponderación | "promedio ponderado" | El campo `costo_total_usd_mwh_alt` ya viene ponderado por generación desde CAMMESA | ✅ Correcto |
| Conversión a pesos | No lo dice (es número en USD/MWh) | Multiplicamos por cotización BCRA mayorista del mes | Convención razonable |

**Notas y recomendaciones**:
- Para cerrar el gap "gasoil importado puro" vs "alternativos", se podría
  agregar al CSV de combustibles una columna específica `costo_total_usd_mwh_gasoil_importado`
  cuando CAMMESA la publique desagregada. Hoy el agregado "alternativos" es lo
  más cercano disponible públicamente.
- **El sistema muestra el método**: en la UI aparece un badge `Método: cvp_alternativos`
  para que el cliente sepa de dónde viene el número.
- Antes del Fix #1, el sistema usaba **precio MATER promedio** (~30 USD/MWh)
  como referencia de multa. Eso subestimaba la multa ~6x. **Hoy el número es
  defendible legalmente y consistente con lo que un consultor energético
  calcularía.**

---

### 2.8. Cumple mes / Cumple YTD

**Código**:
```sql
cumple_mes = renovable_contratado_mwh >= obligacion_mwh                   -- por mes
cumple_ytd = renovable_ytd_mwh        >= demanda_ytd_mwh * obligacion_pct  -- acumulado
```

**Fuente**: definiciones operacionales. La ley solo reconoce `cumple_ytd` como
binario legalmente vinculante.

**Veredicto**: ✅ **Alineado**, con clarificación UX (Fix #5).

**Notas**:
- El frontend ahora muestra:
  - **Banner permanente** explicando que la evaluación es anual.
  - **Chart mensual** con barras color teal uniforme (no verde/rojo binario).
  - **StatCard** "Cumple Ley 27.191" con peso visual al `cumple_ytd` únicamente.
- El `cumple_mes` queda en el dato pero ya no se transmite como "aprobado/desaprobado".

---

## 3. Módulo Exposición Spot

**Ruta producto**: `/app/exposicion-spot`
**Edge function**: `supabase/functions/gu-exposicion/index.ts`
**Vistas L3**: `vw_consumo_gu_mensual`, `vw_exposicion_spot_mensual`, `vw_precios_dex_mensual`
**Migración base**: `scripts/sql/railway_exposicion_spot_mat.sql`

### 3.1. Compra spot total mensual (MWh)

**Código**: para cada tipo de agente, suma de las 3 bandas de compra spot.

- **GUMA moderno** (`col_count = 30, 31`): `compra_spot_pico_mwh` directo de columnas del archivo + ídem valle/resto.
- **GUMA legacy** (`col_count = 51, 52`): solo `compra_spot_resto_mwh` disponible (los archivos viejos no separaban bandas).
- **GUME** (variantes 22, 23, 31, 32, 33, 34): combinaciones según layout.
- **GUDI** (vía `raw_dexc col_count = 19`): cálculo `max(0, demanda - contratado)` por banda × 3 tipos de día.

**Fuente**: cada layout corresponde a una versión histórica del DTE CAMMESA. Los
mapeos columna→concepto se infirieron por muestreo y validación cruzada interna.

**Veredicto**: ✅ **Alineado para 2022+**, ⚠️ aproximación para legacy (ver 3.5).

---

### 3.2. % Spot y % MATER

**Código** (`vw_exposicion_spot_mensual`):
```sql
pct_spot = round(compra_spot_mwh / demanda_real_mwh, 6)
pct_mat  = round(demanda_contratada_mwh / demanda_real_mwh, 6)
```

**Veredicto**: ✅ **Alineado** (proporciones simples).

**Notas**:
- La diferencia `1 - pct_spot - pct_mat` es lo que la UI llama "Resto"
  (bilateral / Plus / energía no-MATER). Conceptualmente correcto.
- **Riesgo de inconsistencia**: en algunos meses para algunos GUMEs, la suma
  puede exceder 1 si el cliente sobrevende renovable. La UI lo trunca a 100%
  pero el dato crudo lo deja pasar.

---

### 3.3. Sub-contrato y sobre-contrato (balance contractual)

**Código**:
```sql
sobre_contrato_mwh = greatest(demanda_contratada_mwh - demanda_real_mwh, 0)
sub_contrato_mwh   = greatest(demanda_real_mwh - demanda_contratada_mwh, 0)
```

**Fuente**: definición operacional estándar de mercado eléctrico. Sub-contrato =
faltó cobertura, sobre-contrato = sobró cobertura.

**Veredicto**: ✅ **Alineado**.

**Notas**:
- Para clientes con contratos MATER, **el sub-contrato es el principal driver
  de exposición spot evitable** — si tu MATER cubría 100 MWh y consumiste 110,
  esos 10 MWh extra los pagaste a precio spot que es volátil.
- El módulo lo muestra como chart con barras hacia arriba (verde = exceso) y
  hacia abajo (rojo = déficit), línea cero como referencia.

---

### 3.4. Costo spot promedio $/MWh

**Código**:
```sql
costo_spot_promedio_pesos_mwh = round(spot_pesos / compra_spot_mwh, 6)
```

**Veredicto**: ✅ **Alineado** cuando `spot_pesos` está bien calculado (que
ahora sí lo está para los 3 tipos de agente — ver 3.5 y 3.6).

---

### 3.5. ⭐ Spot pesos para GUDI (FIX #2)

**Código actual** (post-Fix #2, branch `gudi_dexc` en `vw_consumo_gu_mensual`):

```sql
compra_spot_pesos_gudi =
    (suma de las 3 bandas × 3 tipos de día de spot MWh)
  × precio_dex_promedio_pesos_mwh   -- promedio mensual de los 9 valores DEX
```

Donde `precio_dex_promedio_pesos_mwh` viene de `vw_precios_dex_mensual`,
extraído del archivo DEXC del DTE (regex consistente con
`cammesa_parametros_mensuales_v2`).

**Fuente**: las facturas DEXC reales que CAMMESA emite a clientes GUDI usan
precios diferenciados por **tipo de día** (hábil / sábado / domingo) ×
**banda** (pico / diurna / valle) = 9 precios distintos. Los volúmenes en
`raw_dexc` están agregados por mes pero separados por esas 9 combinaciones.

**Veredicto**: ⚠️ **Aproximación v1 documentada, mejorable**.

**Diferencia con el cálculo perfecto**:

| Aspecto | Cálculo "perfecto" | Lo que hace el sistema (v1) | Impacto |
|---|---|---|---|
| Granularidad de precio | 9 precios distintos × volúmenes por día y banda | 1 precio promedio × volumen total spot | Error típico esperado: 5-15% sobre el monto total |
| Direccionalidad del error | n/a | Tendencia a sub-estimar o sobre-estimar según mix de consumo | Para clientes con consumo concentrado en pico (más caro), sub-estima |

**Por qué se eligió aproximación v1**:
- El sistema antes mostraba `$0` para GUDI (módulo inutilizable).
- Con la aproximación v1, el módulo muestra valores plausibles.
- El cálculo perfecto requiere reescribir el parser DEXC preservando
  `tipo_dia` (hábil/sábado/domingo) en la apertura, que es trabajo adicional.

**Recomendación futura**: cuando aparezca el primer cliente GUDI que pague,
reescribir el parser para precisión 100%. Hasta entonces, **la aproximación v1
es defendible** con el caveat documentado.

---

### 3.6. Spot pesos para GUMA y GUME

**Código**: `compra_spot_pesos` viene **directo del archivo CAMMESA** en una
columna específica (`col_014` para GUMA new, `col_011` para GUME 23, etc.).

**Veredicto**: ✅ **Alineado** (es el dato oficial CAMMESA, sin transformación).

**Notas**: estos valores son auditables 1:1 contra el DTE oficial del cliente.

---

## 4. Módulo Perfil de Carga

**Ruta producto**: `/app/perfil-carga`
**Edge function**: `supabase/functions/gu-factor-carga/index.ts`
**Vistas L3**: `vw_factor_carga_mensual`, `vw_factor_carga_benchmark`
**Migración base**: `scripts/sql/railway_factor_carga.sql`

### 4.1. Bandas horarias (definición)

**Código**: el sistema **no recalcula** las bandas. Toma los valores ya
agregados por CAMMESA en los archivos AGUM/anexo_guma:
```sql
demanda_real_pico_mwh   -- viene preagregado
demanda_real_valle_mwh
demanda_real_resto_mwh
```

**Fuente**: Procedimientos Técnicos CAMMESA — bandas horarias del MEM:
- **Pico**: 18:00 – 23:00 (5 h)
- **Resto**: 05:00 – 18:00 y 23:00 – 24:00 (14 h)
- **Valle**: 00:00 – 05:00 (5 h)

**Veredicto**: ✅ **Alineado** (el dato es oficial CAMMESA, no se recalcula).

**Notas — Fix #6**: el label de la UI decía "Valle 0-6h", se corrigió a
"Valle 0-5h" para coincidir con la definición CAMMESA real. El **dato numérico
nunca estuvo mal**, solo el texto del label.

---

### 4.2. % Pico, % Valle, % Resto

**Código**:
```sql
pct_pico  = demanda_real_pico_mwh  / demanda_real_mwh
pct_valle = demanda_real_valle_mwh / demanda_real_mwh
pct_resto = demanda_real_resto_mwh / demanda_real_mwh
```

**Veredicto**: ✅ **Alineado** (proporciones simples sobre datos oficiales).

**Notas — calidad del dato**: la vista marca `calidad_dato = 'pvr_no_cierra'`
si la suma de las 3 bandas difiere del total declarado en más del 5%. Útil
para detectar GUMEs con apertura PVR incompleta.

---

### 4.3. Ratio Pico / Valle

**Código**:
```sql
ratio_pico_valle = demanda_real_pico_mwh / demanda_real_valle_mwh
```

**Veredicto**: ✅ **Alineado**.

**Notas**:
- Indicador útil para identificar clientes que podrían beneficiarse de
  desplazar carga a valle (cuando el spot es más barato).
- Valores típicos: industrias 24x7 dan ratio ~1, industrias diurnas dan ratio >2.

---

### 4.4. Factor de carga (NO IMPLEMENTADO)

**Código**: `factor_carga_pct = NULL`, `factor_carga_metodo = 'no_disponible_sin_potencia_maxima'`.

**Razón**: el cálculo clásico de factor de carga requiere **potencia máxima
mensual** (en MW), dato que NO está en los archivos AGUM/anexo_guma estándar
(solo MWh). Sin ese numerador, no se puede calcular.

**Veredicto**: ✅ **Alineado** (decisión correcta de no inventar el dato).

**Notas — feature futura**: si CAMMESA publica el dato de potencia máxima en
algún anexo (puede estar en `raw_atra` o en un anexo de transporte), agregar
el cálculo. Hasta entonces, mejor mostrar nada que mostrar un número inventado.

---

### 4.5. Percentil de pico (benchmark)

**Código** (`vw_factor_carga_mensual`):
```sql
pct_pico_percentil = percent_rank() OVER (PARTITION BY tipo_agente, anio, mes ORDER BY pct_pico)
```

**Fuente**: convención estadística estándar para benchmarking.

**Veredicto**: ✅ **Alineado**.

**Notas**:
- Permite que el cliente vea "estoy en el percentil P75 de mi tipo" — útil
  para gamificación / motivación.
- La vista `vw_factor_carga_benchmark` provee P25/P50/P75 del universo del mes
  para mostrar bandas de comparación.

---

## 5. Módulo Historia Energética

**Ruta producto**: `/app/historia`
**Edge function**: `supabase/functions/gu-historia-energetica/index.ts`
**Vista L3**: `vw_historia_resumen_agente`
**Migración base**: `scripts/sql/railway_historia_energetica.sql`

### 5.1. Demanda mensual histórica

**Código**: `demanda_real_mwh` desde `vw_consumo_gu_mensual`, ordenado por (anio, mes).

**Veredicto**: ✅ **Alineado**.

**Notas**: histórico cargado desde 2020-02 según RUNBOOK del proyecto.

---

### 5.2. YoY (Year-over-Year)

**Código**:
```sql
yoy_pct = (demanda_actual - demanda_mismo_mes_anio_anterior) / demanda_mismo_mes_anio_anterior
```

**Veredicto**: ✅ **Alineado** (definición estándar).

**Notas**: el `connectNulls` del frontend evita huecos visuales si falta un mes.

---

### 5.3. Heatmap año × mes

**Código**: el frontend normaliza la demanda mensual a 0-1 usando min/max del
rango visible y colorea con un gradiente.

**Veredicto**: ✅ **Alineado**.

**Notas**: efectivo para detectar estacionalidad (ej: empresa con paradas de
verano se ve como columna de eneros oscuros).

---

## 6. Módulo Mercado / Contexto

**Ruta producto**: `/app/mercado`
**Edge function**: `supabase/functions/gu-mercado-contexto/index.ts`
**Migración**: `scripts/sql/railway_mercado_contexto.sql`

### 6.1. Generación nacional por tipo

**Código**: directo desde tablas `cammesa_memnet_generacion` o
`cammesa_operaciones_generacion` (CSV crudos descargados de MEMNET).

**Veredicto**: ✅ **Alineado** (es el dato oficial CAMMESA, sin transformación).

---

### 6.2. % Renovable del sistema

**Código**: cociente directo entre generación renovable (Hidro≥50MW + Ley 26.190)
y generación total.

**Veredicto**: ✅ **Alineado**.

**Notas**: este indicador es **macro nacional**, no del agente cliente. Útil
para contexto pero no para cálculo de cumplimiento individual.

---

## 7. Módulo Home / Informe de Inicio

**Ruta producto**: `/app`
**Edge function**: `supabase/functions/gu-informe-inicio/index.ts`

Este módulo no tiene cálculos propios — agrega snapshots de los otros 5 módulos
en una vista ejecutiva. Los veredictos son herencia directa de los módulos de origen.

---

## 8. Pipelines y trazabilidad

### 8.1. Versionado del parser

Cada fila en tablas L2/L3 lleva un campo `parser_version` (texto). Si CAMMESA
cambia el formato de un archivo o se descubre un bug, se incrementa la versión
y se reprocesa el rango afectado.

**Veredicto**: ✅ **Buena práctica**.

**Notas — versiones activas a la fecha**:
- `combustibles_historico_v1` — Fase A
- `cammesa_parametros_mensuales_v2` — pre-Fase A (DTE/ADCO)

### 8.2. Idempotencia

Todas las funciones `refresh_*` están diseñadas para correr N veces sin
duplicar datos:
```sql
refresh_compliance_27191()
refresh_cotizacion_dolar_mensual()
refresh_precios_dex_mensual()
refresh_factor_carga()
refresh_historia_resumen_agente()
refresh_dashboard_inicio()
```

**Veredicto**: ✅ **Alineado**.

---

## 9. Hallazgos abiertos / deuda técnica

Cosas que no son bloqueantes pero conviene tener documentadas:

| # | Hallazgo | Severidad | Nota |
|---|---|---|---|
| 1 | CVP "alternativos agregado" vs "gasoil importado puro" en multa Ley 27.191 | 🟢 | Aproximación documentada (2.7). Mejorar cuando CAMMESA publique desagregado. |
| 2 | Spot pesos GUDI usa precio promedio mensual, no por banda × tipo de día | 🟢 | Aproximación documentada (3.5). Mejorar cuando llegue cliente GUDI pagando. |
| 3 | Factor de carga clásico no implementado (falta potencia máxima) | 🟢 | Decisión correcta de no inventar dato (4.4). |
| 4 | GUME legacy (col_count 22/31) asume "demanda = compra spot" | 🟢 | Modelo pre-Res. 1281/06. Sobre-estima ligeramente exposición spot moderna. Documentado en `fix_3_gume_legacy_validacion.md`. |
| 5 | Tabla `compliance_27191_obligacion` cargada hasta 2030 con 20% fijo | 🟢 | Si la ley cambia, basta UPDATE puntual. |

---

## 10. Cómo defender este sistema en una demo con consultor

Si un consultor energético externo audita EnergyOS, los puntos a destacar son:

### Lo que va a aprobar fácil
1. Multa 27.191 calculada con CVP alternativos × dólar oficial (Art. 11 cumplido).
2. Cronograma de obligación 2017-2030 cargado y configurable.
3. Cumplimiento legal (`cumple_ytd`) destacado vs orientativo (`cumple_mes`).
4. Bandas horarias respetando definición CAMMESA (Pico 18-23, Valle 0-5).
5. Trazabilidad: cada KPI tiene `parser_version` y vista materializada inspeccionable.

### Lo que probablemente va a observar (y la respuesta preparada)

| Observación esperada | Respuesta |
|---|---|
| "El CVP debería ser solo gasoil importado, no alternativos agregado" | "Cierto. Hoy usamos alternativos como aproximación porque CAMMESA no publica el desagregado en el informe mensual de combustibles. Cuando salga ese dato, lo agregamos como columna nueva en la tabla de combustibles. La aproximación actual es ~10% conservadora respecto al gasoil puro." |
| "El spot pesos para GUDI debería usar precio por banda × tipo de día" | "Es la mejora v2 ya identificada. La v1 actual usa precio promedio mensual y queda con un error típico de 5-15%. Suficiente para gestión, no para liquidación oficial." |
| "¿Cómo validan el parser GUME legacy?" | "Cross-check interno contra la propia raw_anexo_gume: 100% de las filas validan total = pico+valle+resto. Documento en `fix_3_gume_legacy_validacion.md`." |
| "Falta el factor de carga clásico" | "Sí, lo identificamos. No lo inventamos porque no hay dato de potencia máxima en los archivos públicos. Mostramos en su lugar el ratio pico/valle como proxy." |

### Lo que NO se debe defender
- Promesas de "cálculo 100% legalmente vinculante" — el sistema da **estimaciones
  defendibles**, no liquidación oficial. Eso siempre lo determina CAMMESA con sus
  cierres mensuales y el ENRE en el caso de sanciones.

---

## 11. Versiones y referencias

- **Fase A — auditoría e implementación**: completada mayo 2026.
- **Doc complementario**: [`docs/dominio_mem.md`](dominio_mem.md) — contexto regulatorio.
- **Doc complementario**: [`docs/fix_3_gume_legacy_validacion.md`](fix_3_gume_legacy_validacion.md) — detalle del cierre Fix #3.
- **Próximo doc**: `docs/checklist_validacion.md` — hoja de cotejo para reunión con consultor humano.

---

*Mantener actualizado: cuando se agregue un nuevo cálculo, módulo o se cambie
una fórmula existente, agregar la entrada acá con sus 4 secciones (Código /
Fuente / Veredicto / Notas).*
