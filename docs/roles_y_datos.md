# EnergyOS — Soporte de roles y disponibilidad de datos

> Snapshot técnico para retomar la decisión de extender el CRM a roles distintos
> de gran consumidor (generador, distribuidor, comercializador, transportista).
>
> Última actualización: 2026-05-01

---

## 1. Estado actual

EnergyOS soporta **únicamente gran consumidor** (`gran_consumidor`). El resto
de roles está bloqueado en la capa de datos y de UI.

### 1.1 ¿Por qué solo gran consumidor?

Las matviews L3 del data warehouse (Railway) están construidas alrededor de la
demanda. Generadores, distribuidores, comercializadores y transportistas no
aparecen en ninguna de las vistas que las edge functions consumen.

Verificación reproducible:

```sql
-- En Railway:
SELECT COUNT(DISTINCT v.nemo)
FROM public.vw_exposicion_spot_mensual v
JOIN public.cammesa_agentes_mem c ON c.nemo = v.nemo
WHERE c.tipo_agente ILIKE 'gener%'
   OR c.tipo_agente ILIKE 'autogen%'
   OR c.tipo_agente ILIKE 'cogen%';
-- → 0
```

| Vista L3 | Total nemos | Generadores |
|---|---|---|
| `vw_exposicion_spot_mensual` | 11.621 | 0 |
| `vw_factor_carga_mensual` | 11.621 | 0 |

### 1.2 Decisión aplicada en código

`public.role_from_tipo_agente(p_tipo_agente)` (Supabase) retorna `'gran_consumidor'`
sólo para los tipos consumer. Cualquier otro tipo devuelve `NULL`.

Efectos en cascada:

- `search_cammesa_agentes(...)` filtra por `role_from_tipo_agente IS NOT NULL`,
  ocultando todo lo no consumidor.
- `apply_landing_metadata_to_profile()` (trigger trial signup) no auto-vincula
  si el nemo no mapea, y deja al usuario en onboarding manual sin opciones
  útiles.
- `ROL_OPTIONS` en `src/pages/app/AppOnboarding.tsx` queda con una sola
  entrada (auto-select).
- `TIPO_EMPRESA_OPTIONS` en `energy-os-landing/src/pages/prueba-gratis.astro`
  queda con `gran_usuario` y `gudi`.

Cobertura actual:

| Tipo CAMMESA | Mapea a | # nemos |
|---|---|---|
| GRAN DEMANDA EN DISTRIBUIDOR | gran_consumidor | 6.080 |
| Gran Usuario Menor (GUME) | gran_consumidor | 2.185 |
| PAFTT No Agente (Res SE123/95) | gran_consumidor | 537 |
| Gran Usuario Mayor (GUMA) | gran_consumidor | 397 |
| Gran Usuario Particular (GUPA) | gran_consumidor | 24 |
| **Total habilitados** | | **9.223** |
| Generador / Autogen / Cogen | (null) | 452 |
| Distribuidor / Cooperativa / DIME | (null) | 76 |
| Comercializador (demanda + generación) | (null) | 144 |
| Transportistas (4 tipos) | (null) | 185 |
| **Total bloqueados** | | **857** |

---

## 2. Arquitectura de datos

```
┌─────────────────────────┐
│ Frontend (CRM)          │
│ src/pages/app/*.tsx     │
└────────────┬────────────┘
             │  fetch{Modulo}({ nemo })
             ▼
┌─────────────────────────┐
│ Supabase Edge Functions │
│ supabase/functions/gu-*/│
└────────────┬────────────┘
             │  postgres-js (RAILWAY_DATABASE_URL)
             ▼
┌─────────────────────────┐
│ Railway Postgres        │
│ - 47 raw_* (crudos)     │
│ - 9 vw_* (matviews L3)  │
└─────────────────────────┘
```

### 2.1 Conexión Railway

- Las edge functions leen `Deno.env.get("RAILWAY_DATABASE_URL")`.
- El secret se setea en Supabase con `supabase secrets set RAILWAY_DATABASE_URL=...`.
- El frontend NUNCA toca Railway; pasa siempre por edge functions con
  validación de JWT y verificación de nemos autorizados (RPC
  `current_user_nemos`).

### 2.2 Vistas existentes en Railway (L3)

