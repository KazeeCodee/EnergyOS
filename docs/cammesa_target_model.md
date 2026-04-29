# T0.3 — Modelo lógico target (3 capas)

> **Propósito.** Diseñar la arquitectura de datos de EnergyOS en 3 capas (L1 raw → L2 semántica → L3 marts) que sostenga las 12 oportunidades de cruza identificadas. Define qué tablas crear, qué claves usan, qué dependencias tienen y cómo se reflejan en la UI.
>
> **Insumos.** [T0.1](cammesa_dictionary.md) (diccionario `raw_*`) + [T0.2](cammesa_supabase_gap.md) (gap Supabase) + roadmap de Fases del proyecto.

---

## 1. Principios de diseño

1. **3 capas, sin atajos.** Ninguna pantalla del producto debe consultar `raw_*` directamente. Todas leen L3 (marts) o, como mucho, L2 (semánticas). Esto:
   - Aísla los cambios de formato de CAMMESA en una capa fina (L1→L2 parsers).
   - Hace que los marts L3 sean reproducibles desde L2 sin volver a parsear.
   - Permite cambiar la fuente (CAMMESA HTML → MDB → API) sin tocar la UI.

2. **Idempotencia.** Cada capa expone una función `refresh_<tabla>(_anio int, _mes int)` que se puede correr N veces sin duplicar. Detrás usa `INSERT … ON CONFLICT (...) DO UPDATE` o `DELETE WHERE periodo + INSERT`.

3. **Clave canónica de unión.** Todo lo que sea por agente y mes usa `(agente_nemo text, anio int, mes int)`. Punto. `agente_nemo` siempre tiene 8 caracteres y se obtiene de `left(col_001, 8)` (TXT) o `col_001` directo (HTML).

4. **Numérico ES.** Todo número entra como `text` en L1 y sale como `numeric` (sin pérdida de precisión) en L2 vía `public.parse_es_number(text)`.

5. **RLS por plan, no por tabla.** L1 y L2 son `select_authenticated` (todo usuario logueado lee), L3 puede tener policies por `empresas.plan_activo` para esconder marts premium del plan compliance.

6. **Marts L3 desnormalizados.** Cada mart es un "snapshot" listo para una pantalla: una sola query rápida, sin joins en runtime. La idempotencia es el costo aceptable.

7. **Versionado de parsers.** Cada función `refresh_*` lleva un `parser_version text` en sus filas escritas → permite re-procesar todo cuando cambia un parser sin perder trazabilidad.

---

## 2. Diagrama global L1 → L2 → L3 → UI

```
                  ┌─────────────────── L1 (raw_*) ───────────────────┐
                  │                                                  │
                  │  raw_dte    raw_amat    raw_atra    raw_dexc     │
                  │  raw_rscj   raw_aama    raw_agum    raw_anexo_*  │
                  │  raw_gudi   raw_adis    raw_adco    raw_anexo_*  │  ← 42 tablas
                  │  raw_agen   raw_aexp    raw_auto    raw_anexo_*  │
                  │  raw_game   raw_agfq                             │
                  └──────────────────────┬───────────────────────────┘
                                         │ parsers (T2.1…T2.15)
                  ┌──────────────────────▼───────────────────────────┐
                  │                                                  │
                  │              L2 (tablas semánticas)              │
                  │                                                  │
                  │  ┌─ Demanda y consumo del cliente ────────────┐  │
                  │  │  guma_detalle_mensual                      │  │
                  │  │  gume_detalle_mensual                      │  │
                  │  │  gudi_detalle_mensual                      │  │
                  │  │  excedente_mensual                         │  │
                  │  └────────────────────────────────────────────┘  │
                  │                                                  │
                  │  ┌─ Económico mensual ────────────────────────┐  │
                  │  │  dte_resumen_agente                        │  │
                  │  │  cuenta_corriente_agente                   │  │
                  │  │  reliquidacion_mensual                     │  │
                  │  │  cargos_comerc_mensual                     │  │
                  │  │  transporte_concepto_mensual               │  │
                  │  └────────────────────────────────────────────┘  │
                  │                                                  │
                  │  ┌─ Mercado a Término ─────────────────────────┐ │
                  │  │  mater_contrato_mensual                     │ │
                  │  │  mater_renovable_mensual                    │ │
                  │  │  mater_cvt_mensual                          │ │
                  │  └─────────────────────────────────────────────┘ │
                  │                                                  │
                  │  ┌─ Generación / oferta ───────────────────────┐ │
                  │  │  generacion_maquina_mensual                 │ │
                  │  │  disponibilidad_maquina_mensual             │ │
                  │  │  imp_exp_mensual                            │ │
                  │  │  auto_mensual                               │ │
                  │  └─────────────────────────────────────────────┘ │
                  │                                                  │
                  │  ┌─ Catálogo / parámetros ─────────────────────┐ │
                  │  │  cammesa_parametros_mensuales               │ │
                  │  │  (precios spot, precio transp AT, %ren obj) │ │
                  │  └─────────────────────────────────────────────┘ │
                  │                                                  │
                  └──────────────────────┬───────────────────────────┘
                                         │ marts (T3.1…T3.11)
                  ┌──────────────────────▼───────────────────────────┐
                  │                                                  │
                  │                  L3 (marts UI)                   │
                  │                                                  │
                  │  factura_sombra_mensual         ← T3.1 → T4.4    │
                  │  mater_pnl_contrato_mensual     ← T3.2 → T4.5    │
                  │  curva_costo_marginal_horaria   ← T3.3 → T4.6    │
                  │  exposicion_spot_mensual        ← T3.4 → T4.7    │
                  │  peer_benchmark_mensual         ← T3.5 → T4.8    │
                  │  mater_pricing_index_mensual    ← T3.6 → T4.9    │
                  │  transporte_forensics_mensual   ← T3.7 → T4.10   │
                  │  disponibilidad_generador_men.  ← T3.8 → T4.11   │
                  │  combustibles_vs_spot_mensual   ← T3.10 → T4.12  │
                  │  imp_exp_impacto_mensual        ← T3.11 → T4.13  │
                  │  compliance_renovable_mensual   ← T3.9 → T4.14   │
                  │                                                  │
                  └──────────────────────┬───────────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────────┐
                  │                  UI (Fase 4)                     │
                  │  AdminModule1-4  +  4.4 Factura-sombra  +  ...   │
                  └──────────────────────────────────────────────────┘
```

