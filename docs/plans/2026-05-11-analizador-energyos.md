# Analizador EnergyOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a transversal EnergyOS analyzer that consumes existing module data and generates auditable alerts, opportunities, priorities, actions, and evidence.

**Architecture:** Add a pure TypeScript analysis engine first, then a new `/app/analizador` page that fetches existing module services and renders the generated insights. Keep current modules unchanged and use them as evidence sources.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Tailwind CSS, lucide-react, existing EnergyOS service layer.

---

### Task 1: Define Analyzer Types

**Files:**
- Create: `src/types/analizador.ts`

**Step 1: Create the type file**

Add these exported types:

```ts
export type AnalizadorModuloOrigen =
  | "spot"
  | "dte"
  | "renovables"
  | "perfil_carga"
  | "historia"
  | "mercado";

export type AnalizadorTipo = "alerta" | "riesgo" | "oportunidad" | "mejora";
export type AnalizadorPrioridad = "alta" | "media" | "baja";
export type AnalizadorConfianza = "alta" | "media" | "baja";
export type AnalizadorEstadoGeneral = "normal" | "observacion" | "critico";

export type AnalizadorEvidencia = {
  label: string;
  valor: string;
  fuente: string;
  urlModulo: string;
};

export type AnalizadorInsight = {
  id: string;
  periodo: string;
  moduloOrigen: AnalizadorModuloOrigen;
  tipo: AnalizadorTipo;
  prioridad: AnalizadorPrioridad;
  confianza: AnalizadorConfianza;
  titulo: string;
  problema: string;
  impacto: string;
  accionRecomendada: string;
  responsableSugerido: "duenio" | "finanzas" | "administracion" | "energia" | "asesor";
  evidencia: AnalizadorEvidencia[];
};

export type AnalizadorResumen = {
  estadoGeneral: AnalizadorEstadoGeneral;
  focoPrincipal: string;
  prioridadMaxima: AnalizadorPrioridad | null;
  totalInsights: number;
  insightsAlta: number;
  insightsMedia: number;
  insightsBaja: number;
  analisisParcial: boolean;
};

export type AnalizadorResponse = {
  resumen: AnalizadorResumen;
  insights: AnalizadorInsight[];
  warnings: string[];
};
```

**Step 2: Run TypeScript build**

Run: `npm run build`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/types/analizador.ts
git commit -m "feat: define analyzer insight types"
```

### Task 2: Add Pure Analyzer Rules

**Files:**
- Create: `src/services/analizador.rules.ts`
- Create: `src/services/analizador.test.ts`

**Step 1: Write failing tests**

Create tests for:

- spot >= 70% generates high priority risk;
- spot >= 40% for at least 2 of last 3 months generates medium priority alert;
- DTE revisable > 0 generates audit alert;
- DTE revisable / factura >= 3% upgrades to high priority;
- renewables gap generates regulatory risk;
- peak percentile >= 75% generates operational opportunity;
- missing data generates no false insight.

Use plain TypeScript functions and simple assertions following the existing test style in `src/pages/app/AppHome.helpers.test.ts`.

**Step 2: Run tests and verify failure**

Run the available test command used in this repo. If there is no npm test script, run:

```bash
npx tsc --noEmit
```

Expected: FAIL until implementation exists.

**Step 3: Implement rules**

In `src/services/analizador.rules.ts`, export:

```ts
export type AnalizadorInput = {
  periodo: string;
  spot?: {
    serie: Array<{ periodo: string; pctSpot: number | null; costoSpotPromedioPesosMwh?: number | null }>;
  } | null;
  dte?: {
    facturaTotalPesos: number | null;
    importeRevisablePesos: number | null;
    costoPromedioPesosMwh: number | null;
  } | null;
  renovables?: {
    cumpleYtd: boolean | null;
    brechaYtdMwh: number | null;
    multaEstimadaPesos: number | null;
    pctRenovablePromedio: number | null;
  } | null;
  perfilCarga?: {
    pctPicoPercentilPromedio: number | null;
    ratioPicoVallePromedio: number | null;
    pctPicoPromedio: number | null;
  } | null;
  warnings?: string[];
};

