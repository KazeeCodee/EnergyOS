# Dominio MEM — Marco de referencia para EnergyOS

> **Propósito.** Documento de inmersión al sector eléctrico argentino aplicado a EnergyOS. Sirve para tres cosas:
> 1. Que vos (CEO) y cualquier persona nueva en el equipo puedan vender con propiedad.
> 2. Que cada KPI del producto tenga un anclaje regulatorio explícito.
> 3. Que un consultor energético externo pueda auditar el sistema usando este doc como mapa.
>
> **Scope.** Solo lo que toca a Grandes Usuarios del MEM (GUMA/GUME/GUDI), que es el cliente target de EnergyOS. No cubre residencial ni distribución.
>
> **Estado.** v1 — Fase A de auditoría (mayo 2026). Hallazgos preliminares al final.

---

## 1. El sistema eléctrico argentino en 30 segundos

El **SADI** (Sistema Argentino de Interconexión) es la red eléctrica nacional. Sobre él operan tres tipos de actores:

- **Generadores** — producen energía (térmicas, hidráulicas, nucleares, renovables).
- **Transportistas** — mueven la energía en alta tensión (Transener y siete distritrales).
- **Distribuidores** — entregan al usuario final en media/baja tensión (Edenor, Edesur, Edemsa, etc.).

Sobre ese sistema físico hay un **mercado** —el **MEM (Mercado Eléctrico Mayorista)**— donde generadores, distribuidores y grandes usuarios industriales transan la energía. El operador del mercado es **CAMMESA** (Compañía Administradora del Mercado Mayorista Eléctrico S.A.), una sociedad anónima sin fines de lucro participada por el Estado, generadores, transportistas, distribuidores y grandes usuarios.

**¿Qué hace CAMMESA?**
- Despacha la generación (decide qué centrales prenden cada hora).
- Calcula el **precio spot horario** del MEM.
- Liquida las transacciones económicas mensuales (acreedor/deudor por agente).
- Publica los **DTE** (Documentos de Transacciones Económicas) que son la "factura sombra" de cada agente.
- Administra el **MATER** (mercado de contratos renovables privados).

Para EnergyOS, CAMMESA es **el productor del dato crudo** que alimenta todo el sistema (capa L1).

---

## 2. Tipos de Grandes Usuarios — quiénes pueden ser clientes

Un Gran Usuario (GU) es una empresa que, por su volumen, compra energía directamente al MEM (en lugar de comprársela a su distribuidora). El criterio es la **demanda de potencia**:

| Categoría | Demanda mínima | Cómo compra | Documento CAMMESA principal |
|---|---|---|---|
| **GUMA** (Gran Usuario Mayor) | ≥ **1 MW** | Hasta 50% spot, mínimo 50% por contrato | `AGUM` / `anexo_guma` |
| **GUME** (Gran Usuario Menor) | 30 kW – 2 MW | 100% por contrato (en teoría) | `anexo_gume` |
| **GUPA** (Gran Usuario Particular) | 30 – 100 kW | 100% por contrato | `anexo_gume` (variantes) |
| **GUDI** (Gran Usuario de la Distribuidora) | ≥ 300 kW | A través del distribuidor; aplica Res. SE 1281/06 | `GUDI` / `raw_dexc` |

Fuente: portal institucional CAMMESA y normativa Res. 423/98 y Res. SE 1281/06.

> **Implicancia para EnergyOS.** El producto está pensado para GUMA y GUME principalmente. Un GUMA típico (siderúrgica, petrolera, minera, química, automotriz) consume entre **50.000 y 500.000 MWh/año**. Un GUME (industria mediana) entre **5.000 y 50.000 MWh/año**. Ese es tu rango de tamaños esperado por agente.

### Universo aproximado en Argentina (2024-2025)
- **GUMA**: ~600 agentes activos.
- **GUME**: ~5.000 agentes activos.
- **GUDI**: ~2.000-3.000 agentes (depende de cómo se cuente).
- **MATER**: ~260+ grandes usuarios con contratos firmados, según relevamientos sectoriales públicos.

