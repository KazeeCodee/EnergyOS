# T0.1 — Diccionario de datos `raw_*` CAMMESA

> **Propósito.** Mapear cada `col_NNN` de las ~42 tablas `raw_*` (volcado posicional/HTML del DTE de CAMMESA) a su nombre de negocio, tipo y unidad. Insumo obligatorio para los parsers de Fase 2.
>
> **Periodo cubierto por los SQL locales:** `2021-01 → 2026-03` (carpeta `C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03`).
>
> **Estado:** primera versión consolidada por muestreo automatizado de filas representativas (1 fila por `(section_index, col_count)` distintas) cruzado con la nomenclatura oficial del DTE de CAMMESA. Las celdas marcadas **`?`** requieren validación contra el manual del DTE antes de implementar el parser correspondiente.

---

## 1. Convenciones generales

### 1.1 Estructura común a todas las tablas `raw_*`

Todas las tablas `raw_*` en Supabase comparten el mismo "envelope":

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `bigint` | PK secuencial dentro del SQL local. **No es estable entre meses** (cada SQL reinicia desde 1 antes de 2026-01). Para deduplicar usar `(source_zip, source_file, source_row)`. |
| `anio` | `int` | Año del periodo de facturación CAMMESA (no el de emisión). |
| `mes` | `int` | Mes del periodo de facturación (1-12). |
| `source_zip` | `text` | Nombre del ZIP origen (`DTEYYMM.zip`). |
| `source_file` | `text` | Archivo dentro del ZIP (`AGUMYYMM.txt`, `anexo_guma.html`, …). |
| `source_row` | `int` | Número de fila del archivo origen. |
| `section_index` | `int` | Índice de sección dentro del archivo (`NULL` para TXT, `1` o `2` para HTML según versión). |
| `col_count` | `int` | Cantidad de celdas no nulas en la fila. **Es el discriminador principal** para distinguir filas de encabezado, unidad, datos y totales. |
| `raw_text` | `text` | Texto crudo de la línea original (útil para regex de salvataje). |
| `col_001 … col_NNN` | `text` | Celdas posicionales. La cantidad `NNN` es fija por tabla (ver inventario). |

### 1.2 Dos familias de archivos

| Familia | Origen | Encabezado | Estrategia de parser |
|---|---|---|---|
| **TXT** (DTE-base) | `*.txt` dentro del ZIP `DTE*.zip` | Posicional, multi-sección. Cada anexo arranca con `"ANEXO N - …"`, sub-secciones `"A4.1 …"`, después 2-4 filas de "label" + 1 de "unit" + filas de datos + filas `TOTALES >>>>>>>`. | Detectar **section header** por regex sobre `col_001`/`raw_text` y disparar parser específico para las filas siguientes con un `col_count` esperado. |
| **HTML** (anexo_*.html) | `anexo_*.html` o `*.MDB#TABLA` | Header explícito en la primera fila (toda la nomenclatura de cada columna en `col_001 col_002 …`). | Parser directo: el header de la fila 1 (o fila 1 del `section_index=2`) define el mapeo, las filas siguientes son datos. |

### 1.3 Tipado y normalización

Todas las celdas vienen como `text`. Al pasar a la capa L2 hay que castear con las funciones helper de **T2.0**:

- **Numérico ES (decimal `,`, miles `.` o ` `).** Ej.: `'1 760,383'` → `1760.383`. Existe también `'1.234,56'` y `'1234.56'` (formato US en archivos viejos). Usar `public.parse_es_number(text) returns numeric`.
- **Fecha ES.** Ej.: `'13-12-2025'`, `'08-02-24'` → `date`. Usar `public.parse_es_date(text)`.
- **Nemo CAMMESA.** Siempre los **primeros 8 caracteres** de `col_001`. Cuando hay dos nemos en la misma celda (común en TXT, ej.: `'YPF-13MZ DISTROCT'`) los primeros 8 son el agente y los siguientes 8 (después de un espacio) son el distribuidor / contraparte.
- **Nulls vs ceros.** En TXT las celdas vacías van como `NULL`. En HTML viejas vienen como `'0'`. Tratar `'0'` como cero válido y `NULL` como dato faltante.

### 1.4 Joins canónicos (clave de unión)

```
agente_nemo  =  left(col_001, 8)        -- TXT (cuando col_001 trae 1 nemo)
agente_nemo  =  col_001                  -- HTML (cuando col_001 ya viene limpio)
distribuidor =  substring(col_001, 10, 8) -- TXT cuando col_001 = '<NEMO> <DIST>'
periodo      =  (anio, mes)
```

Catálogo: `cammesa_agentes_mem.nemo` une `agente_nemo`. `cammesa_padron_empresas` da razón social y CUIT (cuando existe).

### 1.5 Patrones de filas a descartar (todas las tablas)

| Patrón | Detección | Acción |
|---|---|---|
| Encabezado de página | `col_001` empieza con `'C.A.M.M.E.S.A. - DOCUMENTO DE TRANSACCIONES ECONOMICAS MEM'` | descartar |
| Título de anexo | `col_001` matchea `^ANEXO \d+\s*-\s*` o `^A\d+(\.\d+){1,3}\s` | usar como **marcador de sección** y descartar |
| Línea de unidades | todas las celdas `∈ {'MWh','PESOS','MW','$','$/MWh','$/MW','%','--'}` | descartar (validar layout) |
| Subtotal / total | `col_001 ∈ {'TOTAL','TOTALES','TOTAL  :','TOTALES  >>>>>>>'}` | usar para validación cruzada, no insertar como dato |
| Separadores | celdas con `'-----'` o solo `':'` | descartar |
| Página vacía / hoja | `col_count <= 2` y `col_001` matchea `'^HOJA'` o `'PEREZ, '` | descartar |

---

## 2. Inventario de tablas `raw_*`

42 tablas. Ordenadas por **prioridad de parser** (alineada con Fase 2 del roadmap). La columna **Cols** indica el máximo `col_NNN` que debe existir en L1 según el DDL local; algunos HTML tienen menos columnas activas por fila y se discriminan con `col_count`.

