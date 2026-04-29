# Child Chat Dispatch Template

Copiar y completar para despachar tareas.

```markdown
Necesito que implementes [ID] [nombre].

Contexto obligatorio:
- Repo: EnergyOS
- No tocar cargas activas ni revertir cambios ajenos.
- Leer primero:
  - `docs/cammesa_execution_handoff.md`
  - `docs/dataflow.md`
  - `[brief especifico]`

Alcance:
- Crear/modificar solo los archivos indicados por el brief.
- No consultar `raw_*` desde UI.
- Usar migrations con `npx supabase migration new`.
- Verificar con los comandos del brief.

Entregable:
- Lista de archivos cambiados.
- Comandos ejecutados y resultado.
- Queries de reconciliacion.
- Riesgos o pendientes.

Criterio de aceptacion:
- Todos los checks del brief pasan.
- No hay cambios fuera de scope.
```
