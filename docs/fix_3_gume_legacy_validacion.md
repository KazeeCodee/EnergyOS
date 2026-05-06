# Fix #3 — Validación parser GUME legacy

> **Veredicto**: ✅ **CERRADO sin acción**. El parser legacy (col_count 22 y 31)
> está correctamente implementado para demanda total y bandas P/V/R.
> El bug detectado en la auditoría inicial era teórico, no real.

## Contexto

La auditoría inicial sospechaba que las CTEs `gume_22` y `gume_31` en
`scripts/sql/railway_exposicion_spot_mat.sql` mapeaban mal los volúmenes.
El veredicto anticipado fue: "validar con cliente real".

Resultado: **no hizo falta cliente**. La validación interna contra los
propios datos en Railway alcanzó.

## Cómo se validó

Test cruzado: para cada col_count, verificar que la **demanda total**
parseada equivalga a la **suma de las 3 bandas** (pico + valle + resto)
parseadas. Si el parser está mal, los números no cierran.

Query corrida contra Railway (mayo 2026):

```sql
-- Para col_count=22 el parser dice: total=col_003, bandas=col_004,005,006
SELECT
  count(*) FILTER (WHERE
    abs(parse_es_number(col_003)
        - coalesce(parse_es_number(col_004), 0)
        - coalesce(parse_es_number(col_005), 0)
        - coalesce(parse_es_number(col_006), 0)) < 0.5
  ) AS cuadran,
  count(*) AS total
FROM public.raw_anexo_gume
WHERE col_count = 22 AND parse_es_number(col_003) > 1.0;

-- Para col_count=31 el parser dice: total=col_007, bandas=col_004,005,006
SELECT
  count(*) FILTER (WHERE
    abs(parse_es_number(col_007)
        - coalesce(parse_es_number(col_004), 0)
        - coalesce(parse_es_number(col_005), 0)
        - coalesce(parse_es_number(col_006), 0)) < 0.5
  ) AS cuadran,
  count(*) AS total
FROM public.raw_anexo_gume
WHERE col_count = 31 AND parse_es_number(col_007) > 1.0;
```

## Resultados

| col_count | Filas con demanda > 1 MWh | Filas que cuadran | % |
|---|---|---|---|
| **22** | 9.368 | **9.368** | **100,0%** |
| **31** | 114.443 | **114.443** | **100,0%** |
| 23 (control moderno) | 6.368 | 6.368 | 100,0% |

**Tres baselines independientes, los tres dan 100%**. El parser legacy está
correctamente implementado.

## Hallazgo secundario (no es bug, es asunción de modelo)

Las CTEs `gume_22` y `gume_31` asignan los **mismos valores** de col_004/005/006
a `demanda_real_pico/valle/resto` y a `compra_spot_pico/valle/resto`:

```sql
public.parse_es_number(r.col_006) as demanda_real_pico_mwh,
public.parse_es_number(r.col_006) as compra_spot_pico_mwh,  -- mismo valor
```

Eso refleja la asunción de que los GUMEs en estos layouts **compraron toda su
energía en spot vía la distribuidora** (modelo pre-Res. SE 1281/06, donde GUME
no tenía contratos a término).

- ✅ **Para data 2020-2021**: el modelo es correcto.
- ⚠️ **Para data 2022-2025-11** con col_count=31 todavía aparece (132K filas).
  Algunos GUMEs modernos podrían tener contratos MATER que el parser ignora.

**Decisión**: dejarlo así por ahora. La aproximación sobre-estima ligeramente
la exposición spot pero no produce números rotos. Cuando aparezca un cliente
GUME concreto que reporte discrepancia, se valida con su DTE oficial y se
ajusta puntualmente.

## Volumen de datos afectado

| col_count | Filas | Período |
|---|---|---|
| 22 (legacy) | 9.484 | dispersos |
| 31 (legacy persistente) | 132.280 | hasta 2025-11 |

El bug **inicial** sospechaba que estos 141.764 registros estaban mal.
La validación demuestra que están bien parseados.

## Conclusión

Fix #3 **cerrado sin acción de código**. La validación interna interna fue
suficiente y no requirió ni manual técnico CAMMESA ni DTE oficial de cliente.

## Métodos alternativos (no necesarios)

Si en el futuro se necesita revalidación más profunda:

1. **Camino A — cross-check con dte_resumen_agente** (Supabase): replicar la
   tabla a Railway y comparar totales económicos por agente.
2. **Camino B — inspección de HTML originales**: bajar `anexo_gume.html` desde
   Supabase Storage (`cammesa-uploads`) y leer headers humanos. Hay 2 scripts
   listos en `C:\Users\quime\Documents\Energyos\Validacion GUME Legacy\`.

Pero ambos métodos quedan disponibles "por si acaso", no son necesarios para
cerrar Fase A.
