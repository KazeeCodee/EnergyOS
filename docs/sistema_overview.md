# EnergyOS — Análisis de Producto

> Documento de síntesis: qué es el sistema, qué hace, qué muestra, para quién está pensado y con qué stack técnico está construido.
> Basado en el código actual del repositorio (rama `main`).

---

## 1. Qué es EnergyOS

**EnergyOS** es una plataforma SaaS de **inteligencia energética** orientada al **Mercado Eléctrico Mayorista (MEM) de Argentina** administrado por **CAMMESA**.

Toma los archivos crudos que CAMMESA publica mes a mes (DTE, Anexos, AMAT, AGUM, ATRA, DEXC, Variables Relevantes, etc.), los normaliza en una arquitectura de datos de tres capas, y los expone como **dashboards accionables** para Grandes Usuarios (GU) del MEM.

En una frase: convierte el mercado mayorista de electricidad — que es opaco, manual y ZIP-a-ZIP — en un producto digital con KPIs, alertas y módulos por dominio.

---

## 2. Propuesta de valor

### Problema real

- CAMMESA publica datos críticos (precio spot, MATER, transporte, cumplimiento renovable, demanda, exposición) en archivos planos heterogéneos por mes y por agente.
- Los GU dependen de **planillas Excel**, consultoras externas o áreas internas para entender:
  - cuánta energía compraron en el spot,
  - si están cumpliendo el cupo renovable de la Ley 27.191,
  - si su factura DTE coincide con lo que se les debería estar facturando,
  - cómo se compara su perfil de carga contra peers,
  - si su contrato MATER fue ahorro o pérdida frente al spot.
- El ciclo de información es lento, retrospectivo y costoso.

### Lo que EnergyOS hace distinto

1. **Ingesta automática** del dato crudo CAMMESA (Python pipelines) con histórico desde 2020.
2. **Modelo de datos versionado** (L1 raw → L2 semántico → L3 marts) que aísla los cambios de formato CAMMESA del producto.
3. **Producto orientado al cliente final**: no muestra tablas crudas, muestra módulos por **decisión de negocio** (¿estoy cumpliendo? ¿cuánto pago de spot? ¿me convino MATER?).
4. **Alertas automáticas** (alta exposición spot, incumplimiento Ley 27.191) sin que el cliente arme la lógica.
5. **Modelo por planes** (compliance / gestion / full / white-label) que monetiza el dato en capas.
6. **Consola admin separada** para validar la calidad del dato antes de exponerlo al cliente.

### A quién le sirve

| Perfil | Caso de uso |
|---|---|
| **Gran Usuario (GU)** del MEM | Onboarding único contra su NEMO de CAMMESA, ve sus consumos, contratos MATER, exposición spot y cumplimiento renovable sin pedirlo a nadie. |
| **Áreas de Energía / Sustentabilidad** corporativas | Reporte automático Ley 27.191 y trazabilidad mensual del cupo renovable. |
| **Comercializadores / Brokers MATER** | Benchmarks, índices de pricing MATER y P&L contractual (plan `full`). |
| **Consultoras energéticas** | Capa white-label para revender análisis sin armar el ETL CAMMESA. |
| **Equipo interno EnergyOS** | Consola admin para correr ingestas, auditar capas y validar cada módulo antes del release. |

---

## 3. Qué muestra (módulos del producto)

### 3.1. App cliente (`/app/*`)

Acceso para usuarios finales luego de login + onboarding (selección de rol y vinculación a un agente CAMMESA por NEMO).