| # | Tabla | Origen | Familia | Cols | Anexo CAMMESA | Prioridad parser |
|---|---|---|---|---|---|---|
| 1 | `raw_amat` | `AMATYYMM.txt` | TXT | 16 | A6 — Mercado A Término (consolidado) | 🔴 T2.1 |
| 2 | `raw_agum` | `AGUMYYMM.txt` | TXT | 24 | A4 — Grandes Usuarios Mayores (GUMA) | 🔴 T2.2 |
| 3 | `raw_anexo_guma` | `anexo_guma.html` / `MDB#ANEXO_GUMA` | HTML | 52 | A4 detalle (versión espejo en HTML) | 🔴 T2.2 |
| 4 | `raw_atra` | `ATRAYYMM.txt` | TXT | 10 | A2 — Transporte | 🔴 T2.3 |
| 5 | `raw_dexc` | `DEXCYYMM.txt` | TXT | 19 | A11 — Demanda Excedente (Res.SE 1281/06) | 🔴 T2.4 |
| 6 | `raw_dte` | `dteYYMM.txt` | TXT | 13 | DTE — resumen económico mensual | 🔴 T2.5 |
| 7 | `raw_rscj` | `RSCJYYMM.txt` | TXT | 15 | A13 — Cuenta Corriente (Res.Conjunta 1/2017) | 🔴 T2.6 |
| 8 | `raw_aama` | `AAMAYYMM.txt` | TXT | 16 | A8 — Créditos y Débitos meses anteriores | 🟡 T2.7 |
| 9 | `raw_anexo_gume` | `anexo_gume.html`, `gume_gupa.html` | HTML | 34 | A4 — GUME / GUPA | 🟡 T2.8 |
| 10 | `raw_gudi` | `GUDIYYMM.txt` | TXT | 16 | A13 — GUDI (Res. 976/2023) | 🟡 T2.9 |
| 11 | `raw_adis` | `ADISYYMM.txt` | TXT | 17 | A3 — Distribuidores | 🟡 T2.9 |
| 12 | `raw_agen` | `AGENYYMM.txt` | TXT | 25 | A1 — Generadores | 🟡 T2.10 |
| 13 | `raw_game` | `GAMEYYMM.txt` | TXT | 13 | A10 — Reembolso de Gastos e Inversiones de CAMMESA | 🟡 T2.10 |
| 14 | `raw_anexo_gen111` | `anexo_gen111.html` | HTML | 18 | Cuadro 11.1 — Energía térmica por unidad | 🟡 T2.10 |
| 15 | `raw_anexo_gen112` | `anexo_gen112.html` | HTML | 14 | Cuadro 11.2 — Potencia disponible térmica | 🟡 T2.10 |
| 16 | `raw_anexo_gen113` | `anexo_gen113.html` | HTML | 11 | Cuadro 11.3 — Energía hidráulica | 🟡 T2.10 |
| 17 | `raw_anexo_gen114` | `anexo_gen114.html` | HTML | 11 | Cuadro 11.4 — Potencia hidráulica | 🟡 T2.10 |
| 18 | `raw_anexo_gen115` | `anexo_gen115.html` | HTML | 19 | Cuadro 11.5 — Térmica con DIGO | 🟢 T2.10 |
| 19 | `raw_anexo_gen116` | `anexo_gen116.html` | HTML | 6 | Cuadro 11.6 — Potencia DIGO | 🟢 T2.10 |
| 20 | `raw_anexo_gen117` | `anexo_gen117.html` | HTML | 12 | Cuadro 11.7 — Adicionales | 🟢 T2.10 |
| 21 | `raw_anexo_gen118` | `anexo_gen118.html` | HTML | 10 | Cuadro 11.8 — ? | 🟢 T2.10 |
| 22 | `raw_anexo_gen119` | `anexo_gen119.html` | HTML | 8 | Cuadro 11.9 — ? | 🟢 T2.10 |
| 23 | `raw_anexo_gen12` | `anexo_gen12.html` | HTML | 18 | Cuadro 12 — Servicios Auxiliares de potencia | 🟢 T2.10 |
| 24 | `raw_anexo_gen13` | `anexo_gen13.html` | HTML | 16 | Cuadro 13 — Reservas y Pot. Térm. 4hs | 🟢 T2.10 |
| 25 | `raw_anexo_gen_disp_mejora` | `anexo_gen_disp_mejora.html` | HTML | 12 | Disponibilidad Mejorada (Res. SE 1085/17) | 🟡 T2.11 |
| 26 | `raw_anexo_generacion_forzada` | `anexo_generacion_forzada.html` | HTML | 6 | Generación forzada Res. SE 220 | 🟡 T2.11 |
| 27 | `raw_anexo_gen_294pot` | `anexo_gen_294pot.html` | HTML | 10 | Res. SE 294 — potencia | 🟢 T2.11 |
| 28 | `raw_anexo_gen_294ene` | `anexo_gen_294ene.html` | HTML | 11 | Res. SE 294 — energía | 🟢 T2.11 |
| 29 | `raw_anexo_gennuc` | `anexo_gennuc.html` | HTML | 6 | Generación nuclear | 🟢 T2.11 |
| 30 | `raw_anexo_genmovil` | `anexo_genmovil.html` | HTML | 15 | Generación móvil (containers) | 🟢 T2.11 |
| 31 | `raw_aexp` | `AEXPYYMM.txt` | TXT | 19 | A9 — Importación / Exportación | 🟢 T2.12 |
| 32 | `raw_auto` | `AUTOYYMM.txt` | TXT | 19 | A5 — Autogeneradores y Cogeneradores | 🟢 T2.13 |
| 33 | `raw_anexo_mat` | `anexo_mat.html` | HTML | 9 | A6 detalle (versión HTML del A6.1.1) | 🟡 T2.14 |
| 34 | `raw_anexo_mat_plus` | `anexo_mat_plus.html` | HTML | 8 | A6 — contratos PLUS | 🟡 T2.14 |
| 35 | `raw_anexo_mat_renovable` | `anexo_mat_renovable.html` | HTML | 6 | A6.1.3.1 — RENMER (Mater Renovable) | 🟡 T2.14 |
| 36 | `raw_anexo_mat_cvt` | `anexo_mat_cvt.html` | HTML | 8 | A6 — Cargo Variable de Transporte | 🟡 T2.14 |
| 37 | `raw_anexo_mat_cvt_plus` | `anexo_mat_cvt_plus.html` | HTML | 12 | A6 — CVT contratos PLUS | 🟢 T2.14 |
| 38 | `raw_anexo_mat_compromiso` | `anexo_mat_compromiso.html` | HTML | 26 | Compromisos de generador (Res. ME 1085/17) | 🟢 T2.14 |
| 39 | `raw_anexo_mat_cont_delivery` | `anexo_mat_cont_delivery.html` | HTML | 13 | A6 — Contratos Delivery (entrega física) | 🟢 T2.14 |
| 40 | `raw_anexo_mat_cequip724` | `anexo_mat_cequip724.html` | HTML | 6 | Capacidad Equivalente Res. SE 724 | 🟢 T2.14 |
| 41 | `raw_adco` | `ADCOYYMM.txt` | TXT | 8 | A12 — Res. MEyM 281-E/2017 (Comercializadores) | 🟢 T2.15 |
| 42 | `raw_agfq` | `AGFQYYMM.txt` | TXT | 12 | A7 — Generación Forzada / Falla Quasi-firme | 🟢 T2.15 |

---

## 3. Diccionario detallado por tabla

### 🔴 raw_amat — Anexo 6 — Mercado A Término (`AMATYYMM.txt`, 16 cols)

**Estructura del archivo.** El TXT del A6 contiene varias sub-secciones, cada una con su propio layout. Las sub-secciones se identifican por la última fila tipo `'A6.x.y …'` vista antes de las filas de datos.

#### Sub-secciones detectadas

| ID | Header (regex sobre `col_001` o `raw_text`) | `col_count` típico | Naturaleza |
|---|---|---|---|
| **A6.1.1** | `^ANEXO 6 - MERCADO A TERMINO` (sin sub-código posterior) | 12 | Contratos MAT genéricos (no renovables) |
| **A6.1.2** | (sin código explícito; sigue al título principal) | 14 | Contratos MAT — desglose por cargos |
| **A6.1.3.1** | `^A6\.1\.3\.1 CONTRATOS DE ABASTECIMIENTO DE ENERGIA CON GENERACION RENOVABLE` | 4 + 6 | Contratos MATER (Renovables) — totales y detalle |
| **A6.1.4** | `^A6\.1\.4` | 9 | MAT — contratos delivery con cargos variables |
| **A6.1.5** | `^A6\.1\.5` | 16 | MAT — contratos con compromiso de cap. y combustible |

#### A6.1.1 / A6.1.2 — Contratos de abastecimiento (12 columnas de datos)

Aplica cuando `col_count == 12` después de un header `'Agente Conjunto Agente   Comercializador  Horas Valle ...'`.

| Pos | Columna | Tipo | Unidad | Descripción de negocio |
|---|---|---|---|---|
| 1 | `agente_generador` | text | nemo | Nemo del generador vendedor |
| 2 | `conjunto_generador` | text | nemo | Conjunto / unidad del generador |
| 3 | `agente_demandante` | text | nemo | Nemo del comprador (cliente) |
| 4 | `comercializador` | text | nemo | Comercializador (puede estar vacío) |
| 5 | `energia_contratada_valle_mwh` | numeric | MWh | Energía contratada en horas valle |
| 6 | `energia_contratada_resto_mwh` | numeric | MWh | Energía contratada en resto |
| 7 | `energia_contratada_pico_mwh` | numeric | MWh | Energía contratada en pico |
| 8 | `energia_abastecida_valle_mwh` | numeric | MWh | Energía efectivamente entregada en valle |
| 9 | `energia_abastecida_resto_mwh` | numeric | MWh | Energía entregada en resto |
| 10 | `energia_abastecida_pico_mwh` | numeric | MWh | Energía entregada en pico |
| 11 | `energia_abastecida_total_mwh` | numeric | MWh | Total entregado |
| 12 | `importe_contrato_pesos` | numeric | $ | Importe del contrato del mes |

**Ejemplo real (`DTE2602.zip`, `AMAT2602.txt`, fila 23):**
```
CAPEXSAG  ACAJMT  FRIMESOY  AMGCOMEO  263,89  658,11  234,87  263,89  658,11  234,87  1156,87  73 349 076
```

#### A6.1.3.1 — Contratos MATER renovables (6 cols)

