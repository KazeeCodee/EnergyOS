# EnergyOS - Documento tecnico de escenarios de ahorro anual

Fecha de corte: 2026-05-07

Este documento define como comprobar, con datos y formulas auditables, los
escenarios de ahorro anual que EnergyOS puede defender comercialmente para
Grandes Usuarios del MEM argentino.

## 1. Conclusion ejecutiva

El claim "un Gran Usuario chico puede ahorrar USD 25.000 anuales sin contar
multas" es defendible como escenario conservador si se cumplen estas
condiciones:

- El cliente es un GU chico comercializable, no el minimo legal absoluto. En
  este documento se modela como 5-10 GWh/anio; el caso base usa 6 GWh/anio.
- El gasto energetico anual ronda USD 400.000-800.000.
- EnergyOS captura o permite negociar entre 3% y 5% del gasto anual, o combina
  una oportunidad energetica menor con ahorro operativo/consultoria evitada.
- La oportunidad se valida por NEMO con 12 meses de datos CAMMESA antes de
  presentarla como ahorro especifico.

No debe venderse como "ahorro garantizado" sin correr el diagnostico por NEMO.
La forma correcta es:

> EnergyOS cuesta USD 8.000/anio. En un GU chico, si detecta y captura apenas
> USD 25.000/anio en oportunidades de DTE, spot, cobertura y gestion, el cliente
> recupera 3,1x el fee anual, sin contar multas renovables.

## 2. Estado de evidencia por modulo

| Modulo / funcion | Estado factual | Dato que EnergyOS ya calcula | Uso en ROI sin multas |
|---|---|---|---|
| Auditoria DTE / Costos MEM | Verde | `factura_total_pesos`, `importe_revisable_pesos`, `estado_auditoria` en `vw_factura_dte_resumen_mensual` | Mide importes revisables. No garantiza recupero, pero cuantifica pesos a revisar. |
| Exposicion spot / cobertura | Verde | `compra_spot_mwh`, `spot_pesos`, `pct_spot`, `sub_contrato_mwh`, `costo_spot_promedio_pesos_mwh` en `vw_exposicion_spot_mensual` | Mide riesgo spot y volumen potencialmente gestionable. |
| Perfil de carga / benchmark | Verde para diagnostico, amarillo para ahorro | `pct_pico`, `pct_valle`, `ratio_pico_valle`, percentiles en `vw_factor_carga_mensual` y `vw_factor_carga_benchmark` | Detecta concentracion en horas caras. Para convertir a USD requiere spread horario aplicable. |
| Cumplimiento Ley 27.191 | Verde | `brecha_mwh`, `brecha_ytd_mwh`, `multa_estimada_pesos`, `cumple_ytd` en `vw_compliance_27191_mensual` | No se incluye en la tabla "sin multas". Sirve para ROI separado con multas. |
| Factura sombra completa | Amarillo | Mart previsto `factura_sombra_mensual`; la auditoria DTE actual ya cubre parte del caso | Cuando este cerrado permite comparar factura reconstruida vs DTE real por concepto. |
| MATER P&L por contrato | Amarillo/Rojo | Mart previsto `mater_pnl_contrato_mensual` | No usar como claim factico hasta cargar contratos/precios y cerrar el mart. |
| Consultoria/reportes evitados | Amarillo | No es dato CAMMESA; depende del costo actual del cliente | Puede incluirse si el cliente hoy paga consultora, analista o reportes manuales. |

Semaforo:

- Verde: existe formula y dato productivo auditable en el sistema.
- Amarillo: existe diagnostico o diseno, pero requiere supuesto externo o cierre
  de modulo.
- Rojo: no usar como ahorro factico todavia.

## 3. Fuentes factuales

### 3.1. Fuente legal Ley 27.191

La Ley 27.191 establece el objetivo de consumo renovable y el regimen de
penalidad para Grandes Usuarios. Los hitos del Art. 8 llevan el consumo minimo
renovable al 20% al 31/12/2025. El Art. 11 indica que, ante incumplimiento, los
faltantes se abonan a un precio equivalente al CVP de generacion con gasoil
importado, promedio ponderado de los 12 meses del anio calendario anterior.

Fuente oficial: https://www.argentina.gob.ar/normativa/nacional/ley-27191-253626/texto

### 3.2. Fuente CAMMESA

CAMMESA publica informacion del MEM con variables fisicas y economicas:
demanda, oferta, generacion, combustibles, costos y precios de energia. Tambien
publica bases de datos asociadas y reportes de Grandes Usuarios.

Fuentes oficiales:

- Informes y estadisticas CAMMESA: https://cammesaweb.cammesa.com/informes-y-estadisticas/
- Resumen DTE MEM: https://cammesaweb.cammesa.com/download/resumen-dte-mem-33/
- Variables relevantes del MEM, resumen anual: https://cammesaweb.cammesa.com/variables-relevantes-del-mem-resumen-anual/
- VMargo / precios orientativos CAMMESA: https://cammesaweb.cammesa.com/vmargores400/

### 3.3. Evidencia interna EnergyOS

Los calculos principales estan documentados en:

- `docs/auditoria_calculos.md`
- `docs/kpi_catalog.md`
- `scripts/sql/railway_auditoria_dte.sql`
- `scripts/sql/railway_exposicion_spot_mat.sql`
- `scripts/sql/railway_factor_carga.sql`
- `scripts/sql/railway_compliance_27191.sql`

## 4. Modelo economico base

### 4.1. Cliente chico comercializable

| Variable | Caso base |
|---|---:|
| Consumo anual | 6.000 MWh/anio |
| Rango de sensibilidad | 5.000-10.000 MWh/anio |
| Costo energetico promedio usado para sensibilidad | USD 80-120/MWh |
| Gasto energetico anual aproximado | USD 480.000-720.000 |
| Fee anual EnergyOS | USD 8.000 |
| Ahorro objetivo conservador | USD 25.000/anio |

Nota critica: el minimo legal de 300 kW puede consumir bastante menos que 5
GWh/anio segun factor de uso. Para esos clientes minimos, USD 25.000/anio sin
multas puede ser alto. El claim aplica mejor a un GU chico con consumo anual de
al menos 5 GWh o con desorden claro en spot/DTE/gestion.

### 4.2. Payback

| Metrica | Formula | Resultado |
|---|---|---:|
| ROI bruto sobre fee | `25.000 / 8.000` | 3,1x |
| Ganancia neta cliente | `25.000 - 8.000` | USD 17.000 |
| Payback | `8.000 / 25.000 * 12` | 3,8 meses |
| Ahorro requerido sobre gasto de USD 480k | `25.000 / 480.000` | 5,2% |
| Ahorro requerido sobre gasto de USD 720k | `25.000 / 720.000` | 3,5% |

Interpretacion: el caso de USD 25.000/anio no exige encontrar una anomalia
gigante. Exige capturar entre 3,5% y 5,2% del gasto energetico anual de un GU
chico de 6 GWh/anio.

## 5. Palancas de ahorro sin contar multas

### 5.1. Auditoria DTE / importes revisables

Dato EnergyOS:

```sql
select
  nemo,
  anio,
  mes,
  factura_total_pesos,
  subtotal_conceptos_pesos,
  desvio_reconciliacion_pesos,
  importe_revisable_pesos,
  estado_auditoria
from public.vw_factura_dte_resumen_mensual
where nemo = :nemo
order by anio desc, mes desc;
```

Formula economica:

```text
ahorro_dte_usd =
  sum(importe_revisable_pesos_12m) / fx_ars_usd * tasa_recupero
```

La tasa de recupero no es un dato CAMMESA. Debe definirse comercialmente. Para
un caso conservador usar 20%-40% del importe revisable, porque no todo importe
revisable se recupera como reclamo.

Estado factual: EnergyOS prueba el importe revisable. El recupero solo queda
probado cuando el cliente efectivamente evita o recupera ese monto.

### 5.2. Exposicion spot y cobertura

Dato EnergyOS:

```sql
select
  nemo,
  anio,
  mes,
  demanda_real_mwh,
  compra_spot_mwh,
  pct_spot,
  sub_contrato_mwh,
  spot_pesos,
  costo_spot_promedio_pesos_mwh
from public.vw_exposicion_spot_mensual
where nemo = :nemo
order by anio desc, mes desc;
```

Formula economica:

```text
ahorro_spot_usd =
  mwh_spot_reducible * spread_evitado_usd_mwh

mwh_spot_reducible =
  min(compra_spot_mwh, sub_contrato_mwh) * porcentaje_realista_de_captura
```

Ejemplo de umbral:

| Variable | Valor |
|---|---:|
| Compra spot anual | 1.200 MWh |
| Captura realista | 50% |
| MWh gestionables | 600 MWh |
| Spread evitado | USD 15/MWh |
| Ahorro spot | USD 9.000 |

Estado factual: EnergyOS mide `compra_spot_mwh`, `sub_contrato_mwh` y costo
spot. El spread evitado debe compararse contra alternativa real: nuevo contrato,
renegociacion, cobertura MATER o decision operativa.