| Ruta | Módulo | Qué muestra |
|---|---|---|
| `/app` | **Home / Informe de Inicio** | KPIs base: demanda mensual, mix energético, % spot vs. MATER, alertas automáticas, demanda año móvil. |
| `/app/exposicion-spot` | **Exposición Spot** | Compra spot mensual, $/MWh promedio, sub/sobre-contrato MATER, costo total spot, serie histórica configurable. |
| `/app/cumplimiento-renovable` | **Cumplimiento Ley 27.191** | Cupo renovable mensual, MATER MWh, % cumplimiento, gap contra obligación. |
| `/app/perfil-carga` | **Perfil de Carga** | Factor de carga, demanda pico vs. media, distribución horaria. |
| `/app/historia` | **Historia Energética** | Serie histórica multi-año del agente con todos sus KPIs apilables. |
| `/app/mercado` | **Mercado / Contexto** | Precio spot diario, variables del mercado (combustibles, hidraulicidad, importación / exportación), contexto macro del MEM. |
| `/app/ajustes` | **Ajustes** | Datos del agente vinculado, plan, sesión. |

Componentes de UX comunes: `StatCard`, `ChartCard` (Recharts), `AlertaBanner`, `EmptyState`, `RangeSelector`, `DataFooter` (con la fuente y fecha del dato).

### 3.2. Consola admin (`/admin/*`)

Acceso restringido (rol admin o cuenta de trial). Sirve para **validar calidad del dato real** ya cargado en Supabase, no es un dashboard de cliente.

| Ruta | Pantalla | Qué valida |
|---|---|---|
| `/admin` | **System Overview** | Salud general: meses procesados, errores, último corte. |
| `/admin/modulo-1` | **Módulo 1 — Consumo y cobertura** | `datos_mensuales`, demanda, MATER vs. spot por agente. |
| `/admin/modulo-2` | **Módulo 2 — Costos y transporte** | Factura sombra, transporte, $/MWh. |
| `/admin/modulo-3` | **Módulo 3 — Mercado** | Precios spot, variables relevantes, mercado de referencia. |
| `/admin/modulo-4` | **Módulo 4 — Calidad y completitud** | Faltantes, datos sospechosos, periodos incompletos. |
| `/admin/analitica` | **Analítica multi-agente** | Vista cruzada de todos los agentes y períodos cargados. |

---

## 4. Catálogo de KPIs y monetización por plan

Definido en `docs/kpi_catalog.md`. La UI consulta esta matriz antes de mostrar navegación premium; la base aplica RLS / feature flags por plan.

| Plan | Para quién | KPIs incluidos |
|---|---|---|
| **compliance** | Cumplimiento básico | Cumplimiento Ley 27.191, demanda total, MATER MWh. |
| **gestion** | Gestión mensual y costos | + Factura sombra, desvío DTE, exposición spot, cargo DEXC, transporte $/MWh. |
| **full** | Optimización avanzada | + Ahorro MATER vs spot, under-delivery contrato, peer benchmarks, MATER pricing index, salud de generadores, combustibles vs spot, impacto Imp/Exp. |
| **white-label** | Reventa | Todo + branding y export avanzado. |

---

## 5. Arquitectura del sistema

### 5.1. Vista de alto nivel

```
CAMMESA (ZIP / SQL / XLSX mensual)
         │
         ▼
┌─────────────────────────────┐
│ Pipeline Python             │  carga_historica.py · procesar_mes.py
│ ingest + procesar           │  ingest_sql_historico.py · audit_fase1_raw.py
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Supabase (Postgres)         │
│  L1 raw_*       42 tablas   │  espejo posicional, todo text
│  L2 *_mensual               │  semánticas, tipadas, idempotentes
│  L3 marts                   │  snapshots por pantalla
│  + Auth · RLS · Storage     │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Edge Functions (Deno)       │  gu-informe-inicio · gu-exposicion
│ API por dominio             │  gu-compliance-27191 · gu-factor-carga
│                             │  gu-historia-energetica · gu-mercado-contexto
│                             │  trial-login · admin-* · download-cammesa-dte
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Front React (Vite SPA)      │  /app cliente · /admin consola
│ /app y /admin               │  React Router · Recharts · Tailwind
└─────────────────────────────┘
```

### 5.2. Arquitectura de datos en 3 capas

Documentada en `docs/cammesa_target_model.md` y `docs/dataflow.md`.