| Pos | Columna | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_generador` | text | nemo | Generador renovable |
| 2 | `conjunto_generador` | text | nemo | Parque/Conjunto |
| 3 | `agente_demandante` | text | nemo | Demandante (cliente) |
| 4 | `comercializador` | text | nemo | Comercializador (opcional) |
| 5 | `energia_contrato_mwh` | numeric | MWh | Energía contrato (sin desglose pico/valle) |
| 6 | `importe_contrato_pesos` | numeric | $ | Importe |

#### A6.1.5 — Contratos con compromiso de capacidad (16 cols)

| Pos | Columna | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_generador` | text | nemo | |
| 2 | `conjunto_generador` | text | nemo | |
| 3 | `energia_valle_mwh` | numeric | MWh | |
| 4 | `energia_resto_mwh` | numeric | MWh | |
| 5 | `energia_pico_mwh` | numeric | MWh | |
| 6 | `energia_total_mwh` | numeric | MWh | |
| 7 | `cargo_variable_pesos` | numeric | $ | |
| 8 | `cargo_combustible_pesos` | numeric | $ | |
| 9 | `cargo_gestion_pesos` | numeric | $ | |
| 10 | `cargo_pot_fijo_pesos` | numeric | $ | |
| 11 | `cargo_mantenim_pesos` | numeric | $ | |
| 12 | `cargo_pot_mem_pesos` | numeric | $ | |
| 13 | `cargo_gerenciamiento_pesos` | numeric | $ | |
| 14 | `cargo_penalizacion_pesos` | numeric | $ | |
| 15 | `cargo_fondos_pesos` | numeric | $ | |
| 16 | `cargo_adicional_pesos` | numeric | $ | |

> **Nota.** Los headers de sub-anexo del archivo TXT usan **3 filas** (`Agente Conjunto Agente | Horas Valle Hs.Diurnas Horas Pico | MWh MWh MWh MWh ...`). El parser debe consumir esas 3 filas como header y validar que `col_count` coincida con el layout esperado.

---

### 🔴 raw_anexo_guma — `anexo_guma.html` / `MDB#ANEXO_GUMA` (52 cols)

**Estructura.** Header explícito en `section_index=2 row 1` (formato nuevo, 31 cols) o `section_index=1 row 1` (formato legacy MDB, 51-52 cols con nombres tipo `AGENTE DISTRIBU DEM_REAL …`). Ambos contienen la misma información económica con distinta nomenclatura.

#### Layout NUEVO (formato HTML 2026+, 31 cols de datos)

| Pos | Columna L2 | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_nemo` | text | | Nemo del GUMA |
| 2 | `distribuidor_nemo` | text | | Distribuidora a la que está conectado |
| 3 | `demanda_real_total_mwh` | numeric | MWh | Demanda real medida en el mes |
| 4 | `demanda_real_pico_mwh` | numeric | MWh | Demanda real horas pico |
| 5 | `demanda_real_valle_mwh` | numeric | MWh | Demanda real horas valle |
| 6 | `demanda_real_resto_mwh` | numeric | MWh | Demanda real resto |
| 7 | `demanda_contratada_total_mwh` | numeric | MWh | Demanda contratada (MAT) |
| 8 | `demanda_contratada_pico_mwh` | numeric | MWh | Contratada pico |
| 9 | `demanda_contratada_valle_mwh` | numeric | MWh | Contratada valle |
| 10 | `demanda_contratada_resto_mwh` | numeric | MWh | Contratada resto |
| 11 | `compra_spot_pico_mwh` | numeric | MWh | Compra spot pico |
| 12 | `compra_spot_valle_mwh` | numeric | MWh | Compra spot valle |
| 13 | `compra_spot_resto_mwh` | numeric | MWh | Compra spot resto |
| 14 | `compra_spot_pesos` | numeric | $ | Importe de compra spot |
| 15 | `cargo_energia_adicional_pesos` | numeric | $ | Cargo por energía adicional |
| 16 | `cargo_servicios_pesos` | numeric | $ | Cargo por servicios |
| 17 | `recupero_costos_operat_pesos` | numeric | $ | Recupero de costos operativos |
| 18 | `cargo_serv_confiabilidad_pesos` | numeric | $ | Cargo servicio de confiabilidad |
| 19 | `cargo_transp_at_pesos` | numeric | $ | Cargo transporte AT (alta tensión) |
| 20 | `cargo_transp_dt_pesos` | numeric | $ | Cargo transporte DT (distribución troncal) |
| 21 | `cargo_ampliac_at_pesos` | numeric | $ | Cargo ampliaciones AT |
| 22 | `cargo_ampliac_dt_pesos` | numeric | $ | Cargo ampliaciones DT |
| 23 | `potencia_maxima_mw` | numeric | MW | Potencia máxima medida |
| 24 | `potencia_declarada_mw` | numeric | MW | Potencia declarada por el agente |
| 25 | `potencia_phmd_mw` | numeric | MW | Potencia PHMD (Punta Histórica del Mes Doce) |
| 26 | `compra_ppad_mw` | numeric | MW | Compra de Potencia para Asegurar Demanda |
| 27 | `compra_potencia_ppad_mwhrp` | numeric | MWhrp | Compra PPAD en MWhrp |
| 28 | `potencia_contratada_mwhrp` | numeric | MWhrp | Potencia contratada (MAT) |
| 29 | `potencia_mater_mw` | numeric | MW | Potencia MATER |
| 30 | `potencia_pesos` | numeric | $ | Importe asociado a cargos por potencia |
| 31 | `cargo_comercializ_cc_pesos` | numeric | $ | Cargo de comercialización CC |

**Ejemplo real (`DTE2602.zip`, `anexo_guma.html`, row 97):**
```
CEMAOL3Z 3912,179 738,572 788,91 2384,697 0 0 0 0 738,572 788,91 2384,697 242807875 12772918 1707040 5994358 5836658 25963231 20341974 159892 17726 35,804 0 21,698 21,698 3081,116 0 0 76404914 4556955
```
(GUMA `CEMAOL3Z` con demanda 3.912 MWh totalmente comprada en el spot, sin contratos MAT, $242.8 M de compra spot, $25.9 M cargo transporte AT.)

#### Layout LEGACY (`MDB#ANEXO_GUMA`, 51 cols, 2021-2025)

Mismas 22 primeras columnas. A partir de la 23 agrega desgloses de potencia más detallados (`P_MED_REAL`, `P_REQ_MAXIMO`, `P_INIC_10M`, `P_INIC_20M`, `P_INIC_4H`, `P_INIC_MRT`, `DCTO_REQ_TERM_MATER`, `P_RESERVA_PREC_EST`, etc.). Mapping completo en archivo separado **(pendiente — validar con manual del DTE 2021)**.

---

### 🔴 raw_agum — `AGUMYYMM.txt` (24 cols, multi-sección)

**Sub-secciones detectadas** (todas dentro de "ANEXO 4 — GRANDES USUARIOS, COMERCIALIZADORES DE DEMANDA"):

| ID | Marcador | `col_count` típico (datos) | Naturaleza |
|---|---|---|---|
| **A4.1** | (después de "Demanda  Demanda Real ...") | 18-22 | Demanda física + cargos pesos (consolidado por GUMA) |
| **A4.2** | (después de "Potencia  Potencia Maxima Declarada PHMD PPAD ...") | 20-22 | Potencia (MW, MW-mes) + compras potencia (PPAD, MATER) |
| **A4.3** | "Agente Demanda Valorizacion" | 3 | Resumen valorización por agente (totales) |
| **A4.4 / A4.5** | varía año a año | 12-15 | Detalle de sobrecostos, sobre-trans, impacto compra conjunta |

#### A4.1 — Demanda + cargos (18 cols de datos)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_distrib` (concat) | text | "AGENTE  DISTRIB" → split a 8+8 |
| 2 | `demanda_real_total_mwh` | numeric | MWh |
| 3 | `demanda_real_pico_mwh` | numeric | MWh |
| 4 | `demanda_real_valle_mwh` | numeric | MWh |
| 5 | `demanda_real_resto_mwh` | numeric | MWh |
| 6 | `demanda_contratada_total_mwh` | numeric | MWh |
| 7 | `demanda_contratada_pico_mwh` | numeric | MWh |
| 8 | `demanda_contratada_valle_mwh` | numeric | MWh |
| 9 | `demanda_contratada_resto_mwh` | numeric | MWh |
| 10 | `compra_spot_pico_mwh` | numeric | MWh |
| 11 | `compra_spot_valle_mwh` | numeric | MWh |
| 12 | `compra_spot_resto_mwh` | numeric | MWh |
| 13 | `compra_spot_pesos` | numeric | $ |
| 14 | `cargo_energ_adic_pesos` | numeric | $ |
| 15 | `cargo_servicios_pesos` | numeric | $ |
| 16 | `recupero_costos_oper_pesos` | numeric | $ |
| 17 | `cargo_serv_confiab_pesos` | numeric | $ |
| 18 | `cargo_comercializ_pesos` | numeric | $ |

