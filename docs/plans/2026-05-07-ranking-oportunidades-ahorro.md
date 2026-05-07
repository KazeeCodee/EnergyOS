# Ranking Oportunidades Ahorro Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a ranked opportunities page that prioritizes estimated savings and avoidable costs for large energy consumers.

**Architecture:** Railway owns the opportunity mart because the analytical sources are there. Supabase Edge Function enforces the user/NEMO boundary. React renders a focused ranking page with summary cards, filters and source links.

**Tech Stack:** Postgres, Supabase Edge Functions, React, TypeScript, Tailwind, lucide-react.

---

### Task 1: SQL Tests

**Files:**
- Create: `tests/test_oportunidades_ahorro_sql.py`

**Steps:**
- Assert isolated materialized view/function creation.
- Assert sources include DTE, spot, compliance, consumo and actions.
- Assert ranking fields: `ranking_score`, `impacto_estimado_pesos`, `confianza`, `prioridad`.
- Assert refresh supports optional `_anio`, `_mes`, `_nemo`.

### Task 2: Railway SQL

**Files:**
- Create: `scripts/sql/railway_oportunidades_ahorro.sql`

**Steps:**
- Create `refresh_oportunidades_ahorro`.
- Create `vw_oportunidades_ahorro_mensual`.
- Normalize opportunities from DTE, spot, compliance and consumption.
- Add indexes for NEMO/period and ranking.

### Task 3: Edge Function

**Files:**
- Create: `supabase/functions/gu-oportunidades-ahorro/index.ts`

**Steps:**
- Validate JWT and `current_user_nemos`.
- Refresh selected NEMO before reading.
- Return ranking, summary and available NEMOs.

### Task 4: Frontend

**Files:**
- Create: `src/types/oportunidadesAhorro.ts`
- Create: `src/services/oportunidadesAhorro.ts`
- Create: `src/pages/app/ModuloOportunidadesAhorro.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Steps:**
- Add route `/app/oportunidades-ahorro`.
- Render ranking cards/table with impact, priority, confidence and recommended action.
- Add sidebar/mobile nav item without overflowing mobile layout.

### Task 5: Verification

**Commands:**
- `python tests\test_oportunidades_ahorro_sql.py`
- Existing SQL tests.
- `npm run build`
- Apply Railway SQL and query sample agent.
- Deploy Edge Function.
- Check local route HTTP 200.