| Capa | Tablas | Regla |
|---|---|---|
| **L1 Raw** | `raw_dte`, `raw_amat`, `raw_atra`, `raw_dexc`, `raw_agum`, `raw_anexo_*`, etc. (~42 tablas) | Espejo posicional 1:1 del archivo CAMMESA. Todo `text`. Sin lógica de negocio. |
| **L2 Semántica** | `*_mensual` tipadas: `guma_detalle_mensual`, `dte_resumen_agente`, `mater_contrato_mensual`, `transporte_concepto_mensual`, etc. | Parser reproducible por período via funciones `refresh_<tabla>(_anio, _mes)`. Numérico ES → numeric. Idempotente. |
| **L3 Marts** | Agregados desnormalizados producto-listo: `compliance_renovable_mensual`, `exposicion_spot_mensual`, `factura_sombra_mensual`, `peer_benchmark_mensual`, `mater_pnl_contrato_mensual`, etc. | Una query rápida por pantalla, sin joins en runtime. |
| **UI** | App cliente + edge functions | **Nunca** consultan `raw_*`. Leen L3 (o L2 como excepción). |

**Principios clave:**
- Clave canónica única: `(agente_nemo, anio, mes)` — `agente_nemo` siempre 8 chars.
- Idempotencia: `refresh_*` se puede correr N veces sin duplicar.
- Versionado de parsers: cada fila L2/L3 lleva `parser_version` para reprocesar histórico sin perder trazabilidad.
- RLS por plan, no por tabla: L1/L2 abiertas a authenticated; L3 con policies por `empresas.plan_activo`.

### 5.3. Flujo de ingesta

Pipeline Python (`pipeline/`):

| Script | Función |
|---|---|
| `carga_historica.py` | Carga histórica mensual masiva por rango (2020 → hoy). |
| `procesar_mes.py` | Procesa un único `(anio, mes)` con fallback ZIP/DTE legacy. |
| `ingest_sql_historico.py` | Carga raw histórico desde dumps SQL CAMMESA. |
| `import_raw_sql_to_supabase.py` | Importa `raw_amat / raw_agum / raw_atra` en lote (batch configurable). |
| `audit_fase1_raw.py` | Audita L1: espejo vs. fuente, gate de cierre Fase 1. |
| `procesar_pendientes.py` | Reprocesa todo lo marcado como pendiente o sospechoso. |
| `railway_*` | Variantes para correr el ETL desde Railway. |

Cada `procesamiento` deja registro en la tabla `procesamientos (anio, mes, estado, error_message, created_at)` para verificar con la query del `RUNBOOK.md`.

---

## 6. Stack técnico

### Frontend (`src/`)

- **React 19** + **TypeScript** (`tsconfig.json`)
- **Vite 8** como bundler (`vite.config.ts`)
- **React Router 7** (rutas en `App.tsx`, lazy loading de módulos cliente)
- **Tailwind CSS 3** (`tailwind.config.js`) — paleta navy / ivory / mist; tipografía Fraunces.
- **Recharts 3** para todos los gráficos (Area, Bar, Line, Composed, Pie).
- **Lucide React** para iconografía.
- **Supabase JS v2** como cliente (auth + postgrest + edge invoke).
- Layouts: `AppShell` (cliente) y `AdminShell` (admin).
- Hook común `useAsyncData` para fetch + estados loading / error / empty / restricted.

### Backend

- **Supabase Postgres** con 46+ migraciones versionadas en `supabase/migrations/`.
- **Edge Functions Deno** en `supabase/functions/`:
  - `gu-informe-inicio`, `gu-exposicion`, `gu-compliance-27191`, `gu-factor-carga`, `gu-historia-energetica`, `gu-mercado-contexto` → API por dominio del producto cliente.
  - `admin-create-user`, `admin-trigger-processing`, `download-cammesa-dte` → operaciones admin.
  - `trial-login` → flujo de cuenta de prueba con NEMO.