Total mercado direccionable EnergyOS (TAM): ~7.000-8.000 agentes. Subset realista (SAM): los GUMA + GUME con consumo significativo y obligación 27.191, ~3.000-4.000 agentes.

---

## 3. Cómo compra energía un Gran Usuario

Un GU **mezcla tres fuentes** para cubrir su consumo mensual:

### 3.1. Compra **spot** (mercado horario)
El precio horario que fija CAMMESA cada hora según el costo marginal del sistema. Es **volátil**: en un mes seco con generación cara puede dispararse; en uno con buena hidráulica puede ser bajo.

- **Ventaja**: flexibilidad, sin compromisos.
- **Riesgo**: precio.
- **En EnergyOS**: módulo *Exposición Spot*. KPIs `compra_spot_mwh`, `pct_spot`, `costo_spot_promedio_pesos_mwh`.

### 3.2. Contratos a término **MATER** (renovables)
Contratos bilaterales privados con un generador renovable (parque eólico/solar), regidos por la **Resolución 281/2017**. Plazos 5-15 años, precio fijo o ajustado por fórmula. La energía contratada se descuenta del consumo del cliente y **cuenta para Ley 27.191**.

- **Ventaja**: precio cerrado + cumplimiento regulatorio.
- **Riesgo**: under-delivery del generador, exposición si demanda < contrato.
- **En EnergyOS**: módulos *Cumplimiento 27.191* y *Exposición Spot*. KPIs `renovable_contratado_mwh`, `demanda_contratada_mwh`, balance sub/sobre-contrato.

### 3.3. Contratos bilaterales no-renovables ("Plus", residual)
Contratos con generadores convencionales, históricamente importantes pre-MATER. Cada vez menos relevantes.

- **En EnergyOS**: aparece como "Resto" en el mix.

### 3.4. Suma cero por mes
La identidad básica para cualquier GU es:

```
demanda_real_total = compra_spot + energía_contratada_consumida
```

Si hay sub-contrato → faltó cobertura, compraste spot extra. Si hay sobre-contrato → te sobró energía contratada (la regalás al MEM o la perdés según tipo de contrato).

---

## 4. Ley 27.191 — el corazón del módulo *Cumplimiento*

Es probablemente la pieza regulatoria más importante para tu producto y la que más se vende.

### 4.1. Qué obliga

La **Ley 27.191** (sancionada 2015) y su **Resolución 281/2017** establecen que los Grandes Usuarios del MEM con demanda **≥ 300 kW** deben cubrir un porcentaje creciente de su consumo eléctrico anual con energía de fuentes renovables.

**Cronograma legal exacto:**

| Año | % renovable mínimo |
|---|---|
| 2017 | 8 % |
| 2019 | 12 % |
| 2021 | 16 % |
| 2023 | 18 % |
| 2025 | 20 % |
| 2026+ | 20 % (vigente) |

> Fuente: Ley 27.191 Art. 8 (Boletín Oficial 21/10/2015) y Res. 281/2017 reglamentaria.

### 4.2. Cómo se cumple

Tres vías, en orden de relevancia para un GU privado:

1. **Contrato MATER** con un generador renovable habilitado (mecanismo principal).
2. **Autogeneración renovable** propia (parque solar en techo, etc., minoritario).
3. **Compra a CAMMESA en proyectos públicos RenovAr** (cada vez menos disponible).

### 4.3. Penalidad por incumplimiento

La ley es taxativa: si al **31 de diciembre** del año el GU no cumple el cupo, paga el faltante a un precio de referencia establecido por la propia ley.

> **Precio de referencia oficial**: Costo Variable de Producción (CVP) de la generación cuyo combustible sea **gasoil de origen importado**, calculado como **promedio ponderado de los 12 meses del año calendario anterior**.
>
> Fuente: Ley 27.191 Art. 11.

**Implicancia comercial fuerte.** Ese precio es típicamente alto (gasoil importado es la opción de respaldo más cara del sistema). En 2024-2025 rondaba los **80-150 USD/MWh** equivalentes según el tipo de cambio aplicado. Para un GUMA que consume 100.000 MWh/año con 5% de brecha, la multa anual puede ser **USD 400.000 – 750.000**. Esa es la cifra con la que vendés EnergyOS: un mes de subscripción de tu producto cuesta < 0,1% de la multa que evita ver a tiempo.

