# Trial: visibilidad de datos por empresa (pendiente)

## Estado actual

- `trial_accounts.cammesa_nemo` ya existe y se persiste desde el formulario de la landing (`prueba-gratis.astro` → RPC `create_trial_account` con `p_cammesa_nemo`).
- Helper SQL `public.current_trial_nemo()` (SECURITY DEFINER) resuelve el nemo del trial activo a partir de `auth.uid()`.
- Policies `SELECT` para trial-users aplicadas en:
  - `agentes_monitoreados` → `nemo = current_trial_nemo()`
  - `datos_mensuales` → `nemo = current_trial_nemo()`
  - `procesamiento_empresas` → join `empresa_id → agentes_monitoreados.nemo`
  - `procesamientos` → existe `procesamiento_empresas` con `am.nemo = current_trial_nemo()`
- Acceso al CRM: `AdminRoute` autoriza `admin || trial`. Header/sidebar muestran badge "Cuenta de prueba" + días restantes.

## Problema funcional

El catálogo `cammesa_agentes_mem` tiene 10.080 nemos, pero `agentes_monitoreados` (la tabla con datos reales en `datos_mensuales`, `procesamientos`, etc.) solo tiene 9.

Resultado: cualquier trial cuya empresa elegida no esté en `agentes_monitoreados` ve la consola vacía aunque las policies estén bien.

## Tareas pendientes

### 1. Provisión operativa de agentes monitoreados ✅ (parcial)

- ✅ `create_trial_account` (migración `create_trial_account_auto_monitor`) ahora hace upsert automático en `agentes_monitoreados` cuando el trial se registra con un nemo válido del catálogo. Activa `activo=true` y setea `seguimiento_desde = current_date`. Si la fila ya existía, la reactiva.
- ⚠️ Esto registra al agente para futuras corridas del pipeline pero NO carga histórico. El trial verá la consola vacía hasta que el procesamiento mensual (raw_agum / raw_amat → datos_mensuales) corra para su nemo.

### 2. Backfill histórico

- Una vez incorporada la empresa a `agentes_monitoreados`, ejecutar pipeline de carga histórica (`raw_agum`, `raw_amat`, procesamientos mensuales) para que `datos_mensuales` tenga rows del nemo.
- Definir ventana mínima visible para trials (ej. últimos 12 meses).

### 3. UX de la landing

- En el autocomplete `CompanyAutocomplete` decidir si:
  - **A)** Mostrar todo `cammesa_agentes_mem` (estado actual). Riesgo: usuario elige empresa sin datos y entra a una consola vacía.
  - **B)** Limitar a `agentes_monitoreados` solamente. Riesgo: usuarios no encuentran su empresa y abandonan.
  - **C)** Mostrar todo pero marcar visualmente cuáles están monitoreadas ("con datos disponibles"), y para no monitoreadas mostrar un mensaje al crear cuenta tipo "vamos a procesar tu histórico y avisarte cuando esté listo".

### 4. Onboarding y comunicación

- Mensaje post-signup distinto según monitoreo:
  - Monitoreado: "Tu consola ya tiene datos, accedé en cualquier momento."
  - No monitoreado: "Estamos procesando tu histórico. Te avisamos cuando esté listo (típicamente N días)."
- Email transaccional o notificación in-app cuando los datos del nemo aparezcan.

### 5. Aislamiento adicional (revisar)

- Tablas con `for select to authenticated using (true)` (acceso global a cualquier autenticado):
  - `cammesa_agentes_mem`
  - `datos_mercado`
  - `raw_agum`
  - `raw_amat`
- Evaluar si para trials hay que tightear (en particular `raw_agum`/`raw_amat` que contienen filas crudas por nemo). Hoy un trial autenticado puede leer todo el raw aunque no le pertenezca.

### 6. Multi-empresa por trial (futuro)

- Hoy `trial_accounts.cammesa_nemo` es un único nemo. Si un cliente opera varios establecimientos, hace falta una tabla `trial_account_nemos` (1-N) y ajustar `current_trial_nemo()` a `current_trial_nemos()` returning `setof text`.

## Archivos relevantes

- DB: migrations `trial_accounts_cammesa_nemo`, `create_trial_account_with_nemo`, `verify_trial_credentials`, `trial_accounts_auth_link`.
- Landing: `src/pages/prueba-gratis.astro`, `src/components/ui/CompanyAutocomplete.astro`.
- CRM: `src/utils/session.ts`, `src/components/layout/AdminShell.tsx`, `src/pages/Access.tsx`, `supabase/functions/trial-login/index.ts`.

## Datos de prueba

Trials existentes con `cammesa_nemo = null` (no van a ver datos hasta que se les asigne):

- `marlon.morales@inkoo.com`
- `marlon.morales@kazecode.com` (eligió `WALMLZCN` — Lomas de Zamora — no monitoreado)

Nemos monitoreados disponibles para asignar manualmente:

```
AARGTAOY  ABBOBOCN  ABRILHCY  ACARQQ3Y  ACARSLSY
ACERBR1Y  ACINTBOY  ACINVCSZ  ACUYLCMY
```

Asignación manual:
```sql
update public.trial_accounts
set cammesa_nemo = 'ABBOBOCN'
where email = 'marlon.morales@kazecode.com';
```