- **RLS** aplicada por plan y agente vinculado.
- Tablas de identidad: `trial_accounts`, `contact_messages`, `newsletter_subscribers`.

### Pipeline de datos

- **Python 3** + `requirements.txt` propio.
- Conexión directa a Supabase via service role key.
- Soporte para correr en **Railway** (scripts `railway_*`).
- Auditoría reproducible vía `audit_fase1_raw.py --fail-on-mismatch`.

### Despliegue / dev

- **Vercel** (`vercel.json`) para el front.
- **Railway** para procesos de ingesta CAMMESA pesados.
- Dev local: `npm run dev` (Vite, puerto 5173).
- Logs persistidos en `.vite-*.log` y `pipeline/logs/`.

---

## 7. Flujos de usuario clave

### 7.1. Onboarding cliente

1. `/` → login (`Access.tsx`) con email + password (Supabase auth).
2. Si la cuenta no completó onboarding → `AppOnboarding`:
   - Paso 1: confirma rol (hoy `gran_consumidor`).
   - Paso 2: busca su agente CAMMESA por NEMO (RPC `search_cammesa_agentes`).
   - Paso 3: vincula usuario ↔ agente y acepta términos.
3. Tras onboarding → `/app` con su Informe de Inicio cargado.

### 7.2. Trial / acceso de prueba

- Trial accounts vinculadas a NEMO (`trial-login` edge function).
- Acceso directo a la consola admin para demos/validación previa a producción.

### 7.3. Carga mensual de datos (operación interna)

1. CAMMESA publica el mes M.
2. Equipo corre `python pipeline/procesar_mes.py --anio Y --mes M` (o el rango anual con `carga_historica.py`).
3. `refresh_*` repuebla L2 y L3 idempotentemente.
4. Se valida en `/admin/modulo-1..4` que cada capa tiene los KPIs esperados.
5. Una vez todo verde, los clientes ven el mes nuevo en `/app/*` sin redeploy.

---

## 8. Estado actual del producto

Según el código y los docs (`cammesa_phase2_*`, `energyos_handoff_*`, `energyos_roadmap_fases_restantes.md`):

- **Fase 1 (raw L1)**: cerrada, auditada con `audit_fase1_raw.py`.
- **Fase 2 (semántica L2)**: en curso por bloques (`refresh_*` smoke-tested en 2021/2024/2026).
- **Fase 3 (marts L3)**: en avance, con marts ya consumidos por `gu-*`.
- **Fase 4 (UI cliente)**: 7 módulos productivos en `/app`, sobre datos reales (no mocks).
- Histórico cargado: **2020-02 → 2026-04** según el RUNBOOK.

---

## 9. Diferenciales competitivos

1. **Verticalización pura MEM/CAMMESA**: el modelo de datos, los KPIs y las alertas están diseñados sobre las reglas reales del mercado argentino — no es un BI genérico.
2. **Ingesta como ventaja competitiva**: mantener los parsers `raw_* → *_mensual` actualizados es la barrera de entrada.
3. **Producto vs. consultoría**: convierte un servicio profesional recurrente (analista que arma planillas mes a mes) en un SaaS de margen alto.
4. **Modelo por planes alineado a perfiles**: empieza barato (compliance) y crece con benchmarks y P&L MATER.
5. **Admin separado del cliente**: garantiza que ningún cliente vea un mes a medio procesar — es una ventaja operativa real.

---

## 10. Resumen ejecutivo

> EnergyOS es el "ERP de mercado eléctrico" para Grandes Usuarios del MEM argentino. Toma archivos crudos de CAMMESA, los normaliza en tres capas, y los entrega como dashboards de cumplimiento, costos, exposición spot, perfil de carga, historia y contexto de mercado, con un modelo de planes que escala desde compliance básico hasta benchmarks y P&L MATER. Construido en React + Supabase + pipelines Python, con histórico desde 2020 ya cargado y validado.