---

## 3. Detalle de la capa L2 (semántica)

> **Convención de nombres.** Todas las tablas L2 terminan en `_mensual` cuando granulan por `(anio, mes)`. Las que granulan por `(fecha, hora)` terminan en `_horaria`.

### 3.1 Tablas L2 — Demanda y consumo del cliente

#### `guma_detalle_mensual` ← parser T2.2 desde `raw_anexo_guma` (con fallback `raw_agum`)

| Campo | Tipo | Origen |
|---|---|---|
| `id` | bigserial PK | |
| `anio`, `mes` | int | raw |
| `agente_nemo` | text (8) | raw `col_001` |
| `distribuidor_nemo` | text (8) | raw `col_002` |
| `demanda_real_total_mwh` | numeric | raw `col_003` |
| `demanda_real_pico_mwh` | numeric | raw `col_004` |
| `demanda_real_valle_mwh` | numeric | raw `col_005` |
| `demanda_real_resto_mwh` | numeric | raw `col_006` |
| `demanda_contratada_total_mwh` | numeric | raw `col_007` |
| `demanda_contratada_pico_mwh` | numeric | raw `col_008` |
| `demanda_contratada_valle_mwh` | numeric | raw `col_009` |
| `demanda_contratada_resto_mwh` | numeric | raw `col_010` |
| `compra_spot_pico_mwh` | numeric | raw `col_011` |
| `compra_spot_valle_mwh` | numeric | raw `col_012` |
| `compra_spot_resto_mwh` | numeric | raw `col_013` |
| `compra_spot_pesos` | numeric | raw `col_014` |
| `cargo_energ_adic_pesos` | numeric | raw `col_015` |
| `cargo_servicios_pesos` | numeric | raw `col_016` |
| `recupero_costos_oper_pesos` | numeric | raw `col_017` |
| `cargo_serv_conf_pesos` | numeric | raw `col_018` |
| `cargo_transp_at_pesos` | numeric | raw `col_019` |
| `cargo_transp_dt_pesos` | numeric | raw `col_020` |
| `cargo_ampliac_at_pesos` | numeric | raw `col_021` |
| `cargo_ampliac_dt_pesos` | numeric | raw `col_022` |
| `pot_maxima_mw` | numeric | raw `col_023` |
| `pot_declarada_mw` | numeric | raw `col_024` |
| `pot_phmd_mw` | numeric | raw `col_025` |
| `compra_ppad_mw` | numeric | raw `col_026` |
| `compra_potencia_ppad_mwhrp` | numeric | raw `col_027` |
| `pot_contratada_mwhrp` | numeric | raw `col_028` |
| `pot_mater_mw` | numeric | raw `col_029` |
| `potencia_pesos` | numeric | raw `col_030` |
| `cargo_comercializ_cc_pesos` | numeric | raw `col_031` |
| `parser_version` | text | helper |
| `procesado_en` | timestamptz | now() |

**PK natural:** `(anio, mes, agente_nemo, distribuidor_nemo)`.
**Índices:** `(agente_nemo, anio, mes)` — uso recurrente en marts.

#### `gume_detalle_mensual` ← parser T2.8 desde `raw_anexo_gume`