> **Recomendación:** este sub-anexo es **redundante** con `raw_anexo_guma` (formato HTML, mismo dato). Para el parser de Fase 2 priorizar `raw_anexo_guma` (más limpio) y usar `raw_agum` solo como **fallback** cuando el HTML no esté disponible.

#### A4.2 — Potencia (20-22 cols)

| Pos | Columna | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_distrib` | text | | "AGENTE DISTRIB" |
| 2 | `pot_maxima_mw` | numeric | MW | Potencia máxima medida |
| 3 | `pot_declarada_mw` | numeric | MW | Declarada por el agente |
| 4 | `pot_phmd_mw` | numeric | MW | Potencia para Habilitación MD |
| 5 | `compra_ppad_pico_mw` | numeric | MW | |
| 6 | `compra_ppad_valle_mw` | numeric | MW | |
| 7 | `compra_ppad_resto_mw` | numeric | MW | |
| 8 | `compra_ppad_total_mwhrp` | numeric | MWhrp | |
| 9 | `pot_contratada_mwhrp` | numeric | MWhrp | |
| 10 | `pot_mater_fa_mw` | numeric | MW | Potencia MATER ponderada por FA |
| 11-22 | `cargo_pot_*_pesos` | numeric | $ | Cargos varios (ver manual A4.2 para detalle) |

**Ejemplo (`DTE2602.zip`, AGUM2602.txt, fila 1603):**
```
AAAAPION EDENOROD  192.130 36.610 42.750 112.770 0 0 0 0 0 474768 83835 294390 286646 0.490 163.300 0.290 4049382 974048 0 97 0
```

---

### 🔴 raw_atra — `ATRAYYMM.txt` (10 cols, multi-sección)

**Sub-secciones (Anexo 2 — Transporte):**

| ID | Marcador | `col_count` | Naturaleza |
|---|---|---|---|
| **A2.preámbulo** | `Precio Mensual de Transporte en Alta Tensión ($/MWh)` | 3 | Precio mensual del transporte AT |
| **A2.1** | `Generadora  PESOS  PESOS  PESOS` | 4 | Cargos de transporte por generador |
| **A2.2** | `Prestador Precio Oym ... Usuario Demanda Cargo Oym Comp Perdida` | 6 | Cargos OyM por usuario (demanda) |
| **A2.3** | `Titular Obras de  Obra ...  Beneficiario  ...  Cuota` | 8 | Obras de transporte — cuotas |
| **A2.4** | `Titular Obras  Obra  Corredor  Recaudaciones ...  Cuotas Pagas` | 7 | Obras — recaudaciones |
| **A2.5** | `Prestador  CUST  Comercializador Gran  Perdida  Uso Capac.de  Energia  Adic.Sist.Transp.  Reduc.Tar.Peaje  Total  Corresponde  Corresponde` | 9-10 | **CUST por agente** (cargo principal del cliente) |

#### A2.5 — Cargos CUST por agente (9 cols de datos)

| Pos | Columna L2 | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_nemo` | text | | Agente al que se factura |
| 2 | `perdida_de_transp_pesos` | numeric | $ | Pérdida de Transporte |
| 3 | `uso_capac_transp_pesos` | numeric | $ | Uso de Capacidad de Transporte |
| 4 | `energia_pesos` | numeric | $ | Cargo por energía transportada |
| 5 | `adic_sist_transp_pesos` | numeric | $ | Adicional Sistema de Transporte |
| 6 | `reduc_tarifa_peaje_pesos` | numeric | $ | Reducción Tarifa Peaje |
| 7 | `cargo_total_pesos` | numeric | $ | **Total CUST** (suma de los anteriores) |
| 8 | `corresponde_local_pesos` | numeric | $ | Asignado a prestador local |
| 9 | `corresponde_otro_pesos` | numeric | $ | Asignado a otros |

**Ejemplo (fila 1021 de ATRA2602.txt):**
```
EDERSARD 3 290 111  19 816  0  503 924  0  3 813 851  0  3 813 851
```

---

### 🔴 raw_dexc — `DEXCYYMM.txt` (19 cols, multi-sección, ~22k filas/mes)

**Sub-secciones (ANEXO 11 — Res.SE 1281/06 — Demanda Excedente):**

| ID | Marcador | `col_count` | Naturaleza |
|---|---|---|---|
| **A11.precios** | `Prec.Dem.Exc.Dias Hab.Hs.Valle,Diurnas,Pico:` | 4 | Precios DEx por banda y tipo de día (3 filas: Hab/Sab/Dom) |
| **A11.1 GUMA** | header `Demanda Base - Dias Habiles ... Demanda Real - ...` con 18 cols de unidades | 19 | Demanda base vs real **por GUMA**, 18 valores: 9 base (3 días × 3 bandas) + 9 real |
| **A11.2 GUMA-cargos** | header `Demanda Demanda Contratos ... Cargo Costo Cargo Costo Recupero Saldo` | 14-15 | **Cargo Demanda Excedente** por GUMA (importe en pesos + saldo) |
| **A11.3 GUME** | similar con GUME en lugar de GUMA | 9-11 | Idem para GUME |
| **A11.GUDI** | header `Agente Ag.GUDI Hs.Valle ...` | 12 | DEx para GUDI |
| **A11.detalle** | header `Agente Ag.GUDI Exc? Descripcion Real Aplic.` | 9 | Detalle real vs aplicado |

#### A11.1 — Demanda Base vs Real por GUMA (18 cols de datos)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_distrib` | text | "AGENTE DISTRIB" |
| 2 | `dem_base_hab_valle_mwh` | numeric | MWh |
| 3 | `dem_base_hab_diurna_mwh` | numeric | MWh |
| 4 | `dem_base_hab_pico_mwh` | numeric | MWh |
| 5 | `dem_base_sab_valle_mwh` | numeric | MWh |
| 6 | `dem_base_sab_diurna_mwh` | numeric | MWh |
| 7 | `dem_base_sab_pico_mwh` | numeric | MWh |
| 8 | `dem_base_dom_valle_mwh` | numeric | MWh |
| 9 | `dem_base_dom_diurna_mwh` | numeric | MWh |
| 10 | `dem_base_dom_pico_mwh` | numeric | MWh |
| 11 | `dem_real_hab_valle_mwh` | numeric | MWh |
| 12 | `dem_real_hab_diurna_mwh` | numeric | MWh |
| 13 | `dem_real_hab_pico_mwh` | numeric | MWh |
| 14 | `dem_real_sab_valle_mwh` | numeric | MWh |
| 15 | `dem_real_sab_diurna_mwh` | numeric | MWh |
| 16 | `dem_real_sab_pico_mwh` | numeric | MWh |
| 17 | `dem_real_dom_valle_mwh` | numeric | MWh |
| 18 | `dem_real_dom_diurna_mwh` | numeric | MWh |
| 19 | `dem_real_dom_pico_mwh` | numeric | MWh |

#### A11.2 — Cargos Demanda Excedente (15 cols de datos)

