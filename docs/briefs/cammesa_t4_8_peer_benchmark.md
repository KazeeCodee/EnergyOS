# Brief T4.8 - Peer Benchmark

## Depende de

- T3.5 `peer_benchmark_mensual`

## Objetivo

Dashboard anonimizado para comparar demanda, MATER pct y costo monomico contra pares.

## UX

- Percentiles P25/P50/P75.
- Posicion del cliente si tiene permiso.
- Filtros: tipo agente, region, tarifa.
- Ocultar segmentos con `n_agentes < 5`.

## Checks

- Nunca mostrar datos identificables de pares.
- Empty state si el grupo no cumple minimo de anonimato.