export function buildAnalizadorResponse(input: AnalizadorInput): AnalizadorResponse;
```

Rules:

- Use central thresholds:

```ts
const THRESHOLDS = {
  spotHigh: 0.7,
  spotWatch: 0.4,
  spotSustainedMonths: 2,
  dteMaterialPct: 0.03,
  peakPercentileHigh: 0.75,
  peakValleyRatioHigh: 1.8,
};
```

- Sort by priority: alta, media, baja.
- Compute `estadoGeneral`: `critico` if any high insight, `observacion` if any medium/low insight, otherwise `normal`.
- Set `analisisParcial` when warnings exist.

**Step 4: Run tests**

Run: `npx tsc --noEmit`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/analizador.rules.ts src/services/analizador.test.ts
git commit -m "feat: add analyzer rules"
```

### Task 3: Add Analyzer Service Adapter

**Files:**
- Create: `src/services/analizador.ts`

**Step 1: Implement adapter**

Create a service that accepts already fetched module responses and maps them into `buildAnalizadorResponse`.

Export:

```ts
import type { AuditoriaDteResponse } from "../types/auditoriaDte";
import type { Compliance27191Response } from "../types/compliance27191";
import type { ExposicionSpotResponse } from "../types/exposicionSpot";
import type { FactorCargaResponse } from "../types/factorCarga";
import type { AnalizadorResponse } from "../types/analizador";

export type BuildAnalizadorFromModulesInput = {
  periodo: string;
  spot?: ExposicionSpotResponse | null;
  dte?: AuditoriaDteResponse | null;
  renovables?: Compliance27191Response | null;
  perfilCarga?: FactorCargaResponse | null;
  warnings?: string[];
};

export function buildAnalizadorFromModules(input: BuildAnalizadorFromModulesInput): AnalizadorResponse;
```

**Step 2: Run build**

Run: `npm run build`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/services/analizador.ts
git commit -m "feat: map module data into analyzer"
```

### Task 4: Create Insight Card Component

**Files:**
- Create: `src/components/app/InsightCard.tsx`

**Step 1: Implement component**

Render:

- priority badge;
- type label;
- title;
- problem;
- impact;
- recommended action;
- evidence rows;
- link to technical module.

Use lucide-react icons and existing visual language. Keep cards compact and practical.

**Step 2: Run build**

Run: `npm run build`

Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/app/InsightCard.tsx
git commit -m "feat: add analyzer insight card"
```

### Task 5: Add Analyzer Page

**Files:**
- Create: `src/pages/app/Analizador.tsx`

**Step 1: Fetch module data**

Use existing services:

- `fetchExposicionSpotMensual`
- `fetchAuditoriaDte`
- `fetchCompliance27191`
- `fetchFactorCargaMensual`

Fetch 12 months where applicable. Use `useAsyncData` patterns from `AppHome.tsx`.

**Step 2: Build analyzer response**

Call `buildAnalizadorFromModules` with available data and warnings for partial failures.

**Step 3: Render page**

Sections:

- header: `Analizador EnergyOS`;
- state summary: estado general, foco principal, counts by priority;
- main insight: first insight;
- insight list: all insights;
- empty state when no insights;
- partial analysis warning when some module fetches fail.

**Step 4: Run build**

Run: `npm run build`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/pages/app/Analizador.tsx
git commit -m "feat: add analyzer page"
```

### Task 6: Wire Route And Navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Step 1: Add lazy route**

In `src/App.tsx`, add:

```ts
const Analizador = lazy(() => import("./pages/app/Analizador"));
```

Add child route under `/app`:

```tsx
<Route
  path="analizador"
  element={<Suspense fallback={clientLoading}><Analizador /></Suspense>}
/>
```

**Step 2: Add nav item**

In `AppShell.tsx`, import a suitable lucide icon such as `ScanSearch` or `Radar`.

Add near top of `appNav`:

```ts
{ to: "/app/analizador", label: "Analizador", icon: ScanSearch, exact: false },
```

Add to mobile nav if space allows. If mobile gets too crowded, keep it in desktop nav first and revisit mobile UX.

**Step 3: Run build**

Run: `npm run build`

Expected: PASS.

**Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat: wire analyzer route"
```

### Task 7: Manual Verification

**Files:**
- No code changes expected.

**Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite starts locally.

**Step 2: Verify in browser**

Open the app and confirm:

- `/app` still loads;
- `/app/analizador` loads;
- existing modules still load;
- analyzer shows partial state instead of crashing when some data is missing;
- links from insight evidence go to the correct technical modules;
- mobile layout does not overlap.

**Step 3: Final build**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 4: Commit verification fixes if needed**

```bash
git add <changed-files>
git commit -m "fix: polish analyzer verification issues"
```
