# Data Room Cliente EnergyOS - Diseno Estrategico

## Objetivo

Crear una capa privada de datos del cliente que complemente los datos publicos de
CAMMESA y le de al Analizador EnergyOS materia prima contractual, documental y
operativa. La capa debe pedir datos en formatos controlados, no depender de PDFs
heterogeneos, y mantener documentos como evidencia vinculada a campos
estructurados.

## Decision Principal

Los documentos no son la base de datos. Los documentos son respaldo.

El sistema debe pedir campos normalizados por dominio:

- sitios y puntos de suministro;
- contratos MATER, PPA y distribuidora;
- precios, formulas, vencimientos y clausulas;
- facturas, DTE y liquidaciones;
- potencia contratada y maxima demandada;
- presupuesto, forecast y provisiones;
- reclamos abiertos;
- SMEC, auditorias y observaciones;
- responsables internos y fechas limite;
- documentos PDF/Excel vinculados como evidencia.

## Ubicacion En Producto

La pantalla debe llamarse `Mi empresa` o `Data Room`, no `Usuarios`.

`Usuarios` queda reservado para personas que acceden al sistema. `Mi empresa`
representa el activo de datos privado de la compania.

Ruta sugerida:

```text
/app/empresa
```

Navegacion interna:

```text
Resumen
Sitios
Contratos
Facturas
Forecast
Reclamos
SMEC / Auditorias
Responsables
Documentos
```

## Arquitectura De Datos

EnergyOS mantiene dos familias:

```text
Supabase -> Auth/login, perfil minimo y vinculo usuario/NEMO
Railway -> warehouse CAMMESA + datos privados del cliente + marts premium
```

Los datos privados del cliente deben vivir en Railway Postgres, no en Supabase.
Supabase queda como fuente de identidad. Las APIs/edge functions validan el JWT,
obtienen los NEMOs autorizados del usuario y recien ahi leen/escriben Railway.

El contrato privado no reemplaza `mater_contrato_mensual`. Lo complementa.

```text
CAMMESA dice: energia real entregada por mes.
Cliente dice: precio pactado, energia pactada, formula, clausulas y vigencia.
EnergyOS calcula: P&L, under-delivery, cobertura, vencimientos y riesgo.
```

## Modelo Privado Target

Crear tablas nuevas en Railway. No modificar `raw_*`, L2 CAMMESA ni
`mater_contrato_mensual` para guardar datos privados. Esas tablas siguen siendo
la capa de datos publicos/mercado. La integracion ocurre en marts o vistas
premium.

Schema recomendado:

```text
client_private
```

Tablas principales en Railway:

```text
client_private.sites
client_private.supply_points
client_private.contracts
client_private.contract_versions
client_private.contract_supply_points
client_private.contract_monthly_commitments
client_private.contract_price_terms
client_private.contract_clauses
client_private.documents
client_private.document_links
client_private.invoice_imports
client_private.invoice_lines
client_private.forecasts
client_private.claims
client_private.audit_observations
client_private.responsibles
client_private.tasks
```

Todas las tablas privadas deben estar filtradas por `nemo`, `organization_id`
o ambos. Como Railway no recibe directamente el contexto `auth.uid()` de
Supabase, la autorizacion principal debe vivir en la capa API:

```text
frontend -> Supabase JWT -> edge/API -> validar NEMOs autorizados -> Railway
```

Ninguna pantalla del frontend debe escribir directo en Railway ni confiar en un
NEMO enviado por el cliente sin validarlo contra la sesion.

## Formatos Canonicos

```text
Fecha: YYYY-MM-DD
Periodo: YYYY-MM
NEMO: texto de 8 caracteres
Energia: MWh
Potencia: MW
Precio energia: USD/MWh o ARS/MWh
Moneda: ARS o USD
Estados: enums cerrados
```

Regla monetaria:

```text
valor_original
moneda_original
valor_ars_normalizado
valor_usd_normalizado
tipo_cambio_usado
fuente_tipo_cambio
fecha_tipo_cambio
```

Para contratos MATER, la moneda canonica de analisis es `USD/MWh`.
Para facturas, DTE y liquidaciones, la moneda canonica de carga es `ARS`.

## Contrato MATER Como Formulario Ancla

Campos minimos:

```text
nombre_contrato
tipo_contrato: BASE / PLUS / RENOVABLE / DELIVERY / COMPROMISO / OTRO
estado: borrador / activo / vencido / rescindido / en_revision
demandante_nemo
generador_nemo
conjunto_generador
comercializador_nemo
sitios_cubiertos
vigencia_inicio
vigencia_fin
fecha_firma
energia_contratada_mwh_mes
energia_contratada_mwh_anio
potencia_contratada_mw
moneda_precio
precio_base
tipo_precio: fijo / indexado / por_banda / escalonado / formula
renovable
tecnologia
responsable_interno
documento_respaldo
```

Campos avanzados:

```text
energia_pico_mwh_mes
energia_valle_mwh_mes
energia_resto_mwh_mes
tolerancia_entrega_pct
take_or_pay_pct
minimo_entrega_mwh
maximo_entrega_mwh
penalidad_under_delivery
penalidad_rescision
preaviso_rescision_dias
fecha_limite_renovacion
formula_ajuste
indice_ajuste
frecuencia_ajuste
cap_precio
floor_precio
incluye_cargos_cvt
incluye_potencia
incluye_transporte
notas_contractuales
```

## Historico Y Versionado

Nunca se pisa un contrato. Se versiona.

```text
contract_id = identidad estable
contract_version_id = condiciones vigentes
valid_from
valid_to
supersedes_version_id
change_reason
```

Esto permite que el sistema calcule 2024 con una condicion vieja y 2025 con una
adenda nueva.

## Carga Masiva

Excel/CSV entra primero a staging:

```text
client_contract_import_batches
client_contract_import_rows
```

Luego se valida:

- NEMO de 8 caracteres;
- moneda ARS/USD;
- fechas coherentes;
- energia y precio positivos;
- periodos dentro de vigencia;
- formula completa si el precio es indexado;
- renovable con tecnologia declarada.

Solo las filas validas pasan a tablas productivas.

## Score De Completitud

El modulo `Mi empresa` debe mostrar avance por bloque:

```text
Sitios
Contratos
Facturas
Forecast
Reclamos
SMEC / Auditorias
Responsables
Documentos
```

El score no es estetico: determina confianza del Analizador.

```text
sin datos privados -> analisis CAMMESA solamente
contrato cargado -> P&L contractual y vencimientos
facturas cargadas -> auditoria contra factura privada
forecast cargado -> real vs presupuesto
reclamos cargados -> seguimiento ejecutivo
```

## Roadmap

Fase 1:

- pantalla `Mi empresa`;
- formulario MATER;
- validaciones fuertes;
- modelo de completitud;
- documentos solo como metadata local/preparada.

Fase 2:

- migrations privadas en Railway;
- API/edge functions para CRUD validando Supabase JWT + NEMOs autorizados;
- almacenamiento de documentos fuera de Supabase si Supabase queda solo para login
  (por ejemplo Cloudflare R2/S3 compatible) y metadata en Railway;
- carga Excel con staging;
- conectar contratos privados con `mater_pnl_contrato_mensual`.

Fase 3:

- facturas y liquidaciones privadas;
- forecast y provisiones;
- reclamos y tareas;
- SMEC/auditorias.

Fase 4:

- extraction asistida por IA;
- agente que responda solo con evidencia vinculada;
- reportes PDF/email con trazabilidad.
