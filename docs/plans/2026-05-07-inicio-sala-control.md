# Inicio Sala De Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convertir `Inicio` en una sala de control compacta con insights y previews de modulos existentes.

**Architecture:** Mantener `AppHome.tsx` como pagina contenedora, pero extraer helpers puros para calcular lectura ejecutiva y tarjetas de modulos. La UI reutiliza componentes existentes y solo agrega fetches opcionales a servicios ya presentes.

**Tech Stack:** React 19, TypeScript, Vite, Recharts, Tailwind, Supabase Edge Functions existentes.

---

### Task 1: Helpers Testables

**Files:**
- Create: `src/pages/app/AppHome.helpers.ts`
- Create: `src/pages/app/AppHome.helpers.test.ts`

**Step 1:** Escribir tests para `buildExecutiveInsights` y `buildModulePreviewState`.

**Step 2:** Ejecutar `npx tsc --noEmit` y verificar que falle porque los helpers no existen.

**Step 3:** Implementar helpers puros con umbrales de riesgo spot, renovables, perfil horario y auditoria DTE.

**Step 4:** Ejecutar `npx tsc --noEmit` y verificar que pase.

### Task 2: Home Sala De Control

**Files:**
- Modify: `src/pages/app/AppHome.tsx`

**Step 1:** Importar servicios existentes para spot, cumplimiento, factor de carga, historia y auditoria.

**Step 2:** Agregar fetches opcionales con `useAsyncData`, sin bloquear la carga principal de informe.

**Step 3:** Crear secciones: lectura ejecutiva, graficos actuales, mosaico de modulos.

**Step 4:** Mantener degradacion limpia si una respuesta no trae datos.

### Task 3: Verificacion

**Files:**
- Test: `src/pages/app/AppHome.helpers.test.ts`
- Build: project

**Step 1:** Ejecutar `npm run build`.

**Step 2:** Iniciar `npm run dev -- --host 127.0.0.1`.

**Step 3:** Abrir localmente y verificar que la app no tenga errores de compilacion.