### 4.4. Hueco de 2020 en EnergyOS — hallazgo

La tabla `compliance_27191_obligacion` en Railway arranca en **2021** con 16%. **No tiene 2017-2020 cargados**. Si tu sistema tiene histórico desde 2020-02 (según RUNBOOK), los meses de 2020 no calculan obligación → muestran "sin_brecha" falsamente. **Hay que cargar 2017→2020 en esa tabla** (8% para 2017-2018, 12% para 2019-2020) o esconder el módulo para esos años.

---

## 5. MATER — el mercado de contratos renovables

### 5.1. Qué es

El **MATER** (Mercado a Término de Energías Renovables) es un mercado de contratos bilaterales privados entre generadores renovables y grandes usuarios, creado por la **Resolución 281/2017** del entonces Ministerio de Energía y Minería.

A diferencia del régimen RenovAr (donde CAMMESA era contraparte estatal), en MATER **el Estado no es comprador**: el generador y el usuario industrial firman directamente. CAMMESA solo administra:
- La asignación de **prioridad de despacho** (la red tiene capacidad limitada y no entran todos los proyectos).
- La **liquidación física** de la energía contratada vs. la entregada.

### 5.2. Cómo se ve en el dato CAMMESA

Los contratos vigentes mes a mes aparecen en el archivo `anexo_mat_renovable` (capa L1 → `raw_anexo_mat_renovable`), con columnas:
- `col_001` → generador NEMO (8 chars)
- `col_002` → conjunto generador
- `col_003` → demandante NEMO (8 chars)
- `col_004/005` → comercializador (opcional, solo cuando `col_count = 6`)
- energia_contrato_mwh y importe_contrato_pesos en las últimas dos columnas.

EnergyOS agrega esto en `vw_renovable_contratado_mensual` por `(demandante_nemo, anio, mes)`.

### 5.3. Estado del mercado (2024-2025, datos públicos)

- Aproximadamente **2.400 MW** habilitados comercialmente bajo MATER, según relevamientos sectoriales públicos.
- Más de **4.000 MW** adicionales en desarrollo / cola de prioridad.
- Más de **3.700 contratos** vigentes (un GU puede tener varios contratos con varios generadores).

> **Implicancia EnergyOS.** Hay un módulo "MATER Pricing Index" en `kpi_catalog.md` (plan `full`) que apuntaría a usar tu base agregada para construir un benchmark de precios MATER —algo que hoy NO existe público y que las consultoras venden caro—. Es una posible **monetización premium** una vez validada la base.

---

## 6. Bandas horarias del MEM

CAMMESA define tres bandas para el despacho y la facturación. Esto es importante porque casi todos los archivos `anexo_guma` y `anexo_gume` tienen apertura **Pico/Valle/Resto** y de ahí salen los KPIs del módulo *Perfil de Carga*.

### 6.1. Definición oficial CAMMESA (Procedimientos Técnicos)

| Banda | Horas | Duración |
|---|---|---|
| **Pico** | 18:00 – 23:00 | 5 h |
| **Resto** | 05:00 – 18:00 y 23:00 – 24:00 | 14 h |
| **Valle** | 00:00 – 05:00 | 5 h |

(Sin distinción de día hábil/feriado en MEM mayorista, a diferencia de las tarifas residenciales ENRE que sí distinguen.)

### 6.2. Hallazgo: descalce en la UI de EnergyOS

En `ModuloPerfilCarga.tsx` los `StatCard` muestran:
- *"% Pico promedio — Horas 18-23h"* ✅ correcto
- *"% Valle promedio — Horas 0-6h"* ⚠️ **debería ser 0-5h**

El **dato numérico es correcto** (viene preagregado por CAMMESA en los archivos AGUM, no se recalcula con horarios). Solo el **label del frontend está mal**: dice "0-6h" cuando la banda Valle CAMMESA es de 5 horas (0-5). Es una corrección de literal en `ModuloPerfilCarga.tsx`.

---

## 7. Archivos CAMMESA → KPIs EnergyOS — el mapa