### 5.3. Perfil de carga

Dato EnergyOS:

```sql
select
  nemo,
  anio,
  mes,
  pct_pico,
  pct_valle,
  pct_resto,
  ratio_pico_valle,
  pct_pico_percentil
from public.vw_factor_carga_mensual
where nemo = :nemo
order by anio desc, mes desc;
```

Formula economica:

```text
ahorro_perfil_usd =
  mwh_corribles_de_pico * spread_pico_valle_usd_mwh
```

Estado factual: EnergyOS prueba si el cliente esta concentrado en pico y como
se compara contra pares. La monetizacion requiere precio horario/banda o cargo
aplicable al cliente.

### 5.4. MATER / contrato

Estado actual: no usar como claim factico cerrado hasta completar
`mater_pnl_contrato_mensual` y cargar contratos/precios. El diseno existe, pero
la prueba por cliente necesita:

- precio de contrato,
- volumen comprometido,
- volumen abastecido real,
- spot/costo alternativo,
- under-delivery.

Formula prevista:

```text
ahorro_mater_usd =
  volumen_real_mwh * (precio_spot_o_alternativo_usd_mwh - precio_contrato_usd_mwh)
```

## 6. Escenario conservador: USD 25k/anio sin multas

Caso base: GU chico de 6 GWh/anio, gasto energetico anual aproximado USD
510.000, fee anual EnergyOS USD 8.000.

| Palanca | Evidencia requerida | Supuesto conservador | Ahorro anual |
|---|---|---:|---:|
| Auditoria DTE | `importe_revisable_pesos` positivo y recuperable | 0,8% del gasto anual | USD 4.080 |
| Exposicion spot / cobertura | spot y subcontrato detectados | 2,0% del gasto anual | USD 10.200 |
| Perfil de carga | percentil pico alto + spread aplicable | 1,0% del gasto anual | USD 5.100 |
| Menos reportes/consultoria manual | costo actual validado con cliente | costo evitado parcial | USD 6.000 |
| **Total bruto** |  |  | **USD 25.380** |
| Fee EnergyOS |  |  | **-USD 8.000** |
| **Beneficio neto cliente** |  |  | **USD 17.380** |

Lectura: USD 25k/anio es matematicamente alcanzable si se captura cerca del 4%
del gasto energetico anual mas una reduccion operativa moderada. No requiere
contar multas.

## 7. Escenarios por tamanio, sin multas

| Tamanio cliente | Consumo anual modelado | Gasto anual modelado | Ahorro conservador | Ahorro realista | Ahorro optimista |
|---|---:|---:|---:|---:|---:|
| Micro GU / minimo legal | 1,5-3 GWh | USD 120k-360k | USD 8k-20k | USD 15k-35k | USD 25k-50k |
| GU chico comercializable | 5-10 GWh | USD 400k-1,2M | USD 25k-45k | USD 45k-70k | USD 70k-100k |
| GU mediano | 20-50 GWh | USD 1,6M-6M | USD 80k-180k | USD 180k-350k | USD 350k-600k |
| GU grande | 100+ GWh | USD 8M+ | USD 300k-700k | USD 700k-1,3M | USD 1,3M+ |

Recomendacion comercial: decir "desde USD 25k/anio en un GU chico
comercializable" es mas defendible que decir "el mas chico del mercado siempre
ahorra USD 25k/anio".

## 8. Escenario con multas Ley 27.191

Este bloque se mantiene separado porque puede dominar el ROI.

Dato EnergyOS:

```sql
select
  nemo,
  anio,
  mes,
  demanda_ytd_mwh,
  renovable_ytd_mwh,
  obligacion_pct,
  brecha_ytd_mwh,
  multa_estimada_pesos,
  multa_metodo,
  cumple_ytd
from public.vw_compliance_27191_mensual
where nemo = :nemo
order by anio desc, mes desc;
```

Formula:

```text
multa_estimada_pesos = brecha_mwh * multa_ref_pesos_mwh
```

Este ahorro solo existe si el cliente tiene brecha renovable y corrige antes de
la penalidad. Para clientes que ya cumplen, el valor de esta palanca es USD 0.

## 9. Query de validacion para un NEMO

Esta query produce un diagnostico de ROI sin multas. Requiere definir tipo de
cambio y supuestos de captura.