Mismas 23 columnas del [T0.1 §3 raw_anexo_gume layout 2026+](cammesa_dictionary.md#layout-2026-anexo_gumehtml-23-cols).

#### `gudi_detalle_mensual` ← parser T2.9 desde `raw_gudi`

15 columnas del A13 (Resol. 976/2023): demanda, precios mensuales/estacionales, diferencias, cargo estabilizado, ajuste complementario.

#### `excedente_mensual` ← parser T2.4 desde `raw_dexc`

Una fila por `(agente_nemo, distribuidor_nemo, anio, mes)` con:
- 18 columnas de `dem_base_*` y `dem_real_*` (3 días × 3 bandas × 2)
- `dem_excedente_total_mwh` (computada)
- `cargo_dex_pesos`, `recupero_pesos`, `saldo_pesos`
- 6 precios `precio_dex_*_pesos_mwh` (Dom/Hab/Sab × Valle/Diurna/Pico) — vienen de la fila preámbulo del archivo, replicados.

> **Decisión:** los 6 precios DEx van replicados en cada fila del cliente por simplicidad de uso en marts. El "costo real de la decisión" es `dem_excedente × precio_dex`.

---

### 3.2 Tablas L2 — Económico mensual

#### `dte_resumen_agente` ← parser T2.5 desde `raw_dte`

Tabla **larga** (long format). Una fila por `(agente_nemo, anio, mes, concepto)` para que cada sub-anexo del DTE quede como un concepto.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigserial PK | |
| `anio`, `mes` | int | |
| `agente_nemo` | text(8) | |
| `concepto` | text | enum: `'spot_compra'`, `'spot_venta'`, `'mater_compra'`, `'transp_at'`, `'transp_dt'`, `'sobrecosto_combustible'`, `'cargo_servicios'`, `'cargo_serv_conf'`, `'cargo_comercializ'`, `'cargo_excedente'`, `'reliquidacion'`, `'fondos'`, `'sanciones'`, `'penal_capacidad'`, `'penal_supervision'`, `'cargo_obras'`, `'oym_transporte'`, … |
| `subconcepto` | text | nullable |
| `mwh` | numeric | nullable |
| `pesos` | numeric | nullable (puede ser negativo: crédito) |
| `parser_version` | text | |

**PK natural:** `(anio, mes, agente_nemo, concepto, subconcepto)`.
**Índices:** `(agente_nemo, anio, mes)`, `(concepto, anio, mes)`.

#### `cuenta_corriente_agente` ← parser T2.6 desde `raw_rscj`

Una fila por `(agente_nemo, distribuidor_nemo, anio_semestre, mes_in_semestre)`:

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `distribuidor_nemo` | text(8) |
| `anio_semestre` | int |
| `semestre` | int (1 ó 2) |
| `mes_in_semestre` | int (1..6) |
| `mes_calendario` | int (1..12) |
| `anio_calendario` | int |
| `v_fisico_mwh` | numeric |
| `v_monetario_pesos` | numeric |

**PK natural:** `(agente_nemo, distribuidor_nemo, anio_calendario, mes_calendario)`.

#### `reliquidacion_mensual` ← parser T2.7 desde `raw_aama`

Long format análogo a `dte_resumen_agente` pero con `concepto ∈ {'transporte','penal_capacidad','penal_conexion','penal_equipos','penal_dag_r1','penal_sistema','penal_supervision'}` y campos `mes_origen`/`pesos`/`intereses`.

#### `cargos_comerc_mensual` ← parser T2.15 desde `raw_adco`

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `distribuidor_nemo` | text(8) |
| `anio`, `mes` | int |
| `dem_pesos_mwh_media_mensual` | numeric |
| `dem_mwh_mensual` | numeric |
| `cargo_comercializ_pesos_mwh` | numeric |
| `cargo_comercializ_pesos` | numeric |
| `cargo_administracion_pesos` | numeric |

#### `transporte_concepto_mensual` ← parser T2.3 desde `raw_atra` + `raw_anexo_guma`

Long format: una fila por `(agente_nemo, anio, mes, concepto_transporte)`:

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `anio`, `mes` | int |
| `concepto_transporte` | text | enum: `'perdida_de_transp'`, `'uso_capacidad_at'`, `'uso_capacidad_dt'`, `'energia_transportada'`, `'adic_sist_transp'`, `'reduc_tarifa_peaje'`, `'cargo_oym'`, `'cargo_paftt'`, `'ampliac_at'`, `'ampliac_dt'` |
| `pesos` | numeric |
| `pesos_por_mwh` | numeric (computado: pesos / demanda) |
| `parser_version` | text |

> Esta tabla es el insumo del mart `transporte_forensics_mensual` (T3.7) que permite el ranking por concepto y comparación con la mediana de la zona.

---

### 3.3 Tablas L2 — Mercado a Término

#### `mater_contrato_mensual` ← parser T2.1 desde `raw_anexo_mat` (con fallback `raw_amat`)

Una fila por `(generador_nemo, conjunto_generador, demandante_nemo, comercializador, anio, mes)`:

| Campo | Tipo |
|---|---|
| `generador_nemo` | text(8) |
| `conjunto_generador` | text |
| `demandante_nemo` | text(8) |
| `comercializador` | text |
| `anio`, `mes` | int |
| `energia_valle_mwh` | numeric |
| `energia_resto_mwh` | numeric |
| `energia_pico_mwh` | numeric |
| `energia_total_mwh` | numeric |
| `importe_contrato_pesos` | numeric |
| `precio_efectivo_pesos_mwh` | numeric (computado) |
| `tipo_contrato` | text | enum: `'BASE'`, `'PLUS'`, `'RENOVABLE'`, `'DELIVERY'`, `'COMPROMISO'` (deriva del sub-anexo) |
| `parser_version` | text |

**PK natural:** `(generador_nemo, conjunto_generador, demandante_nemo, comercializador, anio, mes)` (acepta `''` en `comercializador` cuando sea `NULL`).
**Índices:** `(demandante_nemo, anio, mes)` — uso típico desde la perspectiva del cliente; `(generador_nemo, anio, mes)`; `(tipo_contrato, anio, mes)`.

#### `mater_renovable_mensual` ← T2.14 desde `raw_anexo_mat_renovable`

Igual que `mater_contrato_mensual` pero solo con energía total (no se desglosa pico/valle/resto). Permite identificar específicamente los contratos RENMER.

#### `mater_cvt_mensual` ← T2.14 desde `raw_anexo_mat_cvt`

| Campo | Tipo |
|---|---|
| `vendedor_agente` | text(8) |
| `conjunto_generador` | text |
| `comprador_agente` | text(8) |
| `participante_vendedor` | text |
| `participante_comprador` | text |
| `comercializador` | text |
| `anio`, `mes` | int |
| `pot_despachada_mwh` | numeric |
| `cargo_pot_despachada_pesos` | numeric |

---

### 3.4 Tablas L2 — Generación / oferta

#### `generacion_maquina_mensual` ← T2.10 desde `raw_agen` + `raw_anexo_gen111…114` + `raw_anexo_gen13`

Una fila por `(agente_nemo, unidad_comerc, anio, mes)`:

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `unidad_comerc` | text |
| `escala` | text | enum: `'TG'`, `'TV'`, `'CC'`, `'HI'`, `'EO'`, `'FV'`, `'NU'`, `'BA'`, `'BIO'`, `'DI'` |
| `anio`, `mes` | int |
| `tecnologia` | text | enum: `'Termica'`, `'Hidraulica'`, `'Eolica'`, `'Solar'`, `'Nuclear'`, `'Biomasa'`, `'Diesel'` |
| `energia_total_mwh` | numeric |
| `energia_comprometida_mwh` | numeric |
| `energia_remunerada_mwh` | numeric |
| `energia_gas_mwh` | numeric (nullable, sólo térmica) |
| `energia_gas_oil_mwh` | numeric |
| `energia_fuel_oil_mwh` | numeric |
| `energia_biocomb_mwh` | numeric |
| `energia_carbon_mwh` | numeric |
| `energia_hs_pico_mwh` | numeric |
| `pot_disp_mw` | numeric |
| `pot_comprometida_mw` | numeric |
| `digo_mw` | numeric (nullable) |
| `disp_pct` | numeric (nullable) |
| `remun_energia_pesos` | numeric |
| `remun_pot_disp_pesos` | numeric |
| `remun_pot_digo_pesos` | numeric |
| `remun_pot_acuerdos_pesos` | numeric |

#### `disponibilidad_maquina_mensual` ← T2.11 desde `raw_anexo_gen_disp_mejora` + `raw_anexo_generacion_forzada`

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `unidad_comerc` | text |
| `anio`, `mes` | int |
| `pot_comprometida_mw` | numeric |
| `pot_disp_real_mw` | numeric |
| `pot_dispmejorada_mw` | numeric |
| `disp_pct` | numeric |
| `energia_forzada_mwh` | numeric |
| `sobrecosto_combustible_pesos` | numeric |
| `creditos_pesos` | numeric |
| `debitos_pesos` | numeric |

#### `imp_exp_mensual` ← T2.12 desde `raw_aexp`

Una fila por `(agente_nemo, jurisdiccion, anio, mes, tipo)` donde `tipo ∈ {'IMPORTACION','EXPORTACION'}`.

#### `auto_mensual` ← T2.13 desde `raw_auto`

Mismo schema que `guma_detalle_mensual` con la adición de `generacion_autogenerada_mwh` y `tipo_agente='AUTOGEN'`.

---

### 3.5 Tablas L2 — Catálogo / parámetros

#### `cammesa_parametros_mensuales` ← T2.0 + parsers varios

Una fila por `(anio, mes, parametro)` con valores extraídos de las "filas preámbulo" de los archivos:

| Parámetro (ejemplos) | Origen | Unidad |
|---|---|---|
| `precio_spot_pico_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_spot_valle_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_spot_resto_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_energia_adicional_pico_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_servicios_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_recupero_costos_op_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_serv_confiabilidad_pesos_mwh` | preámbulo `AGUM*.txt` | $/MWh |
| `precio_transp_at_pesos_mwh` | preámbulo `ATRA*.txt` | $/MWh |
| `cargo_max_comercializ_pesos_mwh` | preámbulo `ADCO*.txt` | $/MWh |
| `pct_obligatorio_ley_27191` | preámbulo `ADCO*.txt` | % |
| `precio_dex_hab_valle_pesos_mwh` | preámbulo `DEXC*.txt` | $/MWh |
| `precio_dex_hab_diurna_pesos_mwh` | … | $/MWh |
| (etc.) | | |

**PK natural:** `(anio, mes, parametro)`.

> Esta tabla **simplifica todos los marts**: cualquier cálculo que requiera "precio spot del mes" hace `select valor from cammesa_parametros_mensuales where parametro='precio_spot_*' and anio=? and mes=?` en lugar de ir a buscar la fila preámbulo del archivo.

---

## 4. Detalle de la capa L3 (marts)

### 4.1 `factura_sombra_mensual` (T3.1 → pantalla T4.4)

Reconstrucción línea por línea de la factura CAMMESA del agente con desglose por concepto y comparación contra el cargo realmente liquidado.

| Campo | Tipo | Origen / cálculo |
|---|---|---|
| `agente_nemo` | text(8) | |
| `anio`, `mes` | int | |
| `cargo_compra_spot_pesos` | numeric | `guma_detalle_mensual.compra_spot_pesos` |
| `cargo_energ_adic_pesos` | numeric | idem |
| `cargo_serv_pesos` | numeric | idem |
| `cargo_recupero_oper_pesos` | numeric | idem |
| `cargo_serv_conf_pesos` | numeric | idem |
| `cargo_transp_at_pesos` | numeric | idem |
| `cargo_transp_dt_pesos` | numeric | idem |
| `cargo_potencia_pesos` | numeric | idem |
| `cargo_comercializ_pesos` | numeric | idem + `cargos_comerc_mensual` |
| `cargo_excedente_pesos` | numeric | `excedente_mensual.cargo_dex_pesos` |
| `cargo_mater_pesos` | numeric | `Σ mater_contrato_mensual.importe_contrato_pesos WHERE demandante_nemo=agente` |
| `creditos_aama_pesos` | numeric | `Σ reliquidacion_mensual.pesos` |
| `factura_sombra_total_pesos` | numeric | suma de todos los anteriores |
| `factura_real_total_pesos` | numeric | `dte_resumen_agente` filtrado por `concepto` y agregado |
| `desvio_pesos` | numeric | sombra − real |
| `desvio_pct` | numeric | desvio_pesos / factura_real_total_pesos |
| `flag_revisar` | boolean | `abs(desvio_pct) > 1.0` |
| `parser_version` | text | |

**PK natural:** `(agente_nemo, anio, mes)`.

### 4.2 `mater_pnl_contrato_mensual` (T3.2 → T4.5)

Una fila por `(demandante_nemo, generador_nemo, conjunto_generador, anio, mes)`:

| Campo | Tipo | Origen |
|---|---|---|
| `demandante_nemo` | text(8) | mater_contrato_mensual |
| `generador_nemo` | text(8) | idem |
| `conjunto_generador` | text | idem |
| `anio`, `mes` | int | |
| `volumen_contratado_mwh` | numeric | `contratos.volumen_mwh_mes` (CRM) |
| `volumen_real_mwh` | numeric | `mater_contrato_mensual.energia_total_mwh` |
| `desvio_volumen_mwh` | numeric | real − contratado |
| `under_delivery_pct` | numeric | (contratado − real) / contratado |
| `precio_contrato_usd_mwh` | numeric | `contratos.precio_usd_mwh` (CRM) |
| `precio_efectivo_pesos_mwh` | numeric | mater_contrato_mensual |
| `precio_spot_pesos_mwh` | numeric | cammesa_parametros_mensuales (promedio bandas) |
| `ahorro_vs_spot_pesos` | numeric | `volumen_real * (precio_spot − precio_contrato_pesos)` |
| `tecnologia` | text | join `cammesa_potencia_instalada` por `generador_nemo` |
| `factor_capacidad_pct` | numeric | `volumen_real / (potencia_instalada * horas_mes)` |
| `flag_under_delivery` | boolean | `under_delivery_pct > 5%` |

### 4.3 `curva_costo_marginal_horaria` (T3.3 → T4.6)

> Esta es la única L3 con granularidad horaria. **No depende de los `raw_*`** sino de las series tiempo ya cargadas (`cammesa_generacion`, `cammesa_combustibles`).

| Campo | Tipo |
|---|---|
| `fecha_hora` | timestamp |
| `demanda_total_mw` | numeric |
| `gen_termico_mw` | numeric |
| `gen_hidro_mw` | numeric |
| `gen_renov_mw` | numeric |
| `gen_nuclear_mw` | numeric |
| `gen_importacion_mw` | numeric |
| `tecnologia_marginal` | text | enum: `'Hidro'`,`'CC Gas'`,`'TG Gas'`,`'TV Carbon'`,`'TG GasOil'`,`'TG Fuel'` |
| `costo_marginal_estim_usd_mwh` | numeric |
| `precio_spot_publicado_usd_mwh` | numeric (nullable) |

### 4.4 `exposicion_spot_mensual` (T3.4 → T4.7)

Por agente y mes:

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `anio`, `mes` | int |
| `demanda_total_mwh` | numeric |
| `mater_mwh` | numeric (suma `mater_contrato_mensual` para el agente) |
| `mat_base_mwh` | numeric |
| `acuerdo_mensual_mwh` | numeric (CRM `empresas.acuerdo_mensual_mwh`) |
| `spot_legitimo_mwh` | numeric (max(0, demanda - mater - acuerdo)) |
| `excedente_pico_mwh` | numeric (excedente_mensual) |
| `excedente_valle_mwh` | numeric |
| `excedente_resto_mwh` | numeric |
| `cargo_spot_pesos` | numeric |
| `cargo_excedente_pesos` | numeric |
| `cargo_excedente_evitable_pesos` | numeric (con derating del 10 % de la pico) |

### 4.5 `peer_benchmark_mensual` (T3.5 → T4.8)

Tabla con percentiles (no por agente):

| Campo | Tipo |
|---|---|
| `tipo_agente` | text (`GUMA`,`GUME`,`GUDI`) |
| `region` | text |
| `tarifa` | text |
| `anio`, `mes` | int |
| `n_agentes` | int |
| `demanda_p25_mwh` | numeric |
| `demanda_p50_mwh` | numeric |
| `demanda_p75_mwh` | numeric |
| `mater_pct_p25` | numeric |
| `mater_pct_p50` | numeric |
| `mater_pct_p75` | numeric |
| `costo_monomico_p25_pesos_mwh` | numeric |
| `costo_monomico_p50_pesos_mwh` | numeric |
| `costo_monomico_p75_pesos_mwh` | numeric |

### 4.6 `mater_pricing_index_mensual` (T3.6 → T4.9)

Por mes y tecnología:

| Campo | Tipo |
|---|---|
| `anio`, `mes` | int |
| `tecnologia` | text |
| `n_contratos` | int |
| `volumen_total_mwh` | numeric |
| `precio_p25_pesos_mwh` | numeric |
| `precio_p50_pesos_mwh` | numeric |
| `precio_p75_pesos_mwh` | numeric |
| `precio_promedio_ponderado_pesos_mwh` | numeric |

### 4.7 `transporte_forensics_mensual` (T3.7 → T4.10)

Por agente, mes y concepto. Pivote de `transporte_concepto_mensual` con comparativa a la mediana de la zona.

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `zona_transporte` | text |
| `anio`, `mes` | int |
| `concepto_transporte` | text |
| `pesos` | numeric |
| `pesos_por_mwh` | numeric |
| `pesos_por_mwh_mediana_zona` | numeric |
| `desvio_vs_mediana_pct` | numeric |
| `flag_outlier` | boolean (>15 % vs mediana) |

### 4.8 `disponibilidad_generador_mensual` (T3.8 → T4.11)

Por agente cliente y generador contratado:

| Campo | Tipo |
|---|---|
| `cliente_empresa_id` | uuid |
| `generador_nemo` | text(8) |
| `unidad_comerc` | text |
| `anio`, `mes` | int |
| `factor_capacidad_pct` | numeric |
| `disp_declarada_pct` | numeric |
| `disp_realizada_pct` | numeric |
| `desvio_disp_pp` | numeric |
| `horas_forzadas` | int |
| `score_salud` | numeric (0..100) |
| `flag_alerta` | boolean |

### 4.9 `compliance_renovable_mensual` (T3.9 → T4.14)

| Campo | Tipo |
|---|---|
| `agente_nemo` | text(8) |
| `anio`, `mes` | int |
| `demanda_total_mwh` | numeric |
| `mater_renovable_mwh` | numeric |
| `pct_renovable_mes` | numeric |
| `pct_renovable_ytd` | numeric |
| `pct_objetivo_ley_27191` | numeric (de `cammesa_parametros_mensuales`) |
| `cumple` | boolean |
| `cargo_incumplimiento_estim_pesos` | numeric (cuando no cumple) |

### 4.10 `combustibles_vs_spot_mensual` y `imp_exp_impacto_mensual` (T3.10/T3.11)

Marts agregados a nivel país (no por agente cliente). Útiles para pantallas de mercado del Module 3 actual y para el "MATER Pricing Index".

---

## 5. Migración de `datos_mensuales` (deuda técnica)

`datos_mensuales` hoy es la única vista que consume `AdminModule1-4`. Se mantiene **por compatibilidad** pero se repuebla desde L2:

```
datos_mensuales (anio, mes, empresa_id, demanda_total_mwh, mater_mwh, spot_mwh, ...)
   ↑ rebuild_datos_mensuales(_anio, _mes)
   │
   ├── guma_detalle_mensual / gume_detalle_mensual (demanda)
   ├── mater_contrato_mensual (suma por demandante = empresa.nemo)
   ├── transporte_concepto_mensual (cargo_transporte_pesos_mwh)
   ├── excedente_mensual (spot_mwh = legitimo + excedente)
   └── cammesa_parametros_mensuales (precios, %ren obj)
```

Esta función queda como **T3.0** (bloqueante de los marts L3 de Nivel 1 que también la usen como fuente intermedia).

---

## 6. Convenciones de migrations y código

### 6.1 Una migration por tabla L2 / L3

Para no acumular cambios de schema enormes, cada tabla L2/L3 tiene **su propia migration**:

```
supabase/migrations/
  YYYYMMDD000010_l2_guma_detalle_mensual.sql
  YYYYMMDD000020_l2_gume_detalle_mensual.sql
  ...
  YYYYMMDD010010_l2_helpers_parse_es_number.sql   ← T2.0
  ...
  YYYYMMDD020010_l3_factura_sombra_mensual.sql    ← T3.1
  ...
```

### 6.2 Funciones `refresh_*` versionadas

```sql
-- Ejemplo: refresh_guma_detalle_mensual
create or replace function public.refresh_guma_detalle_mensual(_anio int, _mes int)
returns table (rows_inserted int, rows_skipped int, parser_version text)
language plpgsql
as $$
declare
  v_parser_version text := 'guma_detalle_v1';
  v_inserted int;
  v_skipped int;
begin
  delete from public.guma_detalle_mensual
   where anio = _anio and mes = _mes
     and parser_version <> v_parser_version;

  insert into public.guma_detalle_mensual (...)
  select ...
    from public.raw_anexo_guma raw
   where raw.anio = _anio and raw.mes = _mes
     and raw.section_index = 2 and raw.col_count = 31  -- discriminador
     and raw.col_001 not in ('Agente', 'AGENTE')        -- descarta header
  on conflict (anio, mes, agente_nemo, distribuidor_nemo)
  do update set ...
  returning 1 into v_inserted;

  return query select v_inserted, v_skipped, v_parser_version;
end;
$$;
```

### 6.3 Política RLS

- **L1 (`raw_*`):** `select_authenticated` libre + `admin_all` con `is_admin()`. Convención ya existente.
- **L2 (semánticas):** `select_authenticated` libre. Cualquier user logueado lee. La privacidad por cliente se aplica en L3.
- **L3 (marts):** depende de la mart:
  - **Por agente** (factura_sombra, mater_pnl, etc.) → policy `using (exists (select 1 from public.empresas e join public.nemos n on n.empresa_id=e.id where e.user_id=auth.uid() and n.nemo=mart.agente_nemo))`.
  - **Globales** (peer_benchmark, mater_pricing_index, curva_costo_marginal) → libres pero con feature flag por plan: `using (true)` + chequeo en código según `empresas.plan_activo`.

---

## 7. Orden de ejecución (Fase 2 + Fase 3)

```
T2.0  helpers (parse_es_number, parse_es_date, nemo_from)        🔒 prerrequisito
   │
   ├── T2.1  mater_contrato_mensual          ─┐
   ├── T2.2  guma_detalle_mensual             │
   ├── T2.3  transporte_concepto_mensual      │  paralelos
   ├── T2.4  excedente_mensual                │
   ├── T2.5  dte_resumen_agente               │
   ├── T2.6  cuenta_corriente_agente          │
   ├── T2.7  reliquidacion_mensual            │
   ├── T2.8  gume_detalle_mensual             │
   ├── T2.9  gudi_detalle_mensual             │
   ├── T2.10 generacion_maquina_mensual       │
   ├── T2.11 disponibilidad_maquina_mensual   │
   ├── T2.12 imp_exp_mensual                  │
   ├── T2.13 auto_mensual                     │
   ├── T2.14 mater_renovable_mensual + cvt    │
   └── T2.15 cargos_comerc_mensual           ─┘

T3.0 rebuild_datos_mensuales (depende T2.1, T2.2, T2.3, T2.4, T2.15)   🔒
   │
   ├── T3.1  factura_sombra_mensual    (T2.5+T2.6+T2.3+T2.4+T2.7)
   ├── T3.2  mater_pnl_contrato_mensual (T2.1+T2.14+contratos)
   ├── T3.3  curva_costo_marginal_horaria (cammesa_generacion+combustibles)
   ├── T3.4  exposicion_spot_mensual (T2.4+T2.2+T2.1)
   ├── T3.5  peer_benchmark_mensual (cammesa_demanda_historica+T2.5)
   ├── T3.6  mater_pricing_index_mensual (T2.1+T2.14+potencia_instalada)
   ├── T3.7  transporte_forensics_mensual (T2.3)
   ├── T3.8  disponibilidad_generador_mensual (T2.10+T2.11+contratos)
   ├── T3.9  compliance_renovable_mensual (T2.1+T2.14+T2.5)
   ├── T3.10 combustibles_vs_spot_mensual
   └── T3.11 imp_exp_impacto_mensual
```

---

## 8. Mapeo final L3 → oportunidad de cruza

Recordatorio (correlación con el [primer informe](#)):

| Oportunidad | Nivel | Mart L3 | Tarea Fase 4 |
|---|---|---|---|
| 1.1 Factura-sombra DTE | 🔴 | factura_sombra_mensual | T4.4 |
| 1.2 MATER P&L | 🔴 | mater_pnl_contrato_mensual | T4.5 |
| 1.3 Curva costo marginal | 🔴 | curva_costo_marginal_horaria | T4.6 |
| 1.4 Exposición Spot/DEXC | 🔴 | exposicion_spot_mensual | T4.7 |
| 2.1 Peer Benchmark | 🟡 | peer_benchmark_mensual | T4.8 |
| 2.2 MATER Pricing Index | 🟡 | mater_pricing_index_mensual | T4.9 |
| 2.3 Transporte Forensics | 🟡 | transporte_forensics_mensual | T4.10 |
| 2.4 Disponibilidad generador | 🟡 | disponibilidad_generador_mensual | T4.11 |
| 3.1 Combustibles vs spot | 🟢 | combustibles_vs_spot_mensual | T4.12 |
| 3.2 Imp/Exp impacto | 🟢 | imp_exp_impacto_mensual | T4.13 |
| 3.3 Forecast demanda+clima | 🟢 | (proyecto aparte, requiere curva propia) | T4.15 |
| 3.4 Compliance Ley 27.191 | 🟢 | compliance_renovable_mensual | T4.14 |

---

## 9. Decisiones tomadas que afectan implementación

1. **Particionar `raw_dte` y `raw_dexc` por `anio`** (las únicas con > 1 M filas locales). Resto sin partición.
2. **HTML > TXT** cuando ambos existen. El parser de `mater_contrato_mensual` prefiere `raw_anexo_mat` y cae a `raw_amat` solo si el primero está vacío para ese mes (ocurre en algunos meses 2021-2022).
3. **Long format vs wide format.** Las tablas con conceptos heterogéneos (`dte_resumen_agente`, `transporte_concepto_mensual`, `reliquidacion_mensual`) van en **long format** (filas con `concepto`/`pesos`). El resto es **wide** (una columna por métrica) para facilitar lectura desde la UI.
4. **`cammesa_parametros_mensuales`** se carga **antes** de los marts: cualquier mart que necesite "precio spot del mes" lo lee de ahí, no de los archivos.
5. **`parser_version`** en cada fila L2/L3 → permite invalidar y regenerar sin perder histórico de qué versión calculó cada cosa.
6. **`procesado_en` timestamptz** en cada fila L2/L3 → trazabilidad operacional.
7. **Refrescos:** cada `refresh_*` recibe `(_anio, _mes)`. Una **cron mensual** (T5.4) llama a todos los `refresh_*` después del cierre de la ingesta.
8. **`datos_mensuales` legacy se mantiene** (no se elimina) para no romper Modules 1-4 actuales — pero se repuebla desde L2 vía `rebuild_datos_mensuales`.
9. **`raw_atra` no se asume existente en remoto.** Aunque hay migration local (`20260426123000`), T0.2 verificó que Supabase remoto no expone `public.raw_atra`; T1.1 debe aplicar esa migration o incluir `raw_atra` en el grupo DTE-base antes de cargar transporte.
10. **Cobertura por tabla, no regla universal.** `raw_aama`, `raw_gudi`, `raw_rscj` y algunos anexos de generación tienen cobertura parcial esperada; `ingest_health` debe validar contra reglas por tabla para evitar falsos positivos.

---

## 10. Checklist de cierre de T0.3

- [x] 3 capas definidas (L1 → L2 → L3 → UI).
- [x] 18 tablas L2 listadas con esquema y origen.
- [x] 11 marts L3 listadas con esquema y dependencias.
- [x] Convenciones (clave canónica `(agente_nemo, anio, mes)`, `parser_version`, RLS por capa).
- [x] Mapping L3 → oportunidad de cruza → tarea Fase 4.
- [x] Orden de ejecución T2.0 → T2.x → T3.0 → T3.x → T4.x trazado.
- [x] Decisiones arquitectónicas documentadas para que los chats hijos no las re-discutan.
- [x] Plan de migrations (1 archivo por tabla L2/L3).
