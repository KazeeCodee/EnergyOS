# Checklist de validación — para reunión con consultor energético

> **Propósito.** Convertir 1 hora de reunión con un consultor energético
> argentino en una validación completa del sistema EnergyOS. Sin este
> checklist, una hora apenas alcanza para mostrar 2-3 pantallas. Con este
> checklist, alcanza para validar los 5 KPIs críticos.
>
> **Audiencia.** El consultor (que va a tildar) y vos (que vas a tomar nota
> de las observaciones).
>
> **Cómo usarlo.** Imprimirlo o compartir pantalla. Por cada ítem, el
> consultor marca: ✅ correcto / ⚠️ correcto con observación / ❌ incorrecto.
> Para los ❌, anotar la causa y la corrección sugerida en la columna "Notas".

---

## 0. Antes de la reunión (15 minutos de preparación)

- [ ] Tener acceso a la app con un agente real cargado (idealmente un GUMA
      con histórico mínimo 2 años). Si no tenés cuenta de cliente real, usar
      la cuenta de trial.
- [ ] Tener abierto en otra pestaña [`docs/dominio_mem.md`](dominio_mem.md) y
      [`docs/auditoria_calculos.md`](auditoria_calculos.md) por si surgen
      preguntas técnicas.
- [ ] Si el consultor lo pide: tener listo el **DTE oficial CAMMESA del
      agente** del último mes para cross-check 1:1.
- [ ] Asegurarse que las migraciones SQL de Fase A estén aplicadas en Railway
      (smoke test: abrir `/app/cumplimiento-renovable` y confirmar que el
      banner azul aparece).

---

## 1. Datos básicos del agente vinculado (5 min)

Ruta: `/app/ajustes`

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 1.1 | NEMO mostrado coincide con el agente real CAMMESA | | |
| 1.2 | Razón social + tipo de agente (GUMA/GUME/GUDI) correctos | | |
| 1.3 | Distribuidor mostrado es el correcto | | |
| 1.4 | Último mes disponible es el último publicado por CAMMESA | | |

---

## 2. Cumplimiento Ley 27.191 (15 min — el más crítico)

Ruta: `/app/cumplimiento-renovable`

### 2.1. Banner regulatorio

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 2.1.1 | Banner azul arriba dice que la ley se evalúa al 31/dic | | |
| 2.1.2 | El texto del banner es interpretable y correcto regulatoriamente | | |

### 2.2. StatCard "Cumple Ley 27.191"

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 2.2.1 | El indicador SÍ/NO refleja `cumple_ytd`, no `cumple_mes` | | |
| 2.2.2 | El año mostrado es el año en curso del último dato | | |
| 2.2.3 | El color (verde/rojo) coincide con el SÍ/NO | | |

### 2.3. Obligación porcentual

Pedir al consultor que verifique los porcentajes contra la Ley 27.191 Art. 8:

| Año | El sistema muestra | Lo que dice la ley | ✅ ⚠️ ❌ |
|---|---|---|---|
| 2017 | 8% | 8% | |
| 2019 | 12% | 12% | |
| 2021 | 16% | 16% | |
| 2023 | 18% | 18% | |
| 2025 | 20% | 20% | |
| 2026 | 20% | 20% (vigente) | |

Para verificar: pedir al consultor que seleccione un mes específico de
distintos años en el RangeSelector y observe la línea de obligación en el
chart "Trayectoria del año".

### 2.4. Cálculo de % renovable

Tomar **un mes específico** (ej: mar-2026) y verificar:

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 2.4.1 | `% renovable real = MWh contratados MATER / MWh demandados` | | |
| 2.4.2 | Los MWh contratados MATER coinciden con el A6.1.3.1 del DTE oficial | | |
| 2.4.3 | Los MWh demandados coinciden con el A4 del DTE oficial | | |

### 2.5. Cálculo de la multa estimada (el más sensible)

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 2.5.1 | Aparece badge "Método: cvp_alternativos" al pie del chart de multa | | |
| 2.5.2 | El precio de referencia ($/MWh) es del orden de **150-300 mil ARS/MWh** (no ~30-50 mil que sería el precio MATER) | | |
| 2.5.3 | La multa total = brecha MWh × precio de referencia | | |
| 2.5.4 | La nota explicativa cita "Art. 11 Ley 27.191" y "CVP combustibles alternativos × cotización dólar" | | |
| 2.5.5 | El consultor está dispuesto a defender este cálculo ante un cliente | | |

**Pregunta directa al consultor en este punto**:
> "Si vos hicieras a mano el cálculo de la multa de este agente para este mes,
> ¿te daría parecido? ¿Cuál sería tu propio número y de dónde lo sacarías?"

Anotar la respuesta literal en notas. Si el delta es <20%, ✅. Si es >20%,
revisar si CAMMESA publicó algún CVP gasoil específico que no estamos usando.

---

## 3. Exposición Spot (10 min)

Ruta: `/app/exposicion-spot`

### 3.1. KPIs principales

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 3.1.1 | "% Spot promedio" es razonable para el tipo de agente (GUMA típico 5-30%, GUME mayoritariamente >70% si es legacy) | | |
| 3.1.2 | "% MATER promedio" + "% Spot" + Resto suman ~100% | | |
| 3.1.3 | "Costo spot promedio" ($/MWh) está en el rango plausible del MEM | | |
| 3.1.4 | "Gasto spot total" coincide en orden de magnitud con la factura del cliente | | |

