# Data Room Cliente Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first EnergyOS `Mi empresa` module so private client data has a strategic home, starting with structured MATER contract capture.

**Architecture:** Add a typed private-data model, pure validation/completeness rules, a navigable `/app/empresa` screen, a Railway private schema, and a Supabase Edge Function used only as an authenticated API gateway.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Tailwind CSS, lucide-react, Supabase Auth for identity, Railway Postgres for private client data.

---

### Task 1: Strategic Design Doc

**Files:**
- Create: `docs/plans/2026-05-17-data-room-cliente-design.md`

**Steps:**
1. Document why documents are evidence, not the primary data source.
2. Define the product location as `/app/empresa`.
3. Define private-data blocks: sites, contracts, invoices, forecast, claims, SMEC, responsibles, documents.
4. Define canonical formats and monetary normalization.
5. Define MATER as the anchor form.

### Task 2: Types And Validation

**Files:**
- Create: `src/types/dataRoom.ts`
- Create: `src/services/dataRoom.validation.ts`
- Create: `src/services/dataRoom.validation.test.ts`

**Behavior:**
- Validate NEMO length.
- Validate date ranges.
- Validate ARS/USD currency.
- Validate positive energy and prices.
- Require adjustment index/frequency for indexed contracts.
- Require technology when the contract is renewable.
- Compute completeness by block.

**Verification:**

```bash
npx tsc --noEmit
```

### Task 3: Mi Empresa Page

**Files:**
- Create: `src/pages/app/MiEmpresa.tsx`

**Behavior:**
- Show a completeness dashboard.
- Show sections for all private-data blocks requested by the user.
- Include a structured MATER contract form prototype.
- Validate form data locally before marking it ready.
- Keep documents positioned as evidence linked to structured fields.

**Verification:**

```bash
npm run build
```

### Task 4: Route And Navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Behavior:**
- Add `/app/empresa`.
- Add nav item `Mi empresa`.
- Keep `Ajustes` for account/session settings only.

**Verification:**

```bash
npm run build
```

### Task 5: Railway Persistence And Authenticated API

**Files:**
- Create: `scripts/sql/railway_client_private_data_room.sql`
- Create: `scripts/apply_railway_client_private_data_room.py`
- Create: `supabase/functions/client-data-room/index.ts`
- Create: `src/services/dataRoom.ts`
- Modify: `src/pages/app/MiEmpresa.tsx`
- Future document storage integration, with metadata in Railway

**Behavior:**
- Add new private tables in Railway, preferably under `client_private`.
- Do not modify `raw_*`, L2 CAMMESA, or `mater_contrato_mensual` to store private data.
- Use Supabase only to authenticate the user and resolve authorized NEMOs.
- Write/read Railway only through a backend function that validates those NEMOs.
- Add document storage for evidence and store file metadata/links in Railway.
- Add staging tables for Excel/CSV imports.
- Connect private contracts with `mater_pnl_contrato_mensual`.

**Apply Railway schema:**

```bash
railway run -s Postgres python scripts/apply_railway_client_private_data_room.py
```

**Deploy API:**

```bash
npx supabase functions deploy client-data-room --project-ref vhdfkxtkhxuurlbduqru --use-api
supabase secrets set RAILWAY_DATABASE_URL="postgresql://..."
```