| Pos | Columna L2 | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_distrib` | text | | "AGENTE DISTRIB" |
| 2 | `dem_total_mwh` | numeric | MWh | Demanda total del mes |
| 3 | `dem_excedente_mwh` | numeric | MWh | Excedente sobre la base |
| 4 | `contratos_mwh` | numeric | MWh | Contratos asignados |
| 5 | `contratos_pesos` | numeric | $ | Importe de contratos |
| 6 | `precio_contratos_pesos_mwh` | numeric | $/MWh | Precio promedio contratos |
| 7 | `dem_a_pesos` | numeric | $ | Demanda valorizada |
| 8 | `dem_b_pesos_mwh` | numeric | $/MWh | Precio medio aplicado |
| 9 | `dem_c_pesos` | numeric | $ | Demanda otra |
| 10 | `cargo_dex_pesos` | numeric | $ | **Cargo Demanda Excedente** (clave) |
| 11 | `costo_dex_pesos_mwh` | numeric | $/MWh | Costo unitario del DEx |
| 12 | `cargo_complementario_pesos` | numeric | $ | |
| 13 | `costo_complementario_pesos_mwh` | numeric | $/MWh | |
| 14 | `recupero_pesos` | numeric | $ | Recupero |
| 15 | `saldo_pesos` | numeric | $ | **Saldo neto a pagar/recibir** |

**Ejemplo (fila 10604 de DEXC2602.txt):**
```
AARGTAOY EDENOROD  0,000  0,000  0,000  0,000  0,000  1 760,383  0,000  0,000  0  0,00  0  0,00  0  0
```

---

### 🔴 raw_dte — `dteYYMM.txt` (13 cols, multi-sección, ~25k filas/mes)

**Es el archivo "índice"** del DTE: contiene un resumen económico por agente para cada concepto (compra, venta, transporte, MAT, sanciones, etc.). Las sub-secciones están numeradas `1.`, `2.`, …, `15.` y cada una tiene un layout distinto.

#### Sub-secciones principales

| ID | Marcador (`col_001`) | Naturaleza | `col_count` típico |
|---|---|---|---|
| **1.** GENERADORES EN EL MERCADO SPOT | `^1\.\s*GENERADORES EN EL MERCADO SPOT` | 12 | Resumen energía+cargos+remuneración por generador |
| **1.5** | `^1\.5\s+GENERADORES - FACTURACION POR CONSUMOS DE\s+SERVICIOS AUXILIARES` | 8 | Cargo por servicios aux. (consumo propio) |
| **2.** | `^2\.` | varía | Distribuidores |
| **3.** | `^3\.` | varía | GUMAs (resumen) |
| **4.** | `^4\.` | varía | GUMEs |
| **5.** | `^5\.` | varía | Comercializadores |
| **6.** | `^6\.` | varía | Autogeneradores |
| **7.** | `^7\.` | varía | Importación / Exportación |
| **8.-15.** | `^(N+)\.` | varía | Cargos varios, sobrecostos, fondos |

Las filas de datos típicamente tienen `col_001 = nemo (8 chars)` + 11 columnas numéricas con layout específico de cada sub-sección. El parser debe:
1. Detectar header `'1. GENERADORES EN EL MERCADO SPOT'`.
2. Saltar filas `'Remuneración Remuneración ...'` (header repetido).
3. Saltar fila de unidades (`'Agente MWh $ MWh $ MW $ MW $ MWh'`).
4. Consumir las filas de datos hasta el siguiente header.

> **Nota crítica.** El DTE es **el archivo de auditoría madre**. Para la **Factura-Sombra (mart T3.1)** el dato clave por agente es el subtotal por concepto **a final de cada sub-sección** (filas tipo `'TOTAL : ...'` o `'TOTALES >>>>>>>'`). Ese subtotal se compara contra `raw_rscj` y los detalles de cada anexo.

---

### 🔴 raw_rscj — `RSCJYYMM.txt` (15 cols)

**ANEXO 13 — Resolución Conjunta 1/2017** — cuenta corriente bilateral GUMA ↔ Distribuidor con la cobranza de los 6 últimos meses.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_distribuidor` | text | "AGENTE DISTRIBUIDOR" (split 8+8) |
| 2 | `anio_semestre` | text | Ej.: `'2022 Ene - Jun'` |
| 3 | `mes1_v_fisico_mwh` | numeric | MWh |
| 4 | `mes1_v_monetario_pesos` | numeric | $ |
| 5 | `mes2_v_fisico_mwh` | numeric | MWh |
| 6 | `mes2_v_monetario_pesos` | numeric | $ |
| 7-14 | idem para meses 3, 4, 5, 6 | | |

**Ejemplo (`RSCJ2602.txt`, fila 12):**
```
MAZZCO1Y CCOLON1W  2022 Ene - Jun  178,715  129 500,82  182,586  150 056,48  228,486  180 063,19  213,384  185 994,46  230,873  257 502,58  213,776  312 904,79
```

---

### 🟡 raw_aama — `AAMAYYMM.txt` (16 cols)

**ANEXO 8 — Créditos y Débitos correspondientes a meses anteriores** (re-liquidaciones del semestre).

#### A8.1 — Saldos por concepto y mes (15 cols)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `mes1_mwh` | numeric | MWh |
| 3 | `mes1_pesos` | numeric | $ |
| 4-12 | meses 2-6 (físico+monetario alternados) | | |
| 13 | `total_semest_mwh` | numeric | MWh |
| 14 | `total_semest_pesos` | numeric | $ |

**Ejemplo (`AAMA2511.txt`, fila 20):**
```
TREPENCT  23.964  377 018  26.823  428 334  26.294  424 101  30.598  495 496  22.113  359 880  25.247  412 939  155.039  2 497 768
```

#### A8.2 — Penalidades (Capacidad / Conexión / Equipos / Supervisión) (13 cols, formato 2024)

Headers: `Capacidad Intereses Conexion Intereses Equipos Intereses DAG y R1 Intereses Sistema Intereses Supervision Int Superv Total`.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `penal_capacidad_pesos` | numeric | $ |
| 3 | `int_capacidad_pesos` | numeric | $ |
| 4 | `penal_conexion_pesos` | numeric | $ |
| 5 | `int_conexion_pesos` | numeric | $ |
| 6 | `penal_equipos_pesos` | numeric | $ |
| 7 | `int_equipos_pesos` | numeric | $ |
| 8 | `penal_dag_r1_pesos` | numeric | $ |
| 9 | `int_dag_r1_pesos` | numeric | $ |
| 10 | `penal_sistema_pesos` | numeric | $ |
| 11 | `int_sistema_pesos` | numeric | $ |
| 12 | `penal_supervision_pesos` | numeric | $ |
| 13 | `int_supervision_pesos` | numeric | $ |
| 14 | `total_pesos` | numeric | $ |

> **Layouts antiguos (2021-2023)** difieren: `'Penal. Capac Inter. Penal Penal. Conex Inter. Penal Penal. Equip Inter. Penal Penal. Super Inter. Penal Total'` (10 cols). El parser debe detectar el layout por la fila header.

---

### 🟡 raw_anexo_gume — `anexo_gume.html` / `gume_gupa.html` (34 cols, 4 layouts)

Layouts detectados:

| Versión | Origen | Cols | Header |
|---|---|---|---|
| **2026+ nuevo** | `anexo_gume.html` | 23 | Empieza con `Agente Distribuidor Demanda Real [MWh] ...` |
| **2026 GUPA** | `gume_gupa.html` | 22 | `GUME PFTT TC Energía Valle Energía Resto ...` |
| **2025 nuevo** | `gume_gupa.html` | 34 | `GUME PFTT GEN Comerc Gen Comerc Dem TC Energía Valle ...` |
| **2025 simple** | `gume_gupa.html` | 5 | `GUME PFTT GEN COMERC_G COMERC_D` (sólo metadatos) |

#### Layout 2026+ (`anexo_gume.html`, 23 cols)

Mismo esquema que `raw_anexo_guma` pero recortado (sin desglose de `Compra Spot Pico/Valle/Resto` por separado).

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `distribuidor_nemo` | text | |
| 3 | `demanda_real_total_mwh` | numeric | MWh |
| 4 | `demanda_real_pico_mwh` | numeric | MWh |
| 5 | `demanda_real_valle_mwh` | numeric | MWh |
| 6 | `demanda_real_resto_mwh` | numeric | MWh |
| 7 | `compra_spot_total_mwh` | numeric | MWh |
| 8 | `compra_spot_pico_mwh` | numeric | MWh |
| 9 | `compra_spot_valle_mwh` | numeric | MWh |
| 10 | `compra_spot_resto_mwh` | numeric | MWh |
| 11 | `compra_spot_pesos` | numeric | $ |
| 12 | `cargo_energ_adic_pesos` | numeric | $ |
| 13 | `cargo_servicios_pesos` | numeric | $ |
| 14 | `recupero_costos_oper_pesos` | numeric | $ |
| 15 | `cargo_serv_conf_pesos` | numeric | $ |
| 16 | `compra_ppad_mw` | numeric | MW |
| 17 | `compra_potencia_ppad_mwhrp` | numeric | MWhrp |
| 18 | `energia_mater_fa_mw_mes` | numeric | MW-mes |
| 19 | `potencia_pesos` | numeric | $ |
| 20 | `cargo_transp_at_pesos` | numeric | $ |
| 21 | `cargo_transp_dt_pesos` | numeric | $ |
| 22 | `serv_tecnico_admin_pesos` | numeric | $ |
| 23 | `cargo_comercializ_cc_pesos` | numeric | $ |

---

### 🟡 raw_gudi — `GUDIYYMM.txt` (16 cols)

