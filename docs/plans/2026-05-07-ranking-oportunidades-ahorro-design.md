# Ranking Oportunidades de Ahorro Design

## Objetivo

Mostrar al cliente donde hay mas dinero o riesgo economico para atacar primero, usando solo informacion ya disponible en EnergyOS.

## Valor para el cliente

Los grandes consumidores no necesitan solo mas graficos: necesitan priorizar. El ranking responde: "que reviso primero, cuanto puede valer y de donde sale la oportunidad".

## Alcance v1

- Ranking por NEMO y ventana temporal.
- Fuentes: DTE, exposicion spot, compliance 27.191 y consumo historico.
- Estimacion conservadora por oportunidad:
  - DTE: importe revisable o desvio de reconciliacion.
  - Spot: ahorro potencial por reducir 25% de la compra spot expuesta.
  - Compliance: multa estimada evitable.
  - Consumo: delta de consumo contra mismo mes del anio anterior valorizado por costo DTE cuando exista.
- Cada item muestra impacto, prioridad, confianza, periodo, modulo origen y recomendacion.

## No Alcance v1

- No usa contratos privados ni precios pactados.
- No promete ahorro garantizado; muestra "potencial estimado" y contexto.
- No reemplaza la bandeja de acciones. El ranking prioriza; acciones gestionan seguimiento.

## Arquitectura

Railway Postgres crea una vista materializada con oportunidades normalizadas y ranking. Una Edge Function valida JWT y NEMOs autorizados, consulta Railway y devuelve resumen + top oportunidades. React suma una pantalla nueva en `/app/oportunidades-ahorro`.
