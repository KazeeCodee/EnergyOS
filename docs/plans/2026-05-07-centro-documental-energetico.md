# Centro Documental Energetico Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a private energy document center with contract metadata and structured MATER/provider fields.

**Architecture:** Supabase stores document metadata, contract facts and private files. Edge Function validates the user and NEMO boundary before metadata creation/listing and signed downloads. React provides upload, contract form and document list.

**Tech Stack:** Supabase Postgres, Supabase Storage, Supabase Edge Functions, React, TypeScript, Tailwind.

---

### Task 1: Migration Tests

**Files:**
- Create: `tests/test_centro_documental_sql.py`

**Steps:**
- Assert tables and bucket are created.
- Assert RLS is enabled.
- Assert policies use `current_user_nemos`.
- Assert contract fields include price, currency, term, take-or-pay and volume.

### Task 2: Supabase Migration

**Files:**
- Create: `supabase/migrations/20260507090000_centro_documental_energetico.sql`

**Steps:**
- Create `documentos_energeticos`.
- Create `contratos_energeticos`.
- Create `documentos_energeticos_eventos`.
- Create private bucket `energy-documents`.
- Add RLS and storage policies.

### Task 3: Edge Function

**Files:**
- Create: `supabase/functions/gu-centro-documental/index.ts`

**Steps:**
- Validate JWT.
- Fetch `current_user_nemos`.
- Support GET list, POST metadata/contract creation, PATCH update and POST signed URL action.

### Task 4: Frontend

**Files:**
- Create: `src/types/centroDocumental.ts`
- Create: `src/services/centroDocumental.ts`
- Create: `src/pages/app/ModuloCentroDocumental.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Steps:**
- Add route `/app/centro-documental`.
- Add document upload form and optional contract ficha.
- Add cards for value unlocked and upcoming expirations.
- Add document/contract lists.

### Task 5: Verification

**Commands:**
- `python tests\test_centro_documental_sql.py`
- Existing SQL tests.
- `npm run build`
- Deploy Edge Function.
- Check local route HTTP 200 and unauth endpoint 401.
