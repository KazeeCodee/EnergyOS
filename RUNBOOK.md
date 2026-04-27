# Carga Historica Completa

## 1. PowerShell

```powershell
cd E:\Proyectos\GitHub\EnergyOS

$env:SUPABASE_URL="https://xknyqrfzkstmnlkcjfpa.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:CAMMESA_LOADER_USER_ID="<uuid-admin>"

python pipeline\carga_historica.py --desde 2020-02 --hasta 2020-12
python pipeline\carga_historica.py --desde 2021-01 --hasta 2021-12
python pipeline\carga_historica.py --desde 2022-01 --hasta 2022-12
python pipeline\carga_historica.py --desde 2023-01 --hasta 2023-12
python pipeline\carga_historica.py --desde 2024-01 --hasta 2024-12
python pipeline\carga_historica.py --desde 2025-01 --hasta 2025-12
python pipeline\carga_historica.py --desde 2026-01 --hasta 2026-04
```

## 1.1. Carga raw historica de Modulos 1, 2, 3 y 4

Para centralizar la fuente cruda que hoy usan los modulos operativos, el repo incluye:

- migracion: `supabase/migrations/20260426110000_cammesa_raw_m1_tables.sql`
- migracion: `supabase/migrations/20260426123000_cammesa_raw_m234_tables.sql`
- importador: `pipeline/import_raw_sql_to_supabase.py`

### Crear tablas en Supabase

```powershell
cd E:\Proyectos\GitHub\EnergyOS

$env:SUPABASE_ACCESS_TOKEN="<personal-access-token>"
npx supabase db push --linked --include-all
```

Notas:

- El proyecto ya esta linkeado localmente.
- Si no queres usar `SUPABASE_ACCESS_TOKEN`, tambien podes empujar la migracion con password de Postgres remota usando `npx supabase db push --linked -p "<db-password>"`.

### Importar `raw_amat`, `raw_agum` y `raw_atra`

```powershell
cd E:\Proyectos\GitHub\EnergyOS

$env:SUPABASE_URL="https://xknyqrfzkstmnlkcjfpa.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

python pipeline\import_raw_sql_to_supabase.py `
  --sql-dir "C:\Users\quime\Documents\Playground\cammesa_sql_raw_2026_02_03" `
  --tables raw_amat raw_agum raw_atra `
  --batch-size 500
```

Opciones utiles:

- `--truncate`: limpia la tabla antes de importar.
- `--max-rows 1000`: carga parcial para prueba.

### Verificacion minima

```sql
select 'raw_amat' as tabla, count(*) as filas, min(make_date(anio, mes, 1)) as desde, max(make_date(anio, mes, 1)) as hasta
from public.raw_amat
union all
select 'raw_agum' as tabla, count(*) as filas, min(make_date(anio, mes, 1)) as desde, max(make_date(anio, mes, 1)) as hasta
from public.raw_agum
union all
select 'raw_atra' as tabla, count(*) as filas, min(make_date(anio, mes, 1)) as desde, max(make_date(anio, mes, 1)) as hasta
from public.raw_atra;
```

### Procesar periodos sin ZIP

El pipeline `pipeline/procesar_mes.py` ahora usa `raw_amat/raw_agum/raw_atra` como fuente primaria del periodo para:

- Modulo 1: consumo y cobertura
- Modulo 2: costos y transporte
- Modulo 4: calidad y completitud operativa

Para Modulo 3, el raw minimo complementa `datos_mercado` y puede reconstruir referencias economicas del periodo sin depender del ZIP.

Ejemplo minimo sin ZIP:

```powershell
cd E:\Proyectos\GitHub\EnergyOS

$env:SUPABASE_URL="https://xknyqrfzkstmnlkcjfpa.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