Esta es la traducción de "qué archivo bruto alimenta qué pantalla". Es la tabla más importante de este doc.

| Archivo CAMMESA | Anexo DTE | Tabla L1 | Vista L3 | Módulo UI consumidor |
|---|---|---|---|---|
| `AGUMYYMM.txt` / `anexo_guma.html` | A4 | `raw_agum`, `raw_anexo_guma` | `vw_consumo_gu_mensual`, `vw_exposicion_spot_mensual` | Home, Exposición Spot, Perfil de Carga, Historia |
| `anexo_gume.html` / `gume_gupa.html` | A4 | `raw_anexo_gume` | `vw_consumo_gu_mensual` | mismas (para GUME) |
| `GUDIYYMM.txt` / `DEXCYYMM.txt` | A11/A13 | `raw_gudi`, `raw_dexc` | `vw_consumo_gu_mensual` (GUDI) | mismas (para GUDI) |
| `anexo_mat_renovable.html` | A6 (MATER) | `raw_anexo_mat_renovable` | `vw_renovable_contratado_mensual`, `vw_compliance_27191_mensual` | Cumplimiento 27.191 |
| `dteYYMM.txt` | DTE resumen | `raw_dte` | `dte_resumen_agente` (L2) | Exposición Spot ($/MWh), futura Factura Sombra |
| `ATRAYYMM.txt` | A2 | `raw_atra` | `transporte_*` (L2/L3 pendiente) | Costos / Transporte (futuro) |
| Variables Relevantes (memnet/operaciones) | n/a (web pública) | tablas `cammesa_*` | `gu-mercado-contexto` directo | Mercado |
| `AMATYYMM.txt` | A6 consolidado | `raw_amat` | `mater_contrato_mensual` (L2) | (overlap con MATER) |

> **Trazabilidad.** Cada fila L2/L3 lleva `parser_version`. Si CAMMESA cambia el formato, se incrementa la versión y se reprocesa el rango afectado. Esto es un **diferencial técnico** real para vender contra Excel manuales.

---

## 8. Los 7 módulos del producto, vistos desde el rubro

Cómo lee un Jefe de Energía cada módulo:

| Módulo | La pregunta de negocio que responde | Decisión que dispara |
|---|---|---|
| **Home / Informe de Inicio** | "¿Cómo me fue este mes?" | Foco operativo del mes |
| **Exposición Spot** | "¿Cuánto plata pagué de spot y cuánto contraté?" | Renegociar contratos MATER, ajustar volumen |
| **Cumplimiento 27.191** | "¿Voy a tener multa este 31/12?" | Comprar más MATER antes del cierre anual |
| **Perfil de Carga** | "¿Estoy consumiendo en horas caras?" | Mover producción a horas valle, reducir factura |
| **Historia Energética** | "¿Cómo evolucionó mi demanda?" | Proyectar próxima compra de contrato, justificar inversiones |
| **Mercado** | "¿Qué pasa en el sistema este mes?" | Contexto para reuniones con management |
| **Ajustes** | (no es módulo de negocio) | n/a |

**Mensaje de venta resumido**: las 3 primeras pantallas justifican el precio del producto en cualquier reunión con un Jefe de Energía. Las otras tres profundizan.

---

## 9. Hallazgos preliminares de auditoría (Fase A)

Estos son los puntos que ya detecté leyendo el código contra la normativa. **El detalle formal va en `docs/auditoria_calculos.md` (próximo doc).** Acá los listo para que vos los conozcas ya.

### 9.1. ⚠️ Multa Ley 27.191 — método de estimación divergente

El cálculo actual de `multa_estimada_pesos` en `vw_compliance_27191_mensual` usa:
1. Override en tabla `compliance_27191_obligacion.multa_pesos_mwh` (vacío hoy).
2. Si no, **precio implícito MATER del propio cliente últimos 12 meses**.
3. Si no, **precio implícito MATER promedio del universo del año**.
4. Si no, 0.

**Lo que dice la Ley 27.191 Art. 11**: el faltante se paga al **CVP de gasoil importado promedio 12 meses año anterior**. Ese precio es **estructuralmente más alto** que el precio MATER (gasoil importado es respaldo caro; MATER es renovable contratado, de los más baratos).