**ANEXO 13 — Resolución 976/2023** — Diferencia entre precio mensual y precio estacional para GUDI (Grandes Usuarios Distribuidoras).

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_distrib_gudi` | text | "DISTRIB GUDI" (8+8 chars) |
| 2 | `demanda_mwh` | numeric | MWh |
| 3 | `pm_mensual_energia_pesos_mwh` | numeric | $/MWh |
| 4 | `pm_mensual_potencia_pesos_mw` | numeric | $/MW |
| 5 | `pm_mensual_transp_pesos_mwh` | numeric | $/MWh |
| 6 | `pm_estac_energia_pesos_mwh` | numeric | $/MWh |
| 7 | `pm_estac_potencia_pesos_mw` | numeric | $/MW |
| 8 | `pm_estac_transp_pesos_mwh` | numeric | $/MWh |
| 9 | `dif_energia_pesos_mwh` | numeric | $/MWh |
| 10 | `dif_potencia_pesos_mwh` | numeric | $/MWh |
| 11 | `dif_transp_pesos_mwh` | numeric | $/MWh |
| 12 | `precio_cargo_estabilizado_pesos_mwh` | numeric | $/MWh |
| 13 | `cargo_estabilizado_pesos` | numeric | $ |
| 14 | `precio_ajuste_complementario_pesos_mwh` | numeric | $/MWh |
| 15 | `ajuste_complementario_pesos` | numeric | $ |

**Ejemplo:**
```
APELPALD GD0003LI  56,736  67 896,46  8332 064,16  5 820,14  63 046,57  8004 981,00  6 075,00  4 849,89  1 024,36  -254,86  5 619,39  318 822  128,64  7 299
```

---

### 🟡 raw_adis — `ADISYYMM.txt` (17 cols, multi-sección)

**ANEXO 3 — Distribuidores.** Sub-secciones varias (demanda SMEC, GUME, total, transporte, potencia, PAFTT). Layouts:

- **A3.1 Demanda física** (`col_count` 13-14): demanda SMEC + GUME + total + bandas valle/resto/pico + electrodependientes
- **A3.2 Pesos** (`col_count` 8-9): valorización por concepto
- **A3.3 PAFTT** (`col_count` 17): cargos PAFTT detallados
- **A3.4 Potencia** (`col_count` 10): cargos por potencia
- **A3.5 Categorización** (`col_count` 4): GUDI, electrodep general, club barrio, etc.

> Detalle de columnas pendiente — las series son largas (17 columnas con bandas valle/diurna/pico). Recomiendo al chat encargado de **T2.9** validar contra el manual del A3 antes de mapear.

---

### 🟡 raw_agen — `AGENYYMM.txt` (25 cols, multi-sección)

**ANEXO 1 — Generadores.** Es el segundo archivo más grande (~420k filas en local). Sub-secciones:

| ID | Marcador | `col_count` | Naturaleza |
|---|---|---|---|
| **A1.1** | `Unidad Generacion Energia Spot ...` | 8-10 | Energía generada por unidad |
| **A1.2** | `Unidad Venta Energia Costo OYM Costo Transporte ...` | 12-14 | Cargos económicos del generador |
| **A1.3** | `Unidad Potencia Disponible Contratada MEM Contratada MATP ...` | 6-7 | Potencia disponible y contratada |
| **A1.4** | `Unidad Escala Energ Total ...` | 14-15 | Detalle por escala (térmica, hidro, renov) |
| **A1.5** | `Unidad Escala Disponibil Potencia DIGO ...` | 11 | DIGO y remuneración por disponibilidad |
| **A1.6** | `Agente Generad. Generada Energia Baterias Creditos ...` | 16-17 | Reservas, baterías, créditos |
| **A1.7** | `Dia/Hora 01 02 03 ...` | 25 | **Curva horaria diaria** por generador (24+1 cols) |

> El A1.7 es **gold** para la oportunidad 1.3 (curva costo marginal): permite reconstruir el despacho horario por generador. Pero está crudo — el parser de **T2.10** debe normalizar de "fila por (generador, día)" a "fila por (generador, fecha, hora)".

---

### 🟡 raw_anexo_gen111 — `anexo_gen111.html` (18 cols)

**Cuadro 11.1** — Energía térmica por unidad. **Header explícito en HTML.**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | (a veces fusionado en col_001) |
| 3 | `escala` | text | (a veces fusionado) |
| 4 | `energia_total_termica_mwh` | numeric | MWh |
| 5 | `energia_comprometida_mwh` | numeric | MWh |
| 6 | `energia_gen_desp_no_opt_mwh` | numeric | MWh |
| 7 | `energia_remun_desp_no_opt_mwh` | numeric | MWh |
| 8 | `energia_total_remunerada_mwh` | numeric | MWh |
| 9 | `energia_gas_mwh` | numeric | MWh |
| 10 | `energia_gas_oil_mwh` | numeric | MWh |
| 11 | `energia_fuel_oil_mwh` | numeric | MWh |
| 12 | `energia_biocomb_mwh` | numeric | MWh |
| 13 | `energia_carbon_mwh` | numeric | MWh |
| 14 | `ener_oper_remunerada_mwh` | numeric | MWh |
| 15 | `remunerac_energia_pesos` | numeric | $ |
| 16 | `remunerac_ener_oper_pesos` | numeric | $ |
| 17 | `energia_hs_pico_mwh` | numeric | MWh |
| 18 | `remun_energia_hs_pico_pesos` | numeric | $ |

**Ejemplo (`anexo_gen111.html`, row 2):**
```
ALUAMAUG  43308,05  0  0  0  0  0  0  0  0  0  43837,265  0  76802888,3  9147,272  92167912
```

> **Cuidado:** en filas reales `col_001` puede traer **fusionados** los campos `(agente, unidad, escala)` separados por espacios variables. El parser debe usar el **header** para split posicional, no fusionado.

---

### 🟡 raw_anexo_gen112 — `anexo_gen112.html` (14 cols reservadas; layout activo 12)

**Cuadro 11.2** — Potencia disponible térmica.

> El DDL local reserva `col_001` a `col_014`, pero las filas 2021-01 → 2026-03 usan `col_count` 9 o 12. Crear la tabla L1 con 14 columnas para que la ingesta acepte el SQL local tal cual; el parser L2 usa las primeras 12.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `escala` | text | |
| 4 | `disp_real_mw` | numeric | MW |
| 5 | `pot_comprometida_mw` | numeric | MW |
| 6 | `digo_mw` | numeric | MW |
| 7 | `km` | numeric | KM |
| 8 | `remun_pot_disp_base_pesos` | numeric | $ |
| 9 | `remun_pot_digo_pesos` | numeric | $ |
| 10 | `remun_pot_comb_no_opt_pesos` | numeric | $ |
| 11 | `porc_disponib_pot_pct` | numeric | % |
| 12 | `remun_pot_acuerdos_disp_pesos` | numeric | $ |

---

### 🟡 raw_anexo_gen113 — `anexo_gen113.html` (11 cols)

**Cuadro 11.3** — Energía hidráulica.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `escala` | text | |
| 4 | `energia_total_mwh` | numeric | MWh |
| 5 | `energia_comprometida_mwh` | numeric | MWh |
| 6 | `energia_remunerada_mwh` | numeric | MWh |
| 7 | `energia_hs_pico_mwh` | numeric | MWh |
| 8 | `remun_energia_pesos` | numeric | $ |
| 9 | `remun_ener_oper_pesos` | numeric | $ |
| 10 | `precio_pico_pesos_mwh` | numeric | $/MWh |
| 11 | `remun_energia_hs_pico_pesos` | numeric | $ |

**Ejemplo:** `HTUCUMAG PVIEHI HI - POTENCIA (P) < 50 MW 584.33 0 584.33 626.2 2389325 1018766 116.025 474426`

---

### 🟡 raw_anexo_gen114 — `anexo_gen114.html` (11 cols reservadas; layout activo 8)

**Cuadro 11.4** — Potencia hidráulica.

> El DDL local reserva `col_001` a `col_011`, pero las filas 2021-01 → 2026-03 usan `col_count` 6 u 8. Crear la tabla L1 con 11 columnas; el parser L2 usa las primeras 8.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `escala` | text | |
| 4 | `disp_real_mw` | numeric | MW |
| 5 | `pot_remunerada_mw` | numeric | MW |
| 6 | `remun_pot_disp_base_pesos` | numeric | $ |
| 7 | `porc_disponib_pot_pct` | numeric | % |
| 8 | `remun_pot_acuerdos_disp_pesos` | numeric | $ |

---

### 🟡 raw_anexo_gen13 — `anexo_gen13.html` (16 cols)

**Cuadro 13** — Reservas y Potencia Térmica 4 hs.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `conjunto_generador` | text | |
| 3 | `porc_comerc_pct` | numeric | % |
| 4 | `unidad_comerc` | text | |
| 5 | `venta_pot_res_op_mwh` | numeric | MW*h |
| 6 | `venta_pot_res_op_pesos` | numeric | $ |
| 7 | `venta_pot_res_10min_mwh` | numeric | MW*h |
| 8 | `venta_pot_res_10min_pesos` | numeric | $ |
| 9 | `venta_pot_res_20min_mwh` | numeric | MW*h |
| 10 | `venta_pot_res_20min_pesos` | numeric | $ |
| 11 | `venta_pot_term_4hs_mwh` | numeric | MW*h |
| 12 | `venta_pot_term_4hs_pesos` | numeric | $ |
| 13 | `venta_pot_total_pesos_mwh` | numeric | $/MW*h |
| 14 | `venta_pot_total_pesos` | numeric | $ |
| 15 | `prec_med_total_pesos_mwh` | numeric | $/MWh |
| 16 | `penaliz_term_4hs_pesos` | numeric | $ |

---

### 🟡 raw_anexo_gen_disp_mejora — `anexo_gen_disp_mejora.html` (12 cols)

**Disponibilidad Mejorada (Res. ME 1085/17).**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `escala` | text | |
| 4 | `pot_comprometida_mw` | numeric | MW |
| 5 | `pot_disp_real_mw` | numeric | MW |
| 6 | `pot_dispmejorada_mw` | numeric | MW |
| 7 | `disp_pct` | numeric | % |
| 8-12 | `cargo_*_pesos` | numeric | $ | **(detalle pendiente)** |

---

### 🟡 raw_anexo_mat — `anexo_mat.html` (9 cols, formato HTML 2026+)

**Anexo 6 — vista HTML del A6.1.1 (contratos MAT abastecimiento).**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_generador` | text | |
| 2 | `conjunto_generador` | text | |
| 3 | `agente_demandante` | text | |
| 4 | `comercializador` | text | |
| 5 | `energia_valle_mwh` | numeric | MWh |
| 6 | `energia_resto_mwh` | numeric | MWh |
| 7 | `energia_pico_mwh` | numeric | MWh |
| 8 | `energia_total_mwh` | numeric | MWh |
| 9 | `importe_contrato_pesos` | numeric | $ |