python pipeline\procesar_mes.py --anio 2026 --mes 3
```

Si queres complementar o refrescar `datos_mercado` para ese mismo periodo sin depender del ZIP, podes pasar Variables Relevantes:

```powershell
python pipeline\procesar_mes.py --anio 2026 --mes 3 --variables-relevantes-xlsx "C:\ruta\Variables Relevantes 2026-03.xlsx"
```

Fallback transitorio:

- si `raw_amat/raw_agum` no estan completos para el periodo, `procesar_mes.py` puede usar un ZIP CAMMESA o un DTE legacy como `input_path`
- si falta `raw_atra`, el periodo puede procesarse igual pero quedara marcado como sospechoso para Modulos 2 y 4
- si no hay raw completo ni archivo fallback, el proceso corta con error claro
- `datos_mercado` no se publica cuando la informacion del mercado del periodo es parcial

### Pantallas admin de validacion

La validacion real de los modulos queda disponible en:

- `/admin/modulo-1`
- `/admin/modulo-2`
- `/admin/modulo-3`
- `/admin/modulo-4`

Cada pantalla usa datos reales ya persistidos en Supabase, no mocks.

## 2. Query SQL de verificacion

Ejecutar esta query despues de cada corrida anual, ajustando el rango segun el anio que acabas de correr:

```sql
WITH meses AS (
  SELECT
    EXTRACT(YEAR FROM gs)::int AS anio,
    EXTRACT(MONTH FROM gs)::int AS mes
  FROM generate_series(date '<fecha_inicio>', date '<fecha_fin>', interval '1 month') gs
),
ultimo_procesamiento AS (
  SELECT DISTINCT ON (anio, mes)
    anio,
    mes,
    estado,
    error_message,
    created_at
  FROM procesamientos
  WHERE (anio, mes) BETWEEN
    ((EXTRACT(YEAR FROM date '<fecha_inicio>'))::int, (EXTRACT(MONTH FROM date '<fecha_inicio>'))::int)
    AND
    ((EXTRACT(YEAR FROM date '<fecha_fin>'))::int, (EXTRACT(MONTH FROM date '<fecha_fin>'))::int)
  ORDER BY anio, mes, created_at DESC
),
datos_m AS (
  SELECT anio, mes, COUNT(*) AS filas_datos_mensuales
  FROM datos_mensuales
  WHERE (anio, mes) BETWEEN
    ((EXTRACT(YEAR FROM date '<fecha_inicio>'))::int, (EXTRACT(MONTH FROM date '<fecha_inicio>'))::int)
    AND
    ((EXTRACT(YEAR FROM date '<fecha_fin>'))::int, (EXTRACT(MONTH FROM date '<fecha_fin>'))::int)
  GROUP BY anio, mes
),
mercado AS (
  SELECT anio, mes, COUNT(*) AS filas_datos_mercado
  FROM datos_mercado
  WHERE (anio, mes) BETWEEN
    ((EXTRACT(YEAR FROM date '<fecha_inicio>'))::int, (EXTRACT(MONTH FROM date '<fecha_inicio>'))::int)
    AND
    ((EXTRACT(YEAR FROM date '<fecha_fin>'))::int, (EXTRACT(MONTH FROM date '<fecha_fin>'))::int)
  GROUP BY anio, mes
)
SELECT
  m.anio,
  m.mes,
  up.estado,
  up.error_message,
  COALESCE(dm.filas_datos_mensuales, 0) AS filas_datos_mensuales,
  COALESCE(me.filas_datos_mercado, 0) AS filas_datos_mercado
FROM meses m
LEFT JOIN ultimo_procesamiento up
  ON up.anio = m.anio AND up.mes = m.mes
LEFT JOIN datos_m dm
  ON dm.anio = m.anio AND dm.mes = m.mes
LEFT JOIN mercado me
  ON me.anio = m.anio AND me.mes = m.mes
ORDER BY m.anio, m.mes;
```

Ejemplos de reemplazo:

- 2020: `<fecha_inicio>` = `2020-02-01`, `<fecha_fin>` = `2020-12-01`
- 2021: `<fecha_inicio>` = `2021-01-01`, `<fecha_fin>` = `2021-12-01`
- 2022: `<fecha_inicio>` = `2022-01-01`, `<fecha_fin>` = `2022-12-01`
- 2023: `<fecha_inicio>` = `2023-01-01`, `<fecha_fin>` = `2023-12-01`
- 2024: `<fecha_inicio>` = `2024-01-01`, `<fecha_fin>` = `2024-12-01`
- 2025: `<fecha_inicio>` = `2025-01-01`, `<fecha_fin>` = `2025-12-01`
- 2026: `<fecha_inicio>` = `2026-01-01`, `<fecha_fin>` = `2026-04-01`

## 3. Si un mes falla

1. Revisar en la salida del script que mes fallo.
2. Ejecutar la query de verificacion para identificar `estado` y `error_message`.
3. Reintentar solo el rango pendiente desde el ultimo mes no procesado. Ejemplo:

```powershell
python pipeline\carga_historica.py --desde 2023-08 --hasta 2023-12
```

4. Si el mes quedo con `estado = 'error'`, corregir la causa y volver a correr ese mismo rango.
5. No avanzar al siguiente anio hasta que todos los meses del anio actual figuren como `completo`.