```sql
with params as (
  select
    :nemo::text as nemo,
    :fx_ars_usd::numeric as fx_ars_usd,
    0.30::numeric as tasa_recupero_dte,
    0.50::numeric as pct_spot_capturable,
    15::numeric as spread_spot_usd_mwh,
    0.10::numeric as pct_pico_corrible,
    10::numeric as spread_pico_valle_usd_mwh,
    6000::numeric as ahorro_operativo_usd,
    8000::numeric as fee_energyos_usd
),
dte as (
  select
    sum(coalesce(importe_revisable_pesos, 0)) as importe_revisable_pesos
  from public.vw_factura_dte_resumen_mensual d
  join params p on p.nemo = d.nemo
  where make_date(d.anio, d.mes, 1) >= date_trunc('month', current_date) - interval '12 months'
),
spot as (
  select
    sum(coalesce(compra_spot_mwh, 0)) as compra_spot_mwh,
    sum(coalesce(sub_contrato_mwh, 0)) as sub_contrato_mwh
  from public.vw_exposicion_spot_mensual e
  join params p on p.nemo = e.nemo
  where make_date(e.anio, e.mes, 1) >= date_trunc('month', current_date) - interval '12 months'
),
perfil as (
  select
    sum(coalesce(demanda_real_pico_mwh, 0)) as demanda_pico_mwh
  from public.vw_factor_carga_mensual f
  join params p on p.nemo = f.nemo
  where make_date(f.anio, f.mes, 1) >= date_trunc('month', current_date) - interval '12 months'
)
select
  round((d.importe_revisable_pesos / p.fx_ars_usd) * p.tasa_recupero_dte, 0) as ahorro_dte_usd,
  round(least(s.compra_spot_mwh, s.sub_contrato_mwh) * p.pct_spot_capturable * p.spread_spot_usd_mwh, 0) as ahorro_spot_usd,
  round(per.demanda_pico_mwh * p.pct_pico_corrible * p.spread_pico_valle_usd_mwh, 0) as ahorro_perfil_usd,
  p.ahorro_operativo_usd,
  round(
    (d.importe_revisable_pesos / p.fx_ars_usd) * p.tasa_recupero_dte
    + least(s.compra_spot_mwh, s.sub_contrato_mwh) * p.pct_spot_capturable * p.spread_spot_usd_mwh
    + per.demanda_pico_mwh * p.pct_pico_corrible * p.spread_pico_valle_usd_mwh
    + p.ahorro_operativo_usd
  , 0) as ahorro_bruto_usd,
  p.fee_energyos_usd,
  round(
    (d.importe_revisable_pesos / p.fx_ars_usd) * p.tasa_recupero_dte
    + least(s.compra_spot_mwh, s.sub_contrato_mwh) * p.pct_spot_capturable * p.spread_spot_usd_mwh
    + per.demanda_pico_mwh * p.pct_pico_corrible * p.spread_pico_valle_usd_mwh
    + p.ahorro_operativo_usd
    - p.fee_energyos_usd
  , 0) as beneficio_neto_cliente_usd
from params p
cross join dte d
cross join spot s
cross join perfil per;
```

## 10. Reglas de uso comercial

Claims permitidos:

- "EnergyOS identifica oportunidades de ahorro en DTE, spot, cobertura, perfil
  de carga y cumplimiento renovable."
- "En un GU chico comercializable, un escenario conservador de USD 25k/anio sin
  multas requiere capturar aproximadamente 3,5%-5,2% del gasto energetico anual."
- "Con un fee de USD 8k/anio, USD 25k de ahorro bruto implica ROI de 3,1x y
  payback menor a 4 meses."
- "El valor por multas 27.191 se calcula por separado y solo aplica si hay
  brecha renovable."

Claims que no deben usarse sin diagnostico:

- "Todos los clientes chicos ahorran USD 25k."
- "EnergyOS garantiza recupero de importes revisables."
- "El modulo MATER P&L ya prueba ahorros por contrato" hasta cerrar el mart y
  cargar contratos reales.
- "El ahorro por perfil de carga es automatico" sin validar operacion,
  posibilidad de corrimiento y precio aplicable.

## 11. Proximo paso para comprobar facticamente

Para convertir este documento en prueba por cliente:

1. Seleccionar 5-10 NEMOs representativos: micro, chico, mediano y grande.
2. Correr la query de validacion con 12 meses reales.
3. Separar oportunidad detectada de ahorro capturado.
4. Guardar evidencia por NEMO: DTE, exposicion spot, perfil de carga,
   cumplimiento y supuestos usados.
5. Crear una tabla `roi_validaciones` con diagnostico, fecha, supuestos y
   resultado para que el claim comercial quede respaldado por casos reales.