> **Decisión arquitectónica:** este HTML es la fuente preferida para contratos MAT (más limpio). `raw_amat` (TXT) queda como fallback.

---

### 🟡 raw_anexo_mat_renovable — `anexo_mat_renovable.html` (6 cols)

**A6.1.3.1 — RENMER (Mater Renovable).**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_generador` | text | |
| 2 | `conjunto_generador` | text | |
| 3 | `agente_demandante` | text | |
| 4 | `comercializador` | text | |
| 5 | `energia_contrato_mwh` | numeric | MWh |
| 6 | `importe_contrato_pesos` | numeric | $ |

---

### 🟡 raw_anexo_mat_plus — `anexo_mat_plus.html` (8 cols)

**Contratos PLUS (Energía Plus).** Mismo esquema que `raw_anexo_mat` pero sin `comercializador`. Mapping idéntico al de `anexo_mat` salvo posición 4.

---

### 🟡 raw_anexo_mat_cvt — `anexo_mat_cvt.html` (8 cols)

**Cargo Variable de Transporte.**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `vendedor_agente` | text | |
| 2 | `participante` | text | (puede contener "ACAJMT" — código de participación) |
| 3 | `conjunto_generador` | text | |
| 4 | `comercializador` | text | |
| 5 | `comprador_agente` | text | |
| 6 | `participante_2` | text | |
| 7 | `pot_despachada_mwh` | numeric | MW*h |
| 8 | `cargo_pot_despachada_pesos` | numeric | $ |

---

### 🟡 raw_anexo_mat_compromiso — `anexo_mat_compromiso.html` (26 cols)

**Compromisos generador (Res. ME 1085/17).** Header HTML explícito, layout columnar.

| Pos | Columna L2 | Tipo | Unidad | Descripción |
|---|---|---|---|---|
| 1 | `agente_nemo` | text | | |
| 2 | `conjunto_generador` | text | | |
| 3 | `porc_comerc_pct` | numeric | % | |
| 4 | `unidad_comerc` | text | | |
| 5 | `energia_generada_total_mwh` | numeric | MWh | |
| 6 | `venta_energia_spot_mwh` | numeric | MWh | |
| 7 | `venta_energia_spot_pesos` | numeric | $ | |
| 8 | `pmedio_spot_pesos_mwh` | numeric | $/MWh | |
| 9 | `venta_energia_costo_op_mwh` | numeric | MWh | |
| 10 | `venta_energia_costo_op_pesos` | numeric | $ | |
| 11 | `pmedio_costo_op_pesos_mwh` | numeric | $/MWh | |
| 12 | `venta_energia_total_mwh` | numeric | MWh | |
| 13 | `venta_energia_spot_pesos_2` | numeric | $ | (duplicado del 7 en algunos meses; **revisar**) |
| 14 | `pmedio_total_pesos_mwh` | numeric | $/MWh | |
| 15 | `sobrec_transit_despacho_pesos` | numeric | $ | |
| 16 | `remun_adicional_pesos` | numeric | $ | |
| 17 | `dcto_remun_adicional_pesos` | numeric | $ | |
| 18 | `venta_pot_base_mwh` | numeric | MW*h | |
| 19 | `venta_pot_base_pesos` | numeric | $ | |
| 20 | `venta_pot_excedente_mwh` | numeric | MW*h | |
| 21 | `venta_pot_excedente_pesos` | numeric | $ | |
| 22 | `venta_pot_forzada_mwh` | numeric | MW*h | |
| 23 | `venta_pot_forzada_pesos` | numeric | $ | |
| 24 | `venta_pot_total_mwh` | numeric | MW*h | |
| 25 | `venta_pot_total_pesos` | numeric | $ | |
| 26 | `precio_med_total_pesos_mwh` | numeric | $/MWh | |

---

### 🟡 raw_anexo_mat_cont_delivery — `anexo_mat_cont_delivery.html` (13 cols)

**Contratos Delivery (entrega física).** Header HTML.

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `conjunto_generador` | text | |
| 3 | `hs_valle_mwh` | numeric | MWh |
| 4 | `hs_resto_mwh` | numeric | MWh |
| 5 | `hs_pico_mwh` | numeric | MWh |
| 6 | `total_mwh` | numeric | MWh |
| 7 | `en_costo_var_pesos` | numeric | $ |
| 8 | `en_costo_comb_pesos` | numeric | $ |
| 9 | `cargo_fijo_pot_pesos` | numeric | $ |
| 10 | `cargo_fijo_pot_mem_pesos` | numeric | $ |
| 11 | `cargo_gerenciamiento_pesos` | numeric | $ |
| 12 | `cargo_ampl_tanques_pesos` | numeric | $ |
| 13 | `penalizaciones_pesos` | numeric | $ |

---

### 🟡 raw_anexo_mat_cequip724 — `anexo_mat_cequip724.html` (6 cols)

**Capacidad Equivalente Res. SE 724.**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_generadora` | text | |
| 3 | `rem_mensual_mwh` | numeric | MWh |
| 4 | `rem_mensual_pesos` | numeric | $ |
| 5 | `penalizacion_mwh` | numeric | MWh |
| 6 | `penalizacion_pesos` | numeric | $ |

---

### 🟢 raw_aexp — `AEXPYYMM.txt` (19 cols, multi-sección)

**Anexo 9 — Importación / Exportación.** Sub-secciones: Cargos por demanda exportada (A9.1, ~16 cols), Compras de energía importada (A9.2, ~17 cols), Detalle bilateral generador↔demandante (A9.3, 14 cols).

#### A9.1 — Demanda exportada (16 cols de datos)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `jurisdic_agente_gen` | text | (opcional) |
| 3 | `dem_contratada_mwh` | numeric | MWh |
| 4 | `pot_declarada_mw` | numeric | MW |
| 5 | `pot_maxima_mw` | numeric | MW |
| 6 | `pot_req_maximo_mw` | numeric | MW |
| 7 | `compra_pot_mens_mw` | numeric | MW |
| 8 | `cargo_pesos` | numeric | $ |
| 9 | `precio_pesos_mwh` | numeric | $/MWh |
| 10 | `serv_res_inst_pesos_mw_mes` | numeric | $/MW-mes |
| 11 | `serv_asoc_pesos_mw_mes` | numeric | $/MW-mes |
| 12 | `reserva_4h_pesos_mw_mes` | numeric | $/MW-mes |
| 13 | `cargo_serv_res_inst_pesos` | numeric | $ |
| 14 | `cargo_serv_asoc_pesos` | numeric | $ |
| 15 | `cargo_p_reserva_pesos` | numeric | $ |
| 16 | `importe_total_pesos` | numeric | $ |