| View | Consume | Módulo UI |
|---|---|---|
| `vw_universo_demanda_mensual` | raw_atra, raw_anexo_guma | AppHome |
| `vw_mercado_resumen_mensual` | raw_dte, raw_atra | Mercado |
| `vw_exposicion_spot_mensual` | raw_dte, raw_anexo_mat | Exposición Spot |
| `vw_factor_carga_mensual` | raw_anexo_guma, raw_anexo_gume | Perfil de Carga |
| `vw_factor_carga_benchmark` | derivada de la anterior | Perfil de Carga |
| `vw_compliance_27191_mensual` | raw_anexo_mat_renovable | Cumplimiento |
| `vw_renovable_contratado_mensual` | raw_anexo_mat_renovable | Cumplimiento |
| `vw_consumo_gu_mensual` | raw_anexo_guma + raw_anexo_gume | varios |
| `vw_historia_resumen_agente` | derivada | Historia |

### 2.3 Vistas que NO existen aún (necesarias para extender roles)

**Generador:**
- `vw_generacion_maquina_mensual` (consume `raw_agen`, `raw_anexo_gen111…119`, `raw_anexo_genmovil`)
- `vw_disponibilidad_maquina_mensual` (consume `raw_anexo_gen_disp_mejora`, `raw_anexo_generacion_forzada`)
- `vw_inyeccion_spot_mensual` (consume `raw_dte` con filtro generación)
- `vw_excedente_mensual` (consume `raw_dexc`)
- `vw_renovable_inyectado_mensual` (consume `raw_anexo_mat_renovable` lado oferta)

**Comercializador:**
- `vw_cartera_mat_mensual` (consume `raw_anexo_mat_compromiso`, `raw_anexo_mat_cont_delivery`)
- `vw_balance_comercializador_mensual` (consume `raw_dte` y derivadas)

**Distribuidor / Cooperativa:**
- `vw_distribuidor_mensual` (agregado de demanda + perdidas técnicas, consume `raw_adis`, `raw_atra`)

Tablas raw existen y están pobladas (Fase 1 cerrada). Falta el trabajo de
parsers L2 + materialización L3 (Fase 2/3 del handoff doc).

---

## 3. Reusabilidad UI por rol

> Evaluación de cada pantalla actual frente a otros roles. Hipótesis: backend
> ya provee las nuevas matviews por rol.

| Pantalla actual | Generador | Distribuidor | Comercializador |
|---|---|---|---|
| `AppHome` (dashboard) | ❌ reemplazar StatCards | 🟡 reusable parcial | ❌ reemplazar |
| `ModuloExposicionSpot` | 🟡 reusable invertido (% vendido spot vs MAT) | ✅ reusable | 🟡 reusable parcial |
| `ModuloCumplimiento` (27.191) | ❌ no aplica | ✅ reusable | ❌ no aplica |
| `ModuloPerfilCarga` | ❌ reemplazar por "Perfil de Despacho" | ✅ reusable | ❌ no aplica |
| `ModuloHistoria` | 🟡 reusable (energía generada vs consumida) | ✅ reusable | ✅ reusable |
| `ModuloMercado` | ✅ reusable | ✅ reusable | ✅ reusable |

### 3.1 Componentes 100% reusables (no requieren cambios)

`StatCard`, `ChartCard`, `DataFooter`, `AlertaBanner`, `EmptyState`,
`ModuleHeader`, `RangeSelector`, `MesSelector`, `Skeleton*`, `AppShell` (con
nav variant por rol), `Logo`, `Button`, `Badge`, `Select`.

### 3.2 Pantallas nuevas que habría que crear

**Generador (4 nuevas):**
- `ModuloDespacho` — generación mensual por máquina, mix por tecnología.
- `ModuloDisponibilidad` — disponibilidad media, salidas forzadas vs programadas.
- `ModuloExcedente` — DEXC, factura sombra del lado oferta.
- `ModuloIngresoSpot` — ingresos por venta spot vs MAT colocado.

**Comercializador (2 nuevas):**
- `ModuloCarteraMat` — contratos activos, prima Plus, vencimientos.
- `ModuloBalanceComercializador` — balance compra/venta, exposición agregada.

**Distribuidor (1 nueva):**
- `ModuloPerdidasTecnicas` — pérdidas técnicas y no técnicas, cobertura.

