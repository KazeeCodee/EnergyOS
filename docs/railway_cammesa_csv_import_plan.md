# Railway CAMMESA CSV Import Plan

Este plan cubre la carpeta:

```powershell
C:\Users\quime\Downloads\CAMMESA
```

Estos archivos no forman parte de la carga `raw_*.sql`. Son catalogos y series CSV auxiliares.

## Clasificacion

| Archivo | Tabla Railway | Necesidad | Uso |
|---|---|---|---|
| `agentes-mem.csv` | `cammesa_agentes_mem` | Critico | Catalogo maestro para buscar/vincular empresa/NEMO en onboarding |
| `consumo_electrico_sectores_manufactureros_desestacionalizado.csv` | `cammesa_consumo_manufacturero_desestacionalizado` | Util | Contexto macro/benchmark industrial |
| `consumo_electrico_sectores_manufactureros_original.csv` | `cammesa_consumo_manufacturero_original` | Util | Serie macro original |
| `Operaciones del Mercado Electrico Mayorista/DemandaYTemperatura_23042026.csv` | `cammesa_operaciones_demanda_temperatura` | Util | Serie intradiaria para dashboards operativos |
| `Operaciones del Mercado Electrico Mayorista/Generacion_23042026.csv` | `cammesa_operaciones_generacion` | Util | Serie intradiaria de generacion/mix |
| `Operaciones del Mercado Electrico Mayorista/PorcentajeGeneracion_23042026.csv` | `cammesa_operaciones_porcentaje_generacion` | Util | Serie intradiaria de mix porcentual |
| `Publicaciones MEMnet/DemandaYTemperatura_23042026.csv` | `cammesa_memnet_demanda_temperatura` | Duplicado util | Misma familia, fuente MEMnet separada para comparar |
| `Publicaciones MEMnet/Generacion_23042026.csv` | `cammesa_memnet_generacion` | Duplicado util | Misma familia, fuente MEMnet separada |
| `Publicaciones MEMnet/PorcentajeGeneracion_23042026.csv` | `cammesa_memnet_porcentaje_generacion` | Duplicado util | Misma familia, fuente MEMnet separada |

## Decision

Para producto, el minimo imprescindible es:

```text
cammesa_agentes_mem
```

Sin esa tabla el sistema puede calcular si se conoce el NEMO, pero queda roto o manual el flujo:

```text
usuario busca empresa -> elige agente/NEMO -> se vincula a cuenta -> se activa seguimiento
```

Las otras tablas no bloquean onboarding, pero conviene subirlas porque son chicas y pueden alimentar paneles operativos/marketing.

## Script

Archivo:

```powershell
pipeline\railway_load_cammesa_csvs.py
```

Wrapper:

```powershell
scripts\run_railway_cammesa_csv_load.ps1
```

## Comandos

Inventario contra Railway:

```powershell
railway run python pipeline\railway_load_cammesa_csvs.py inventory
```

Subir solo lo critico:

```powershell
.\scripts\run_railway_cammesa_csv_load.ps1 -Critical
```

Subir todo:

```powershell
.\scripts\run_railway_cammesa_csv_load.ps1 -All
```

Auditar:

```powershell
railway run python pipeline\railway_load_cammesa_csvs.py audit
```

## Seguridad

- La carga es idempotente: usa `ON CONFLICT DO UPDATE`.
- Cada CSV queda en su tabla separada.
- No toca ni frena la carga `raw_*`.
- `cammesa_agentes_mem` conserva el nombre esperado por el frontend/backend actual.