---

### 🟢 raw_auto — `AUTOYYMM.txt` (19 cols, multi-sección)

**Anexo 5 — Autogeneradores y Cogeneradores.** Esquema **muy similar** a `raw_agum` con la diferencia de incluir `Generacion` (autogenerada) en la sub-sección A5.1. Reutilizar el parser de `raw_agum` con un mapeo extendido.

---

### 🟢 raw_anexo_genmovil — `anexo_genmovil.html` (15 cols)

**Generación móvil (containers / unidades transportables).** Header HTML. Mapping pendiente (1 fila por mes en muestreo, baja prioridad).

---

### 🟢 raw_anexo_gennuc — `anexo_gennuc.html` (6 cols)

**Generación nuclear.**

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `energia_mwh` | numeric | MWh |
| 4 | `pot_disp_mw` | numeric | MW |
| 5 | `remunerac_pesos` | numeric | $ |
| 6 | `obs` | text | (opcional) |

---

### 🟢 raw_anexo_generacion_forzada — `anexo_generacion_forzada.html` (6 cols)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `unidad_comerc` | text | |
| 3 | `energia_forzada_mwh` | numeric | MWh |
| 4 | `sobrecosto_combustible_pesos` | numeric | $ |
| 5 | `creditos_pesos` | numeric | $ |
| 6 | `debitos_pesos` | numeric | $ |

---

### 🟢 raw_anexo_gen_294pot / raw_anexo_gen_294ene

**Resolución SE 294 — potencia / energía.** 10 / 11 cols. Mapping pendiente (volumen bajo, low-priority).

---

### 🟢 raw_adco — `ADCOYYMM.txt` (8 cols)

**ANEXO 12 — Res. MEyM 281-E/2017** — Cargos a Comercializadores.

#### A12.1 — Detalle por GUDI / GUME (6 cols + nemo concatenado)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `distribuidor_gudi` | text | "DISTRIB GUDI" (8+8) |
| 2 | `dem_pesos_mwh_media_mensual` | numeric | $/MWh |
| 3 | `dem_mwh_mensual` | numeric | MWh |
| 4 | `cargo_comercializ_pesos_mwh` | numeric | $/MWh |
| 5 | `cargo_comercializ_pesos` | numeric | $ |
| 6 | `cargo_administracion_pesos` | numeric | $ |

> **Nota.** El `Cargo Maximo Comercializacion` y el `Porcentaje Obligatorio Ley 27191 (%)` están en una **fila preámbulo** del archivo (no son datos por agente). El parser debe extraerlos como **parámetros del mes** y guardarlos en una tabla `cammesa_parametros_mensuales`.

---

### 🟢 raw_agfq — `AGFQYYMM.txt` (12 cols)

**ANEXO 7 — Generación Forzada y Falla Quasi-firme.**

#### A7.1 — Sobrecostos generación forzada (9 cols, formato 3-bloques)

El layout viene **triplicado horizontalmente** (3 agentes por fila): el header dice `Agente Guma Comerc/ Unidad Sobrecosto Pot. | Agente Guma Comerc/ ... | Agente Guma Comerc/ ...`.

El parser debe **transponer** las 12 columnas posicionales en **3 filas de salida** con 4 campos cada una:

| Pos virtual | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `guma_comerc` | text | |
| 3 | `unidad_generadora` | text | |
| 4 | `sobrecosto_pot_base_forzada_pesos` | numeric | $ |

#### A7.2 — Créditos y débitos por imp/exp (7 cols)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `oper_imp_exp_pesos` | numeric | $ |
| 3 | `informado_progresivo_pesos` | numeric | $ |
| 4 | `informado_progresivo_2_pesos` | numeric | $ |
| 5 | `no_informada_pesos` | numeric | $ |
| 6 | `total_pesos` | numeric | $ |
| 7 | `creditos_pesos` | numeric | $ |

#### A7.x — Falla quasi-firme

Header `Fecha Hora Descripcion Falla Area de Corte` → tabla **dimensional** (no por agente). Sólo aparece en meses con eventos de falla.

| Pos | Columna L2 | Tipo |
|---|---|---|
| 1 | `fecha` | date |
| 2 | `hora` | text |
| 3 | `descripcion_falla` | text |
| 4 | `area_corte` | text |

---

### 🟢 raw_game — `GAMEYYMM.txt` (13 cols, multi-sección)

**ANEXO 10 — Reembolso de Gastos e Inversiones de CAMMESA** (cargos por gerencia operativa).

Sub-secciones:
- **A10.1** Cargo gerenciamiento operativo (10-11 cols): subtotal energía + transporte + cargo energía + cargo obras + valoración mercado a término + total
- **A10.2** Liquidación detallada (12-13 cols)
- **A10.3** Débitos por incumplimiento (5 cols)
- **A10.4** Sistema canon + OyM transporte (7 cols)

#### A10.1 — Cargo gerenciamiento (10 cols de datos)

| Pos | Columna L2 | Tipo | Unidad |
|---|---|---|---|
| 1 | `agente_nemo` | text | |
| 2 | `subt_energia_pesos` | numeric | $ |
| 3 | `c_transporte_pesos` | numeric | $ |
| 4 | `cg_energia_pesos` | numeric | $ |
| 5 | `cargo_obras_pesos` | numeric | $ |
| 6 | `compra_cargos_pesos` | numeric | $ |
| 7 | `valor_mercado_termino_pesos` | numeric | $ |
| 8 | `subtotal_pesos` | numeric | $ |
| 9 | `participacion_pct` | numeric | (decimal, ej. `0,000009`) |
| 10 | `total_gastos_pesos` | numeric | $ |

---

### 🟢 raw_anexo_gen115 / 116 / 117 / 118 / 119

Cuadros 11.5 - 11.9 del Anexo 1 — generación. Cantidad de filas baja (~1-30 por mes). Layouts pendientes de validación contra el manual del DTE. Prioridad **baja** (datos secundarios para Generación máquina mensual).

---

### 🟢 raw_anexo_gen12 — `anexo_gen12.html` (18 cols)

**Cuadro 12** — Servicios Auxiliares de Potencia. **Header HTML explícito.** Layout pendiente.

---

## 4. Notas para los chats hijos de Fase 2

1. **Empezar por T2.0** (helpers `parse_es_number`, `parse_es_date`, `nemo_from`) antes de cualquier T2.x. Sin esto los parsers van a duplicar lógica.
2. **Leer la `raw_*` correspondiente filtrada por** `(anio, mes) = (2026, 2)` durante desarrollo (mes con datos completos en local) y validar contra los `append_summary_2026_02.json` (cantidad de filas).
3. **Para tablas TXT multi-sección**, el parser debe ser una **state machine** que reconoce el header de cada sub-anexo y rutea las filas de datos al mapeo correspondiente.
4. **Para tablas HTML**, validar que `section_index = 2` (formato nuevo) o `section_index = 1` (legacy) y usar la **fila 1 de la sección** como header dinámico — más robusto que hardcodear posiciones.
5. **Reportar al log** cualquier `col_count` no esperado (debería ser <0.1 % del total — si es mayor, hay un layout no documentado).
6. **Validar totales contra los subtotales** del archivo (`TOTALES >>>>>>>`) — si no coinciden ±1 %, marcar el periodo como sospechoso y logear.

---

## 5. Pendientes (a resolver durante T2.x)

- [ ] Validar mapping legacy de `raw_anexo_guma` (51 cols, 2021-2025) contra manual DTE 2021.
- [ ] Mapping completo de `raw_adis` (5 sub-secciones, 17 cols).
- [ ] Mapping completo de `raw_agen` A1.4 / A1.5 / A1.6 / A1.7 (incluye curva horaria).
- [ ] Mapping de `raw_anexo_gen115/116/117/118/119` (cuadros 11.5-11.9).
- [ ] Mapping de `raw_anexo_gen12` (Servicios Auxiliares).
- [ ] Confirmar si `raw_anexo_mat_compromiso.col_007` y `col_013` son duplicados (ambos `Venta Energía Spot Pesos`).
- [ ] Validar que `raw_aama` tenga el mismo layout 2021-2026 (los headers de los meses muestreados difieren).
- [ ] Documentar el formato de los archivos `*.MDB#TABLA` (export de MS Access pre-2026) — coexisten con los HTML en algunos meses.