### 3.3 Estimación de reuso

- ~40% del UI sirve directo
- ~30% sirve con tweaks (labels, iconos, métricas)
- ~30% son pantallas nuevas

Patrón actual `useAppContext` + `loader` + `useAsyncData` + cards modulares
permite swap de queries por rol sin refactor masivo.

---

## 4. Plan sugerido si se decide extender

### 4.1 Orden recomendado

1. **Distribuidor** primero — máximo reuso, valida la abstracción con cambios mínimos.
2. **Generador** — caso más distinto, fuerza definir el patrón de variantes por rol.
3. **Comercializador** al final — depende de matrices más complejas (contratos MAT).

Transportista queda fuera del scope CRM por ahora (no es cliente-target).

### 4.2 Trabajo backend (orden)

Para cada rol nuevo:

1. Cerrar parser L2 correspondiente (Batch 2/3 del handoff).
2. Crear matview L3 nueva (`vw_<modulo>_mensual`).
3. Agregar índice por `nemo`, `anio`, `mes` para performance.
4. Crear edge function `gu-<modulo>` o ampliar existente con `?role=` discriminator.
5. Setear refresh policy (cron o trigger) para mantener matview al día.

### 4.3 Trabajo frontend (orden)

Para cada rol nuevo:

1. Re-habilitar tipos en `role_from_tipo_agente()` (Supabase migration).
2. Volver a agregar opción al `TIPO_EMPRESA_OPTIONS` del landing.
3. Volver a agregar entrada al `ROL_OPTIONS` del CRM.
4. Crear o ajustar pantallas según tabla de la sección 3.
5. Variant del `AppShell` por rol (nav distinto).
6. Tests E2E: signup completo desde landing → dashboard del rol.

### 4.4 Riesgos / consideraciones

- **RLS scoping ya funciona** — el RPC `current_user_nemos` filtra por
  `user_agentes`, independientemente del rol. No hace falta cambiar la
  validación.
- **Multi-rol por usuario** — un mismo user puede tener varios nemos hoy
  (`user_agentes` tabla N:N). Si se da el caso de un user con un nemo gen + un
  nemo consumer, el frontend tendrá que elegir vista o permitir switch. Hoy
  toma `agentes[0]`.
- **Cache `localStorage`** del `AppContext` (key `energyos:appcache:v1:<uid>`)
  guarda informe; al cambiar de rol del agente, conviene invalidar cache para
  evitar mezcla de schemas distintos.

---

## 5. Cambios aplicados durante esta sesión

Para referencia rápida:

| Cambio | Archivo |
|---|---|
| Trigger trial signup deriva `role` desde `cammesa_agentes_mem.tipo_agente` | migration `derive_role_from_cammesa_tipo_agente` |
| `search_cammesa_agentes` filtra agentes sin role mapeable | migration `filter_unmappable_agentes` |
| `role_from_tipo_agente` limitado a consumidores | migration `restrict_to_gran_consumidor_only` |
| Frontend respeta `onboarding_step='done'` del DB | `src/services/onboarding.ts` |
| AppContext con stale-while-revalidate (cache localStorage) | `src/context/AppContext.tsx` |
| Pantalla de carga full-screen reemplazada por skeletons | `src/components/ui/Skeleton.tsx` y módulos |
| Emojis reemplazados por iconos lucide-react | varios |
| Templates de email Supabase con branding EnergyOS | `email-templates/` |

---

## 6. Comandos útiles para auditar

```bash
# Conectar a Railway DB (read-only en lo posible)
psql "postgresql://postgres:****@shuttle.proxy.rlwy.net:12224/railway"

# Listar matviews L3
\dm public.vw_*

# Ver cuántos nemos por tipo soporta cada vista
SELECT c.tipo_agente, COUNT(DISTINCT v.nemo)
FROM public.vw_exposicion_spot_mensual v
JOIN public.cammesa_agentes_mem c ON c.nemo = v.nemo
GROUP BY c.tipo_agente
ORDER BY 2 DESC;

# Verificar mapping role en Supabase
SELECT tipo_agente, public.role_from_tipo_agente(tipo_agente) AS role, COUNT(*)
FROM public.cammesa_agentes_mem
GROUP BY 1, 2
ORDER BY 3 DESC;
```