### 3.2. Balance contractual

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 3.2.1 | Sub-contrato y sobre-contrato son mutuamente excluyentes en cada mes | | |
| 3.2.2 | Si el cliente tiene contrato MATER firme, los meses con sub-contrato indican picos no cubiertos | | |
| 3.2.3 | El chart "Balance contractual mensual" muestra la dirección correcta (verde arriba = exceso, rojo abajo = déficit) | | |

### 3.3. Caso especial GUDI (solo si el agente es GUDI)

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 3.3.1 | "Costo spot promedio" para GUDI NO es $0 | | |
| 3.3.2 | Los valores son consistentes con los precios DEX publicados por CAMMESA | | |
| 3.3.3 | Aparece nota explicando que es aproximación con precio promedio mensual (no por banda) | | |

---

## 4. Perfil de Carga (5 min)

Ruta: `/app/perfil-carga`

### 4.1. Bandas horarias

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 4.1.1 | Pico = 18:00–23:00 | | |
| 4.1.2 | Valle = 0:00–5:00 (no 0–6h) | | |
| 4.1.3 | Resto cubre el resto de las horas | | |

### 4.2. % por banda

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 4.2.1 | % Pico + % Valle + % Resto ≈ 100% (tolerancia ±2%) | | |
| 4.2.2 | El ratio Pico/Valle es plausible para el tipo de industria | | |
| 4.2.3 | Para industrias 24x7 el ratio es cercano a 1; para diurnas, >1.5 | | |

### 4.3. Benchmark percentil

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 4.3.1 | El percentil P0-P100 es interpretable (P25/P50/P75 mostrados) | | |
| 4.3.2 | El benchmark se hace contra el universo del mismo `tipo_agente` (GUMA con GUMA, GUME con GUME) | | |
| 4.3.3 | La interpretación textual coincide con el percentil mostrado | | |

---

## 5. Historia Energética (5 min)

Ruta: `/app/historia`

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 5.1 | Promedio mensual coincide con la suma de los meses dividido por la cantidad | | |
| 5.2 | La variación YoY del último mes es correcta (último mes vs mismo mes año anterior) | | |
| 5.3 | Mes mayor consumo y mes menor consumo coinciden con la inspección visual del chart | | |
| 5.4 | El heatmap muestra estacionalidad reconocible (ej: industrial con paradas de verano) | | |

---

## 6. Mercado / Contexto (5 min — informativo)

Ruta: `/app/mercado`

| # | Ítem | ✅ ⚠️ ❌ | Notas |
|---|---|---|---|
| 6.1 | El "% Renovable sistema" es del orden de 15-25% (rango típico Argentina actual) | | |
| 6.2 | El mix de generación nacional muestra Térmico como mayor componente | | |
| 6.3 | El sector industrial líder en demanda coincide con la realidad pública (típicamente Metales o Refinación) | | |
| 6.4 | La fuente CAMMESA está claramente identificada al pie | | |

---

## 7. Cierre con el consultor (10 min)

### 7.1. Pregunta clave de credibilidad

> "Si un cliente tuyo te muestra este sistema y te pregunta si es confiable
> para tomar decisiones de compra MATER, ¿qué le dirías?"

Anotar respuesta literal: ___________________________________________

### 7.2. Hallazgos espontáneos del consultor

Espacio libre para anotar todo lo que el consultor mencione fuera de este
checklist (a veces los hallazgos más valiosos son los que el cliente trae
de su propia práctica):

- _______________________________________________________________________
- _______________________________________________________________________
- _______________________________________________________________________
- _______________________________________________________________________

### 7.3. Acciones que surgieron

| # | Acción | Severidad | Responsable | Plazo |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## 8. Resultado de la sesión

Marcar lo que aplique:

- [ ] **🟢 VALIDADO** — el consultor aprueba el sistema sin observaciones
      mayores. Listo para vender con respaldo profesional.
- [ ] **🟡 VALIDADO CON OBSERVACIONES** — el sistema es vendible pero hay
      N hallazgos menores a corregir antes de demos importantes.
- [ ] **🔴 REQUIERE TRABAJO** — hay un hallazgo serio que pone en duda la
      credibilidad. Detener venta hasta corregir.

**Decisión post-sesión**:

___________________________________________________________________________

___________________________________________________________________________

---

## 9. Información para el consultor (referencia rápida)

Si el consultor quiere profundizar en cómo se calcula algo, derivarlo a:

| Sobre... | Doc de referencia |
|---|---|
| Marco regulatorio (leyes, resoluciones, bandas, agentes) | [`dominio_mem.md`](dominio_mem.md) |
| Fórmulas exactas con líneas de código | [`auditoria_calculos.md`](auditoria_calculos.md) |
| Por qué cerramos el bug GUME legacy sin tocar código | [`fix_3_gume_legacy_validacion.md`](fix_3_gume_legacy_validacion.md) |
| Visión de producto y arquitectura | [`sistema_overview.md`](sistema_overview.md) |

---

## 10. Después de la sesión

1. **Día mismo**: digitalizar el checklist con tildes y notas. Guardar en
   `docs/validaciones/<fecha>_<consultor>.md`.
2. **24-48 hs**: si hubo hallazgos rojos, agendarlos como issues priorizados.
3. **1 semana**: enviar al consultor una nota agradeciendo + las acciones
   que se tomaron sobre sus observaciones (cierra el loop profesional, suele
   convertirse en referidos).

---

*Versión 1 — mayo 2026. Actualizar cuando se agregue un módulo nuevo o se
cambien KPIs principales.*
