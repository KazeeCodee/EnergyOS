# Acciones Energeticas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an operational actions inbox generated from existing EnergyOS energy indicators.

**Architecture:** Railway owns action generation because the source marts live there. A Supabase Edge Function validates the authenticated user, filters by `current_user_nemos`, and exposes list/update operations. React adds a new app page and navigation item.

**Tech Stack:** Postgres, Supabase Edge Functions, React, TypeScript, Tailwind, lucide-react.

---

### Task 1: SQL Contract Tests

**Files:**
- Create: `tests/test_acciones_energeticas_sql.py`

**Steps:**
- Assert the SQL creates isolated action/event tables.
- Assert the refresh function reads DTE, spot, compliance and consumo views.
- Assert automatic refresh preserves resolved/discarded actions.
- Assert the function accepts `_nemo` for per-agent refresh.

### Task 2: Railway SQL

**Files:**
- Create: `scripts/sql/railway_acciones_energeticas.sql`

**Steps:**
- Create `acciones_energeticas` and `acciones_energeticas_eventos`.
- Create indexes for `(nemo, estado, anio, mes)` and unique generated rule key.
- Create `refresh_acciones_energeticas(_anio int, _mes int, _nemo text)`.
- Generate five rules: DTE reconciliation, DTE monthly variation, high spot exposure, compliance gap, consumption variation.

### Task 3: Edge Function

**Files:**
- Create: `supabase/functions/gu-acciones-energeticas/index.ts`

**Steps:**
- Validate JWT and fetch `current_user_nemos`.
- On GET, refresh actions for selected NEMO and return summary/list.
- On PATCH, update status/comment only if the action belongs to an authorized NEMO.

### Task 4: Frontend

**Files:**
- Create: `src/types/accionesEnergeticas.ts`
- Create: `src/services/accionesEnergeticas.ts`
- Create: `src/pages/app/ModuloAccionesEnergeticas.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Steps:**
- Add types and service wrapper.
- Build a dense operational page with filters, stats, cards/table and status actions.
- Register route `/app/acciones`.
- Add sidebar and mobile nav item.

### Task 5: Verification

**Commands:**
- `python tests\test_acciones_energeticas_sql.py`
- `npm run build`
- Apply SQL to Railway and refresh.
- Deploy Edge Function.
- Check local route returns HTTP 200.