**Consecuencia.** El sistema **subestima sistemáticamente la multa real**. Para venta esto importa: si le decís a un cliente "tu multa estimada es $X" y el número real es 2-3x, perdés credibilidad cuando lo audita un consultor.

**Acción recomendada**:
- Cargar mensualmente el CVP gasoil importado en una tabla `cvp_gasoil_importado_mensual` (CAMMESA publica este dato).
- Cambiar el orden de fallback: CVP gasoil importado → cliente_12m → universo_anual.
- Mientras tanto, en la UI agregar disclaimer claro: *"Estimación conservadora basada en precio MATER. La multa oficial usa CVP de gasoil importado y suele ser superior."*

### 9.2. ⚠️ Tabla obligación 27.191 incompleta (años 2017-2020)

`compliance_27191_obligacion` arranca en 2021. Falta cargar 2017 (8%), 2018 (8%), 2019 (12%), 2020 (12%) si querés mostrar histórico de cumplimiento desde 2020.

### 9.3. ⚠️ Label "Valle 0-6h" en `ModuloPerfilCarga.tsx`

Debería ser "0-5h" según definición CAMMESA. Solo es cosmética, el dato numérico es correcto (viene preagregado por CAMMESA).

### 9.4. ⚠️ Cálculo `cumple_mes` puede engañar

`cumple_mes = renovable_contratado_mwh >= obligacion_mwh` se evalúa **mes a mes**. La Ley 27.191 obliga a cumplimiento **anual** (al 31/dic). Un cliente puede tener 6 meses "no cumple" y aún así cerrar el año cumpliendo (ej: si tiene picos estacionales de generación renovable). El indicador legalmente válido es `cumple_ytd`.

**Riesgo**: si en la UI mostrás muchos meses en rojo y al final el cliente cumplió, el cliente desconfía del sistema. Sugerencia: cambiar `cumple_mes` a un indicador *informativo* ("ritmo del mes") en lugar de booleano de cumplimiento.

### 9.5. ⚠️ GUME legacy (`col_count = 22, 31`) — apertura PVR sospechosa

En el SQL de `vw_consumo_gu_mensual`, las variantes `gume_22` y `gume_31` mapean los **mismos** valores `col_004/005/006` tanto a `demanda_real_*_mwh` como a `compra_spot_*_mwh`. Esto duplica datos o asume que el GUME compró todo en spot. Hay que validar contra el manual histórico de CAMMESA si el layout 22/31 realmente representa eso o es un parser placeholder.

### 9.6. ⚠️ `compra_spot_pesos = 0` para GUDI/DEXC

El branch `gudi_dexc_19` setea `0::numeric as compra_spot_pesos`. Implica que la UI muestra "Costo spot $0/MWh" para todos los GUDI. **El módulo Exposición Spot es virtualmente inutilizable para clientes GUDI** hasta que se mapee la columna correcta de DEXC.

### 9.7. ✅ Cronograma 27.191 (16/18/20%) cargado correcto

Ya verificado contra Ley 27.191 Art. 8.

### 9.8. ✅ Threshold "300 kW" no es chequeado por el sistema (correcto)

EnergyOS no filtra agentes por demanda mínima — toma todos los que CAMMESA publica. Esto es correcto: si CAMMESA los publica como GUMA/GUME/GUDI, ya están sobre el umbral por definición regulatoria.

---

## 10. Glosario rápido

