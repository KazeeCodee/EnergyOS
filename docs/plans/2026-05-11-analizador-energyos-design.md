# Analizador EnergyOS Design

## Objetivo

Crear una capa transversal de analisis sobre los datos que ya generan los
modulos de EnergyOS. La capa no reemplaza los modulos actuales: los usa como
fuente de evidencia para detectar problemas, riesgos, oportunidades de mejora y
acciones recomendadas por empresa/NEMO.

En una frase: los modulos producen datos confiables; el Analizador EnergyOS
convierte esos datos en decisiones accionables.

## Problema

EnergyOS ya calcula informacion valiosa sobre spot, DTE, cumplimiento renovable,
perfil de carga, historia energetica y contexto de mercado. El problema es que
muchos usuarios futuros no compran ni usan el sistema pensando en terminos de
MEM, DTE, MATER o Ley 27.191.

Para un duenio, gerente, CFO o responsable administrativo, el valor aparece
cuando el sistema responde:

- que problema hay;
- por que importa;
- cuanto puede impactar;
- que deberia hacer;
- que dato respalda la conclusion.

## Direccion De Producto

Agregar un motor de analisis auditable que siga este flujo:

```text
dato del modulo -> senial -> diagnostico -> prioridad -> accion -> evidencia
```

Ejemplo:

```text
Dato:
Spot promedio ultimos 3 meses = 58%.

Senial:
Exposicion variable sostenida.

Diagnostico:
La empresa depende demasiado del mercado spot.

Prioridad:
Alta.

Accion:
Revisar cobertura contractual para los proximos meses.

Evidencia:
Modulo Exposicion Spot, ultimos 12 meses.
```

## Principios

- No consultar datos crudos CAMMESA desde la UI del analizador.
- No inventar conclusiones sin evidencia.
- No usar IA libre para decidir alertas en la primera version.
- Mantener reglas simples, auditables y testeables.
- Separar deteccion tecnica de redaccion comercial.
- Permitir que el mismo diagnostico se explique distinto segun perfil de
  usuario o tipo de operacion.
- Guardar una estructura reutilizable para pantalla, emails, informes PDF y
  asesores.

## Alcance Inicial

El MVP usa datos existentes de:

- Exposicion Spot.
- Auditoria DTE / Costos MEM.
- Cumplimiento Ley 27.191.
- Perfil de Carga.
- Historia Energetica.
- Informe de Inicio / contexto de mercado.

Genera:

- alertas;
- riesgos;
- oportunidades;
- mejoras operativas;
- acciones recomendadas;
- evidencia de respaldo;
- prioridad y confianza.

## Fuera De Alcance Inicial

- No crear una IA conversacional.
- No modificar las formulas de los modulos existentes.
- No cambiar RLS, permisos, login ni onboarding.
- No prometer ahorro garantizado.
- No generar PDFs ni emails en el primer corte, aunque el modelo queda listo
  para eso.
- No crear una capa backend nueva hasta validar el modelo en frontend con datos
  existentes.

## Modelo Conceptual

```ts
type AnalizadorInsight = {
  id: string;
  periodo: string;
  moduloOrigen: "spot" | "dte" | "renovables" | "perfil_carga" | "historia" | "mercado";
  tipo: "alerta" | "riesgo" | "oportunidad" | "mejora";
  prioridad: "alta" | "media" | "baja";
  confianza: "alta" | "media" | "baja";
  titulo: string;
  problema: string;
  impacto: string;
  accionRecomendada: string;
  responsableSugerido: "duenio" | "finanzas" | "administracion" | "energia" | "asesor";
  evidencia: Array<{
    label: string;
    valor: string;
    fuente: string;
    urlModulo: string;
  }>;
  estado: "nuevo" | "en_revision" | "resuelto" | "descartado";
};
```

La primera version puede omitir persistencia de `estado` y calcular todo en
runtime. El modelo conserva el campo para una fase posterior de seguimiento.

## Generacion De Seniales

Cada modulo aporta seniales normalizadas.

### Spot

- `spot_alto`: porcentaje spot supera umbral mensual.
- `spot_sostenido`: porcentaje spot supera umbral durante varios meses.
- `subcontrato`: demanda real supera cobertura contratada.
- `costo_spot_alto`: costo spot promedio supera referencia historica.

### DTE

- `dte_revisable`: importe revisable positivo.
- `dte_revisable_material`: importe revisable supera umbral relativo.
- `dte_variacion_alta`: costo DTE/MWh sube contra promedio historico.
- `dte_sin_desglose`: faltan conceptos para explicar el ultimo DTE.

### Renovables

- `brecha_renovable`: no cumple ritmo anual.
- `multa_potencial`: multa estimada positiva.
- `cobertura_renovable_baja`: porcentaje renovable por debajo de obligacion.

### Perfil De Carga

- `pico_alto`: consumo concentrado en pico.
- `pico_percentil_alto`: el agente esta por encima del percentil esperado.
- `ratio_pico_valle_alto`: hay posible oportunidad de corrimiento.

### Historia / Mercado

