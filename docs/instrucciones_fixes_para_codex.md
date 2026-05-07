# Instrucciones para Codex — Implementación Fase A de Fixes EnergyOS

> **Contexto**: este documento contiene **todas** las instrucciones necesarias
> para implementar los 6 fixes detectados en la auditoría del sistema EnergyOS.
> Es autocontenido — no asume contexto previo de la conversación.
>
> **Objetivo**: dejar el sistema "demo-ready" sin bugs críticos antes de venderlo.
> Hay 1 fix urgente (Fix #1, multa Ley 27.191), 4 importantes y 1 condicional.

---

## 0. Contexto del proyecto en 2 minutos

**EnergyOS** es un SaaS para Grandes Usuarios del Mercado Eléctrico Mayorista
argentino (CAMMESA). Procesa los DTE (Documentos de Transacciones Económicas)
mensuales y expone dashboards de cumplimiento, exposición spot, perfil de carga, etc.

### Arquitectura de datos en 3 capas

```
Supabase Postgres (mismo proyecto):
  L1 raw_*       42 tablas espejo de archivos CAMMESA
  L2 *_mensual   tablas semánticas tipadas (dte_resumen_agente,
                 mater_contrato_mensual, cammesa_parametros_mensuales, etc.)

Railway Postgres (separado, accedido por edge functions Deno):
  L3 marts       vw_consumo_gu_mensual, vw_exposicion_spot_mensual,
                 vw_compliance_27191_mensual, vw_factor_carga_mensual,
                 vw_renovable_contratado_mensual
  + tablas:      compliance_27191_obligacion, combustibles_precios_mensual (NUEVA)
```

### Edge functions Deno (en `supabase/functions/`)

Cada módulo del frontend tiene su edge function. Las relevantes para Fase A son:
- `gu-compliance-27191/index.ts` → módulo Cumplimiento Ley 27.191
- `gu-exposicion/index.ts` → módulo Exposición Spot
- `gu-factor-carga/index.ts` → módulo Perfil de Carga

Estas funciones consultan **Railway directamente** vía `RAILWAY_DATABASE_URL`,
no via Supabase ORM.

### Frontend (React 19 + Vite + TypeScript + Tailwind + Recharts)

- `src/pages/app/ModuloCumplimiento.tsx`
- `src/pages/app/ModuloPerfilCarga.tsx`
- `src/pages/app/ModuloExposicionSpot.tsx`
- `src/pages/app/AppHome.tsx`
- etc.

---

## 1. Acceso a Railway (CRÍTICO antes de empezar)

Las migraciones SQL de Fase A se aplican contra Railway, NO contra Supabase.

**El usuario debe proveerte la `DATABASE_URL`** (rotada después del último uso).
Formato:
```
postgresql://postgres:<password>@shuttle.proxy.rlwy.net:<puerto>/railway
```

Para correr migraciones SQL desde Python:
```python
import psycopg, os
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
with conn.cursor() as cur:
    cur.execute(open("scripts/sql/<archivo>.sql").read())
```

**No usar el cliente de Supabase para Railway**. Son DBs separadas.

---

## 2. Estado actual al inicio de Fase A

### ✅ Datos ya cargados en Railway

- **`combustibles_precios_mensual`**: 63 filas (2021-01 → 2026-03), histórico de
  costos y precios de combustibles del MEM. Carga ya hecha por el script
  `pipeline/load_combustibles_historico.py`. **No tocar**.

  Campo clave: `costo_total_usd_mwh_alt` = CVP promedio mensual de combustibles
  alternativos (gasoil + fuel oil + carbón). Es el precio que la Ley 27.191
  pide usar para calcular la multa por incumplimiento.

  Ejemplo: el promedio de los últimos 12 meses (abr-2025 a mar-2026) es
  **194,19 USD/MWh**. El sistema actual usa ~30 USD/MWh (precio MATER).
  Subestima la multa por ~6x.

### ✅ Cotización dólar disponible

En `cammesa_parametros_mensuales` (Supabase, tabla L2) está:
```sql
SELECT anio, mes, valor as cotizacion_dolar_ars
FROM public.cammesa_parametros_mensuales
WHERE parametro = 'cotizacion_dolar_mayorista_bcra';
```

Pero ojo: Railway no tiene `cammesa_parametros_mensuales` (vive en Supabase).
Para Fix #1, hay 2 opciones:
- **A.** Replicar `cammesa_parametros_mensuales` a Railway (preferido).
- **B.** Hardcodear cotización en el cálculo o pasarla como parámetro.

Recomendación: opción **A**, replicar a Railway con un script Python que
sincronice mensualmente.

---

## 3. Los 6 fixes — orden de ejecución recomendado

| Orden | Fix | Tipo | Tiempo |
|---|---|---|---|
| 1 | Fix #6 — Label "Valle 0-6h" → "0-5h" | Frontend | 2 min |
| 2 | Fix #4 — Cargar obligación 2017-2020 | SQL | 5 min |
| 3 | Fix #5 — UX `cumple_mes` vs `cumple_ytd` | Frontend | 30 min |
| 4 | Fix #1 — Multa Ley 27.191 con CVP alternativos | SQL + Frontend | 1-2 hs |
| 5 | Fix #2 — Spot pesos para GUDI | SQL | 1 h |
| 6 | Fix #3 — GUME legacy parser | Condicional | 0-2 hs |

Empezar por los rápidos y de bajo riesgo, dejar Fix #1 (más complejo) para
cuando los anteriores estén verificados.

---

## 4. FIX #6 — Label "Valle 0-6h" → "0-5h"

**Severidad**: cosmético. **Riesgo**: cero.

### Contexto regulatorio

Las bandas horarias oficiales del MEM CAMMESA son:
- Pico: 18:00-23:00 (5h)
- Resto: 5:00-18:00 y 23:00-24:00 (14h)
- **Valle: 0:00-5:00 (5h, NO 6h)**

El frontend actual dice "0-6h" en el StatCard de % Valle. El dato numérico es
correcto (CAMMESA ya lo agrega bien en los archivos AGUM), solo el label está mal.

### Cambio

**Archivo**: `src/pages/app/ModuloPerfilCarga.tsx`

Buscar:
```tsx
<StatCard
  label="% Valle promedio"
  value={fmtPct(r.pctVallePromedio)}
  sub="Horas 0–6h"
  tone="teal"
/>
```

Reemplazar `sub="Horas 0–6h"` por `sub="Horas 0–5h"`.

### Verificación

- Abrir `/app/perfil-carga` y confirmar que dice "Horas 0–5h".

---

## 5. FIX #4 — Cargar obligación Ley 27.191 para 2017-2020

**Severidad**: media. **Riesgo**: cero (solo agrega filas).

### Contexto regulatorio

La Ley 27.191 Art. 8 establece el cronograma:

| Año | % obligatorio renovable |
|---|---|
| 2017 | 8% |
| 2018 | 8% (vigencia hasta 2019) |
| 2019 | 12% |
| 2020 | 12% (vigencia hasta 2021) |
| 2021 | 16% |
| 2022 | 16% |
| 2023 | 18% |
| 2024 | 18% |
| 2025+ | 20% |

La tabla `compliance_27191_obligacion` en Railway arranca en 2021. Si un cliente
selecciona meses 2017-2020 ve `obligacion_pct = NULL`. Hay que agregar las 4 filas
faltantes.

### Cambio

**Crear archivo nuevo**: `scripts/sql/railway_compliance_27191_extension_2017_2020.sql`

```sql
-- Extiende compliance_27191_obligacion hacia atrás (2017-2020).
-- Idempotente: ON CONFLICT actualiza si ya existe.

INSERT INTO public.compliance_27191_obligacion (anio, pct_minimo, fuente)
VALUES
  (2017, 0.08, 'Ley 27.191 Art. 8 — vigencia 8% al 31/12/2017'),
  (2018, 0.08, 'Ley 27.191 Art. 8 — vigencia 8% hasta 31/12/2019'),
  (2019, 0.12, 'Ley 27.191 Art. 8 — vigencia 12% al 31/12/2019'),
  (2020, 0.12, 'Ley 27.191 Art. 8 — vigencia 12% hasta 31/12/2021')
ON CONFLICT (anio) DO UPDATE
  SET pct_minimo = excluded.pct_minimo,
      fuente = excluded.fuente,
      updated_at = now();

-- Refrescar marts dependientes
SELECT public.refresh_compliance_27191();
```

### Aplicación

```python
import psycopg, os
with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(open("scripts/sql/railway_compliance_27191_extension_2017_2020.sql").read())
```

### Verificación

```sql
-- Debe devolver 10 filas (2017-2030 ya existían 6 + 4 nuevas)
SELECT anio, pct_minimo FROM public.compliance_27191_obligacion ORDER BY anio;

-- Debe devolver datos no-null para meses 2017-2020 (de agentes que existieran)
SELECT count(*) FROM public.vw_compliance_27191_mensual
WHERE anio BETWEEN 2017 AND 2020 AND obligacion_pct IS NOT NULL;
```

---

## 6. FIX #5 — UX `cumple_mes` vs `cumple_ytd`

**Severidad**: media (riesgo de confusión, no bug de cálculo). **Riesgo**: bajo.

### Problema

`vw_compliance_27191_mensual` calcula 2 indicadores:
- `cumple_mes`: si renovable contratado del mes ≥ obligación del mes
- `cumple_ytd`: si renovable acumulado año ≥ obligación acumulada (**el legalmente válido**)

La Ley 27.191 obliga al **31 de diciembre** (anual). Un GU puede tener varios
meses con `cumple_mes = false` y aún así cerrar el año con `cumple_ytd = true`
(ej: porque tiene picos estacionales de generación renovable).

El frontend actual da igual peso visual a ambos. Riesgo: el cliente ve barras
rojas mensuales y desconfía del sistema cuando al final del año cumple.

### Cambio

**Archivo**: `src/pages/app/ModuloCumplimiento.tsx`

Cambios concretos:

1. **Agregar banner explicativo arriba del módulo**, después del `ModuleHeader`:
```tsx
<AlertaBanner
  type="info"
  message="La Ley 27.191 evalúa el cumplimiento al cierre anual (31/dic). Los indicadores mensuales son orientativos sobre el ritmo del año."
/>
```

2. **Renombrar el chart "% Renovable real vs. obligación mensual"** para que el
   título refleje su naturaleza orientativa:
   - Cambiar `title="% Renovable real vs. obligación mensual"` por
     `title="Ritmo mensual — orientativo (la ley se evalúa anualmente)"`.

3. **Cambiar la coloración de `cumple_mes` en el chart**: hoy usa verde/rojo según
   `d.cumple`. Cambiar por un único color (ej `#15caca` teal) para no transmitir
   "aprobado / desaprobado" mensualmente:
   ```tsx
   <Bar dataKey="real" name="Renovable real" fill="#15caca" radius={[4, 4, 0, 0]} />
   ```
   (eliminar el `<Cell>` con coloración condicional)

4. **Dar protagonismo visual al `cumple_ytd`**: el StatCard "Cumple YTD" ya existe.
   Asegurarse que esté en posición destacada y con tooltip explicativo:
   ```tsx
   <StatCard
     label="Cumple Ley 27.191"
     value={r.cumpleYtd ? "Sí" : "No"}
     sub={`Indicador legal · Año ${r.anioEnCurso ?? "en curso"}`}
     tone={r.cumpleYtd ? "emerald" : "red"}
   />
   ```

### Verificación

- Abrir `/app/cumplimiento-renovable`.
- Confirmar que el banner azul aparece arriba.
- Confirmar que las barras del chart mensual son color teal uniforme (no rojo/verde).
- Confirmar que el StatCard de cumplimiento usa "Cumple Ley 27.191" como label.

---

## 7. FIX #1 — Multa Ley 27.191 con CVP alternativos (URGENTE)

**Severidad**: ALTA. **Riesgo**: medio (toca la vista materializada principal).

### Problema

`vw_compliance_27191_mensual` calcula `multa_estimada_pesos = brecha_mwh × multa_ref_pesos_mwh`.
El `multa_ref_pesos_mwh` actual usa este orden de fallback (en
`scripts/sql/railway_compliance_27191.sql` líneas ~155-161):

1. `compliance_27191_obligacion.multa_pesos_mwh` (override, vacío hoy)
2. **Precio MATER del propio cliente últimos 12m** (~30 USD/MWh)
3. **Precio MATER promedio del universo del año** (~30 USD/MWh)
4. 0

**La Ley 27.191 Art. 11 dice**: la multa se paga al **CVP de gasoil/combustibles
alternativos importados, promedio ponderado 12 meses año anterior**.

El número real es ~194 USD/MWh (medido en marzo 2026 con tabla nueva).
**El sistema subestima la multa por ~6x**.

### Datos disponibles para el fix

- Tabla **`combustibles_precios_mensual`** en Railway (ya cargada, 63 filas).
  Campo `costo_total_usd_mwh_alt` = CVP combustibles alternativos en USD/MWh.
- Cotización dólar en `cammesa_parametros_mensuales` (Supabase, parametro
  `cotizacion_dolar_mayorista_bcra`).

### Sub-paso 1.A — Replicar cotización dólar a Railway

**Crear archivo**: `pipeline/sync_cotizacion_dolar_a_railway.py`

```python
"""
Sincroniza la serie mensual de cotizacion_dolar_mayorista_bcra desde
cammesa_parametros_mensuales (Supabase) hacia una tabla nueva en Railway.

Idempotente: UPSERT por (anio, mes).
"""
import os, sys
import psycopg
from supabase import create_client

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Crear tabla en Railway si no existe
DDL = """
CREATE TABLE IF NOT EXISTS public.cotizacion_dolar_mensual (
  anio int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cotizacion_ars numeric NOT NULL,
  fuente text NOT NULL DEFAULT 'BCRA mayorista (via DTE/ADCO)',
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);
"""

def main():
    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    railway_url = os.environ["DATABASE_URL"]

    sb = create_client(sb_url, sb_key)
    res = (sb.table("cammesa_parametros_mensuales")
             .select("anio,mes,valor")
             .eq("parametro", "cotizacion_dolar_mayorista_bcra")
             .execute())
    rows = res.data
    print(f"Filas obtenidas de Supabase: {len(rows)}")

    with psycopg.connect(railway_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            for r in rows:
                cur.execute("""
                    INSERT INTO public.cotizacion_dolar_mensual (anio, mes, cotizacion_ars)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (anio, mes) DO UPDATE SET
                        cotizacion_ars = EXCLUDED.cotizacion_ars,
                        procesado_en = now()
                """, (r["anio"], r["mes"], r["valor"]))
        conn.commit()
    print("✓ Sync completo")

if __name__ == "__main__":
    main()
```

Correr una vez:
```bash
python pipeline/sync_cotizacion_dolar_a_railway.py
```

### Sub-paso 1.B — Modificar `vw_compliance_27191_mensual`

**Archivo**: `scripts/sql/railway_compliance_27191.sql`

En la CTE `with_refs`, agregar el cálculo del CVP alternativos en pesos:
```sql
with_refs as (
  select
    b.*,
    -- ... refs existentes (precio_cliente_12m, precio_universo_anual) ...

    -- NUEVO: CVP alternativos promedio 12m año anterior, convertido a pesos
    (
      SELECT round(avg(cb.costo_total_usd_mwh_alt) * cd.cotizacion_ars, 2)
      FROM public.combustibles_precios_mensual cb
      JOIN public.cotizacion_dolar_mensual cd
        ON cd.anio = b.anio AND cd.mes = b.mes
      WHERE (cb.anio * 100 + cb.mes)
              BETWEEN ((b.anio - 1) * 100 + b.mes) AND (b.anio * 100 + b.mes - 1)
    ) AS precio_cvp_alternativos_pesos_mwh,

    -- ... resto del with_refs ...
  from base b
  window
    -- ...
)
```

En la CTE `calculated`, modificar el orden de fallback de `multa_ref_pesos_mwh`:
```sql
calculated as (
  select
    *,
    demanda_real_mwh * obligacion_pct as obligacion_mwh,
    greatest(demanda_real_mwh * obligacion_pct - renovable_contratado_mwh, 0) as brecha_mwh,
    -- ...

    -- ⭐ NUEVO ORDEN: CVP alternativos PRIMERO (lo que dice la ley)
    coalesce(
      multa_override_pesos_mwh,
      precio_cvp_alternativos_pesos_mwh,    -- nuevo, prioritario
      precio_cliente_12m_pesos_mwh,         -- fallback
      precio_universo_anual_pesos_mwh,
      0
    ) as multa_ref_pesos_mwh,

    case
      when multa_override_pesos_mwh is not null then 'tabla_obligacion'
      when precio_cvp_alternativos_pesos_mwh is not null then 'cvp_alternativos'  -- nuevo
      when precio_cliente_12m_pesos_mwh is not null then 'cliente_12m'
      when precio_universo_anual_pesos_mwh is not null then 'universo_anual'
      else 'sin_precio'
    end as multa_metodo
  from with_refs
)
```

### Sub-paso 1.C — Aplicar la migración

```python
import psycopg, os
with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(open("scripts/sql/railway_compliance_27191.sql").read())
```

### Sub-paso 1.D — Actualizar `gu-compliance-27191/index.ts`

**Archivo**: `supabase/functions/gu-compliance-27191/index.ts`

En la respuesta JSON, actualizar el `notas.multa` para reflejar la nueva metodología:
```typescript
notas: {
  multa: "Estimación basada en CVP combustibles alternativos del MEM (Art. 11 Ley 27.191). Fuente: tabla combustibles_precios_mensual.",
  obligacion: "Tabla configurable compliance_27191_obligacion en Railway.",
}
```

### Sub-paso 1.E — UI: mostrar método

**Archivo**: `src/pages/app/ModuloCumplimiento.tsx`

En el `ChartCard` "Brecha mensual y multa estimada", al final del bloque
`{data.notas.multa && ...}`, agregar muestra del método:

```tsx
{data.notas.multa && (
  <p className="mt-3 text-xs text-slate-400 italic">
    {data.notas.multa}
    {r.ultimoMes?.multaMetodo && (
      <span className="ml-1">Método: <strong>{r.ultimoMes.multaMetodo}</strong></span>
    )}
  </p>
)}
```

### Verificación

```sql
-- 1. Ver que el nuevo método aparece
SELECT distinct multa_metodo, count(*)
FROM public.vw_compliance_27191_mensual
GROUP BY multa_metodo;

-- 2. Ver que para meses recientes el método es 'cvp_alternativos'
SELECT anio, mes, multa_metodo, multa_ref_pesos_mwh, multa_estimada_pesos
FROM public.vw_compliance_27191_mensual
WHERE anio = 2026 AND brecha_mwh > 0
LIMIT 5;

-- 3. Comparar magnitud antes/después: el multa_ref_pesos_mwh debería ser
--    significativamente más alto que con el método anterior (~6x)
```

En el frontend `/app/cumplimiento-renovable`, confirmar que:
- La multa estimada para clientes con brecha es ahora un número mucho mayor.
- Aparece el texto "Método: cvp_alternativos" debajo del chart.

---

## 8. FIX #2 — Spot pesos para clientes GUDI

**Severidad**: alta para clientes GUDI, irrelevante para GUMA/GUME.
**Riesgo**: bajo (solo afecta una rama del SQL).

### Problema

En `scripts/sql/railway_exposicion_spot_mat.sql`, la CTE `gudi_dexc` setea:
```sql
0::numeric as compra_spot_pesos
```

Resultado: clientes GUDI ven $0 en costo spot, módulo Exposición Spot inutilizable
para ellos.

### Datos disponibles

- Volúmenes spot de GUDI ya parseados en `gudi_dexc` (cols `compra_spot_pico_mwh`,
  `compra_spot_valle_mwh`, `compra_spot_resto_mwh`).
- Precios DEX en `cammesa_parametros_mensuales` (Supabase, parametros tipo
  `precio_dex_habil_pico_pesos_mwh`, `precio_dex_habil_valle_pesos_mwh`, etc.).

### Pre-requisito

Replicar `cammesa_parametros_mensuales` (al menos los precios DEX) a Railway.

**Crear archivo**: `pipeline/sync_precios_dex_a_railway.py` (similar a
`sync_cotizacion_dolar_a_railway.py`).

Filtrar por `parametro LIKE 'precio_dex_%_pesos_mwh'`. Crear tabla:
```sql
CREATE TABLE IF NOT EXISTS public.precios_dex_mensual (
  anio int NOT NULL,
  mes int NOT NULL,
  parametro text NOT NULL,
  valor numeric NOT NULL,
  PRIMARY KEY (anio, mes, parametro)
);
```

Para simplificar el cálculo, podemos **promediar** los 9 precios DEX
(3 días × 3 bandas) por mes:

```sql
CREATE OR REPLACE VIEW public.vw_precio_dex_promedio_mensual AS
SELECT
  anio, mes,
  avg(valor) as precio_dex_promedio_pesos_mwh
FROM public.precios_dex_mensual
WHERE parametro LIKE 'precio_dex_%_pesos_mwh'
GROUP BY anio, mes;
```

### Cambio en `vw_consumo_gu_mensual`

En la CTE `gudi_dexc` de `scripts/sql/railway_exposicion_spot_mat.sql`, reemplazar:
```sql
0::numeric as compra_spot_pesos,
```

Por:
```sql
(
  (coalesce(public.parse_es_number(r.col_013), 0) +
   coalesce(public.parse_es_number(r.col_016), 0) +
   coalesce(public.parse_es_number(r.col_019), 0) +
   coalesce(public.parse_es_number(r.col_011), 0) +
   coalesce(public.parse_es_number(r.col_014), 0) +
   coalesce(public.parse_es_number(r.col_017), 0) +
   coalesce(public.parse_es_number(r.col_012), 0) +
   coalesce(public.parse_es_number(r.col_015), 0) +
   coalesce(public.parse_es_number(r.col_018), 0)
  ) * coalesce(
    (SELECT precio_dex_promedio_pesos_mwh
     FROM public.vw_precio_dex_promedio_mensual
     WHERE anio = r.anio AND mes = r.mes),
    0
  )
) as compra_spot_pesos,
```

⚠️ **Nota**: esto multiplica volumen TOTAL × precio PROMEDIO, lo cual es una
aproximación. La versión 100% precisa requiere multiplicar cada banda × su precio
específico, pero implica reescribir el parser preservando `tipo_dia`. Para Fase A,
la aproximación es suficiente y mejora dramáticamente lo actual ($0 → ~85% precisión).

### Verificación

```sql
-- Antes: spot_pesos era 0 para GUDI
-- Después: tiene valores razonables
SELECT tipo_agente, count(*),
  avg(spot_pesos) FILTER (WHERE spot_pesos > 0) as avg_spot
FROM public.vw_exposicion_spot_mensual
WHERE anio = 2026
GROUP BY tipo_agente;
```

---

## 9. FIX #3 — GUME legacy parser (CONDICIONAL)

**Severidad**: depende del resultado de validación. **Acción**: validar primero.

### Pre-requisito: validación de existencia del bug

El bug es **teórico** hasta que se validen los datos. Antes de tocar código,
correr las queries de:
- `C:\Users\quime\Documents\Energyos\Validacion GUME Legacy\02_validate_gume_legacy_vs_dte.sql`

**Resultados posibles**:

| Query 1 | Query 3 (mayoría) | Acción |
|---|---|---|
| 0 filas | n/a | ✅ **Cerrar Fix #3 sin acción**. Bug teórico, no afecta. |
| Hay filas | `ok` >80% | ✅ **Cerrar Fix #3** con nota. Parser funciona. |
| Hay filas | `BUG_PROBABLE` significativo | 🔧 Ir a Sub-paso 9.A |

### Sub-paso 9.A — Solo si el bug es real

Correr el script:
- `C:\Users\quime\Documents\Energyos\Validacion GUME Legacy\01_inspect_anexo_gume_layout.py`

Necesita ZIPs de DTE 2020-2022 en `./dte_zips/`. El script genera
`reporte_layout_gume.md` que muestra exactamente qué columna del HTML real
representa qué concepto.

Con esa info, reescribir las CTEs `gume_22` y `gume_31` en
`scripts/sql/railway_exposicion_spot_mat.sql` con el mapeo correcto.

---

## 10. Orden recomendado de ejecución y testing

```
1. Fix #6 (label)            → 2 min   → verificar UI
2. Fix #4 (obligación)       → 5 min   → verificar SQL
3. Fix #5 (UX cumple)        → 30 min  → verificar UI
4. Fix #1.A (sync dolar)     → 15 min  → verificar tabla
5. Fix #1.B (modify view)    → 30 min  → verificar SQL + UI
6. Fix #2.A (sync DEX)       → 15 min  → verificar tabla
7. Fix #2.B (modify branch)  → 30 min  → verificar SQL
8. Fix #3 (validate first)   → 5 min   → según resultado, hacer o cerrar
```

**Después de cada fix**: hacer commit separado con mensaje descriptivo:
```
git add -A
git commit -m "fix(N): descripción breve"
```

---

## 11. Checklist de éxito de Fase A

Al terminar todos los fixes, debe cumplirse:

- [ ] Frontend `/app/perfil-carga` dice "Horas 0–5h" (Fix #6)
- [ ] `vw_compliance_27191_mensual` tiene `obligacion_pct` no-null para 2017-2020 (Fix #4)
- [ ] Frontend `/app/cumplimiento-renovable` muestra banner sobre evaluación anual (Fix #5)
- [ ] Frontend muestra `cumple_ytd` con prominencia visual (Fix #5)
- [ ] `vw_compliance_27191_mensual` calcula multa con `multa_metodo = 'cvp_alternativos'` para meses con CVP disponible (Fix #1)
- [ ] Multa en pesos para clientes con brecha es ~5-7x mayor que antes (Fix #1)
- [ ] `vw_exposicion_spot_mensual` tiene `spot_pesos > 0` para clientes GUDI con compras spot (Fix #2)
- [ ] Fix #3 está cerrado (con o sin acción) según validación
- [ ] Todos los cambios SQL fueron commiteados al repo
- [ ] `pipeline/load_combustibles_historico.py` y los `sync_*_a_railway.py` están documentados en RUNBOOK

---

## 12. Apéndice — credenciales y secrets

**No incluir credenciales reales en commits**. Usar variables de entorno:
- `DATABASE_URL` o `RAILWAY_DATABASE_URL` (Railway Postgres)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase)

El usuario debe rotar todas las credenciales que hayan pasado por chat o logs.

---

## 13. Apéndice — resumen del estado de datos

Al inicio de Fase A, en Railway existen estas tablas/vistas relevantes:

```
public.compliance_27191_obligacion          (config % por año)
public.combustibles_precios_mensual         (NUEVO, 63 filas, 2021-2026) ⭐
public.vw_compliance_27191_mensual          (mart compliance)
public.vw_consumo_gu_mensual                (mart consumo)
public.vw_exposicion_spot_mensual           (mart exposición)
public.vw_factor_carga_mensual              (mart perfil)
public.vw_factor_carga_benchmark            (benchmark perfil)
public.vw_renovable_contratado_mensual      (intermediate)
+ todas las raw_* tables                    (~42)
```

Tablas que se crearán en Fase A:
```
public.cotizacion_dolar_mensual             (NUEVA - Fix #1.A)
public.precios_dex_mensual                  (NUEVA - Fix #2.A)
public.vw_precio_dex_promedio_mensual       (NUEVA - Fix #2.A)
```

---

**Fin del documento.**

Si hay dudas sobre la lógica regulatoria, consultar `docs/dominio_mem.md` que tiene
el contexto Ley 27.191, Resolución 281/2017, etc.

Si hay dudas sobre el código actual, ver:
- `scripts/sql/railway_compliance_27191.sql`
- `scripts/sql/railway_exposicion_spot_mat.sql`
- `supabase/functions/gu-compliance-27191/index.ts`
- `supabase/functions/gu-exposicion/index.ts`