| Sigla | Significado | Para qué te importa |
|---|---|---|
| **MEM** | Mercado Eléctrico Mayorista | Es donde tu cliente compra/vende energía. |
| **SADI** | Sistema Argentino de Interconexión | La red física nacional. |
| **CAMMESA** | Compañía Administradora del MEM | Tu fuente de datos crudos. |
| **DTE** | Documento de Transacciones Económicas | "Factura sombra" mensual de cada agente. |
| **GUMA** | Gran Usuario Mayor (≥1 MW) | Cliente target principal. |
| **GUME** | Gran Usuario Menor (30 kW–2 MW) | Cliente target secundario. |
| **GUDI** | Gran Usuario de la Distribuidora (≥300 kW) | Cliente posible vía distribuidora. |
| **MATER** | Mercado a Término de Renovables | Cómo se cubre la Ley 27.191. |
| **PPA** | Power Purchase Agreement | Contrato bilateral típico, sinónimo de "contrato MATER". |
| **NEMO** | Nombre EMpresa Operativa (8 chars) | Identificador único de cada agente CAMMESA. |
| **CVP** | Costo Variable de Producción | Costo de combustible + O&M de cada generador, base del precio spot y de la multa 27.191. |
| **ENRE** | Ente Nacional Regulador de la Electricidad | Sanciona; no produce dato. |
| **Pico/Valle/Resto** | Bandas horarias MEM | Apertura PVR en archivos AGUM/anexo_guma. |
| **YTD** | Year-to-date | Acumulado del año en curso, indicador clave de 27.191. |
| **Sub-contrato / Sobre-contrato** | Déficit/exceso vs. contrato MATER | KPI principal del módulo Exposición Spot. |

---

## 11. Fuentes

### Normativa primaria
- **Ley 27.191** (energías renovables, GU obligados): [InfoLEG / texto completo](https://servicios.infoleg.gob.ar/infolegInternet/anexos/250000-254999/253626/norma.htm)
- **Resolución 281/2017** (MATER, reglamentaria 27.191): [InfoLEG / texto completo](https://servicios.infoleg.gob.ar/infolegInternet/anexos/275000-279999/278429/norma.htm)
- **Resolución 423/98** (régimen GUMA/GUME): [InfoLEG](https://servicios.infoleg.gob.ar/infolegInternet/anexos/50000-54999/52739/norma.htm)
- **Resolución SE 1281/06** (régimen GUDI / Energía Plus): InfoLEG

### Institucional
- **Portal CAMMESA — Grandes Usuarios**: [portalweb.cammesa.com](https://portalweb.cammesa.com/pages/institucional/agentes/grandesUsuarios.aspx)
- **CAMMESA — MATER**: [cammesaweb.cammesa.com/mater](https://cammesaweb.cammesa.com/mater/)
- **CAMMESA — Informes y estadísticas**: [cammesaweb.cammesa.com/informes-y-estadisticas](https://cammesaweb.cammesa.com/informes-y-estadisticas/)
- **Secretaría de Energía — Mercado Spot**: [energia.gob.ar](https://www.energia.gob.ar/contenidos/verpagina.php?idpagina=3583)

### Análisis sectorial (contexto / cifras de mercado)
- Energía Estratégica — relevamientos MATER 2024-2025
- Mejor Energía — pico contratos MATER 2024
- Climate Tracker LatAm — análisis Ley 27.191 (estado regulatorio)

### Documentación interna del repo
- [`docs/sistema_overview.md`](sistema_overview.md) — visión de producto.
- [`docs/cammesa_dictionary.md`](cammesa_dictionary.md) — diccionario de las 42 tablas `raw_*`.
- [`docs/cammesa_target_model.md`](cammesa_target_model.md) — modelo de datos L1→L2→L3.
- [`docs/kpi_catalog.md`](kpi_catalog.md) — catálogo de KPIs por plan.

---

## 12. Cómo usar este doc

- **Vos (CEO)**: leelo entero una vez. Después tenelo abierto cuando preparás reuniones con clientes — la sección 4 (Ley 27.191) es el corazón del pitch.
- **Onboarding nuevo en EnergyOS**: leerlo + leer `sistema_overview.md` cubre el 80% del contexto.
- **Consultor energético externo**: leer secciones 2-6 + 9 (hallazgos). De ahí debería poder confirmar/contradecir cada hallazgo en una hora.
- **Próximo paso (Fase A continúa)**: `docs/auditoria_calculos.md` con el detalle formula-por-formula y `docs/checklist_validacion.md` para llevar a la reunión con consultor.

---

*v1 — 2026-05-06. Mantener este doc actualizado cuando: (a) cambie la normativa (poco frecuente), (b) se cargue un nuevo año en `compliance_27191_obligacion`, (c) se descubra un nuevo hallazgo de auditoría que toque el dominio.*