- `demanda_fuera_de_patron`: suba o caida anomala contra promedio.
- `costo_fuera_de_patron`: costo por MWh fuera de tendencia.
- `contexto_mercado_volatil`: mercado nacional con variables adversas.

## Reglas MVP

Las reglas iniciales deben ser conservadoras:

```text
Si spot >= 70% en el ultimo mes:
  generar riesgo alto de exposicion spot.

Si spot >= 40% durante al menos 2 de los ultimos 3 meses:
  generar alerta media de exposicion sostenida.

Si importe revisable DTE > 0:
  generar alerta de auditoria.

Si importe revisable DTE / factura DTE >= 3%:
  subir prioridad a alta.

Si cumple Ley 27.191 = false o brecha YTD > 0:
  generar riesgo regulatorio.

Si percentil pico >= 75% o ratio pico/valle >= 1,8:
  generar oportunidad de mejora operativa.

Si costo DTE/MWh sube >= 20% contra promedio de 6 meses:
  generar alerta de costo fuera de patron.
```

Los umbrales deben vivir en una configuracion central para poder ajustarlos sin
reescribir componentes.

## Priorizacion

La prioridad combina:

- severidad de la regla;
- impacto economico estimado o relativo;
- repeticion en meses;
- riesgo regulatorio;
- confianza del dato;
- tipo de operacion cuando este disponible.

Orden sugerido:

1. Riesgo regulatorio material.
2. DTE revisable material.
3. Exposicion spot alta o sostenida.
4. Costo/MWh fuera de patron.
5. Perfil horario mejorable.
6. Alertas informativas.

## Redaccion Por Perfil

La deteccion es tecnica, pero la redaccion debe adaptarse.

### Duenio / CFO

Foco: plata, riesgo y decision.

```text
Hay una exposicion sostenida a precio variable. Conviene revisar cobertura para
mejorar previsibilidad de costos.
```

### Administracion

Foco: control mensual y documentacion.

```text
Marcar este periodo para revision y adjuntar el detalle al informe mensual.
```

### Energia / Planta

Foco: operacion y patron de consumo.

```text
Revisar si hay consumos desplazables fuera de horas pico o cambios de turno que
expliquen el patron.
```

### Asesor Tecnico

Foco: evidencia, formula y fuente.

```text
Comparar compra spot mensual contra demanda contratada y validar subcontrato en
la serie de 12 meses.
```

## Salidas Del Analizador

El motor debe entregar una respuesta reutilizable:

- resumen general;
- insight principal;
- lista de insights ordenados;
- conteo por prioridad;
- modulos con evidencia;
- mensajes listos para UI;
- datos suficientes para futuro PDF/email.

Ejemplo:

```ts
type AnalizadorResumen = {
  estadoGeneral: "normal" | "observacion" | "critico";
  focoPrincipal: string;
  prioridadMaxima: "alta" | "media" | "baja" | null;
  totalInsights: number;
  insightsAlta: number;
  insightsMedia: number;
  insightsBaja: number;
};
```

## UI Inicial

Crear una ruta nueva:

```text
/app/analizador
```

La pantalla muestra:

1. Estado general de la empresa.
2. Foco principal detectado.
3. Lista priorizada de alertas/oportunidades.
4. Evidencia por insight.
5. Accesos al modulo tecnico que respalda cada conclusion.

No debe competir con Home. Home sigue siendo resumen del sistema; Analizador es
la capa de interpretacion y accion.

## Arquitectura

Archivos sugeridos:

```text
src/types/analizador.ts
src/services/analizador.ts
src/services/analizador.rules.ts
src/services/analizador.test.ts
src/pages/app/Analizador.tsx
src/components/app/InsightCard.tsx
```

Integracion:

- `Analizador.tsx` usa los servicios existentes de modulos.
- `analizador.ts` normaliza entradas y llama al motor.
- `analizador.rules.ts` contiene umbrales y reglas puras.
- Tests unitarios cubren reglas, prioridad y degradacion sin datos.
- `AppShell.tsx` agrega la navegacion nueva.
- `App.tsx` agrega la ruta lazy.

## Manejo De Datos Incompletos

Si falta un modulo, el analizador debe seguir funcionando con los otros.

Reglas:

- No mostrar error global si solo falla un modulo secundario.
- Mostrar evidencia incompleta como confianza media o baja.
- No generar alertas que dependan de datos ausentes.
- Mostrar una nota: "Analisis parcial por datos no disponibles".

## Criterios De Aceptacion

- Existe una ruta nueva `/app/analizador`.
- La ruta no rompe Home ni modulos existentes.
- El analizador genera insights con reglas puras y testeadas.
- Cada insight incluye problema, impacto, accion y evidencia.
- Los insights se ordenan por prioridad.
- La pantalla degrada correctamente si faltan datos.
- La navegacion muestra el nuevo modulo.
- `npm run build` pasa.

## Evolucion Posterior

Fase 2:

- persistir insights por NEMO/periodo;
- estados de gestion: nuevo, en revision, resuelto;
- exportar informe PDF;
- email mensual automatico;
- selector de perfil de lectura;
- recomendaciones por tipo de operacion;
- asistente IA que redacte explicaciones usando insights ya calculados, sin
  decidir reglas por su cuenta.
