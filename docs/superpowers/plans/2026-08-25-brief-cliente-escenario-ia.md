# Brief del cliente → escenario con IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El operador describe al cliente en un brief acumulativo; la IA propone el escenario de monitoreo (keywords, búsquedas A/B, cuentas, entidades, calendario) que el operador revisa y guarda; cada informe diario sugiere nuevos actores para incorporar con un click.

**Architecture:** Nueva fila sintética `conector_config` `brief:<projectId>` (entradas + propuesta + sugerencias) leída/escrita por `lib/client-brief.ts`. `lib/scenario-ai.ts` arma el prompt (brief + escenario vigente + few-shot FERRO), llama a Claude y valida el JSON con zod; la propuesta se prellena en los editores existentes y se aplica con los Guardar actuales. `lib/daily-report.ts` inyecta el brief al prompt y separa un bloque JSON `nuevosActores` que alimenta la tabla de sugeridos. Sin DDL.

**Tech Stack:** Next.js 15 (App Router, server actions), TypeScript, Supabase (PostgREST vía `@/lib/db/supabase`), zod, `@/lib/anthropic.generateText`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-brief-cliente-escenario-ia-design.md`

---

## Convenciones del repo (leer antes de empezar)

- Tests: `npx vitest run <archivo>`; suite completa `npx vitest run`; tipos `npx tsc --noEmit`; lint `npx eslint <archivos>`.
- Mock de Supabase en tests: `vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({ from: () => builder }) }))` (ver `tests/extension-token.test.ts`).
- Persistencia sin DDL: filas `conector_config` con `connector_id` sintético y `project_id: null`. **La unique es `(connector_id, project_id) NULLS NOT DISTINCT`** → todo `upsert` lleva `{ onConflict: "connector_id,project_id" }` y `project_id: null` explícito. `onConflict: "connector_id"` solo → Postgres 42P10 (bug ya corregido en `lib/extension-token.ts`).
- Server actions viven en `app/(dashboard)/escucha/actions.ts`; auth por `requireMember("editor" | "owner")` de `@/lib/workspace`; feedback con `revalidatePath("/escucha")` + `redirect("/escucha?tab=informe&<flag>=1")` y `FormStatus` en el componente.
- Commits: conventional (`feat:`, `fix:`, `test:`), cuerpo en español, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `lib/monitor-config.ts` | modificar | fix `onConflict` |
| `lib/daily-report.ts` | modificar | fix `onConflict` en `saveReport`; brief en prompt; `splitReport`; sugerencias |
| `lib/client-brief.ts` | crear | tipos `ClientBrief`/`BriefEntry`/`ScenarioProposal`/`ActorSuggestion`; leer/guardar; helpers puros |
| `lib/scenario-examples.ts` | crear | `FERRO_EXAMPLE` (brief + JSON esperado) |
| `lib/scenario-ai.ts` | crear | `ScenarioSchema`, `buildScenarioPrompt`, `parseScenarioJson`, `proposeScenario` |
| `lib/workspace.ts` | modificar | exportar `currentUserEmail()` |
| `app/(dashboard)/escucha/actions.ts` | modificar | acciones de brief/propuesta/sugeridos; marcar aplicado en `guardarMonitor`/`guardarEscucha` |
| `components/escucha/brief-panel.tsx` | crear | aportes + generar + banner de propuesta |
| `components/escucha/actor-suggestions.tsx` | crear | tabla Incorporar/Descartar |
| `components/escucha/monitor-editor.tsx` | modificar | prop `proposal`, prellenado + diff, Descartar propuesta |
| `components/escucha/config-form.tsx` | modificar | prop `proposedKeywords`, aviso + prellenado |
| `components/escucha/informe-panel.tsx` | modificar | recibe `brief`, monta BriefPanel + ActorSuggestions, pasa `proposal` |
| `app/(dashboard)/escucha/page.tsx` | modificar | lee el brief, pasa props |
| `tests/monitor-config.test.ts` | crear | fix onConflict |
| `tests/client-brief.test.ts` | crear | helpers puros + persistencia |
| `tests/scenario-ai.test.ts` | crear | prompt + parseo |
| `tests/daily-report-split.test.ts` | crear | `splitReport` |
| `tests/escucha-brief-actions.test.ts` | crear | `resolverActorSugerido` |

---

### Task 1: Fix 42P10 en `saveMonitorConfig` y `saveReport`

**Files:**
- Modify: `lib/monitor-config.ts:86-102`
- Modify: `lib/daily-report.ts:47-62`
- Test: `tests/monitor-config.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/monitor-config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// "Guardar escenario" fallaba con Postgres 42P10: la unique de conector_config
// es (connector_id, project_id) NULLS NOT DISTINCT y el upsert declaraba
// onConflict "connector_id" solo (mismo bug que el token de extensión).
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ upsert }) }),
}));

import { saveMonitorConfig, DEFAULT_BUDGET } from "@/lib/monitor-config";

describe("saveMonitorConfig", () => {
  beforeEach(() => upsert.mockClear());

  it("upsertea con onConflict (connector_id, project_id) y project_id null", async () => {
    await saveMonitorConfig("p1", {
      accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: [],
      budget: DEFAULT_BUDGET, entidades: {},
    });
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe("monitor-config:p1");
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/monitor-config.test.ts`
Expected: FAIL — `expected undefined to be null` (row.project_id) / `expected 'connector_id' to be 'connector_id,project_id'`.

- [ ] **Step 3: Corregir `saveMonitorConfig`**

En `lib/monitor-config.ts` reemplazar el bloque del upsert:

```ts
  // La unique de conector_config es (connector_id, project_id) NULLS NOT
  // DISTINCT (migración 0053): onConflict "connector_id" solo da 42P10.
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      project_id: null,
      config: cfg,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
```

- [ ] **Step 4: Corregir `saveReport` en `lib/daily-report.ts`** (mismo bug; el informe se generaba pero no se guardaba y el warn pasaba desapercibido)

```ts
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      project_id: null,
      config: { latest: report, history },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
```

- [ ] **Step 5: Correr el test y tsc**

Run: `npx vitest run tests/monitor-config.test.ts && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add lib/monitor-config.ts lib/daily-report.ts tests/monitor-config.test.ts
git commit -m "fix(monitor): upsert de monitor-config y daily-report con onConflict correcto (42P10)

Misma unique (connector_id, project_id) NULLS NOT DISTINCT que rompía el
token de extensión: \"Guardar escenario\" fallaba y el informe diario no
persistía.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/client-brief.ts` — tipos, helpers puros y persistencia

**Files:**
- Create: `lib/client-brief.ts`
- Test: `tests/client-brief.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/client-brief.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
let stored: unknown = null;
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored ? { config: stored } : null }) }) }),
    }),
  }),
}));

import {
  EMPTY_BRIEF,
  addEntry,
  removeEntry,
  briefText,
  briefHash,
  mergeSuggestions,
  setSuggestionStatus,
  getClientBrief,
  saveClientBrief,
  type ClientBrief,
  type ActorSuggestion,
} from "@/lib/client-brief";

const NOW = "2026-08-25T12:00:00.000Z";

describe("client-brief · helpers puros", () => {
  it("addEntry agrega al final con fecha y autor; removeEntry quita por id", () => {
    const b1 = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "Club de Caballito, elecciones en septiembre", at: NOW });
    const b2 = addEntry(b1, { by: "juan@x.ar", text: "La lista opositora se llama Verde", at: "2026-08-26T09:00:00.000Z" });
    expect(b2.entries.map((e) => e.by)).toEqual(["ana@x.ar", "juan@x.ar"]);
    expect(b2.entries[0].id).toBeTruthy();
    const b3 = removeEntry(b2, b2.entries[0].id);
    expect(b3.entries.map((e) => e.text)).toEqual(["La lista opositora se llama Verde"]);
    // inmutable
    expect(b2.entries).toHaveLength(2);
  });

  it("addEntry rechaza texto vacío", () => {
    expect(() => addEntry(EMPTY_BRIEF, { by: "a", text: "   ", at: NOW })).toThrow(/vacío/);
  });

  it("briefText formatea [fecha · autor] texto en orden; briefHash es estable", () => {
    const b = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "Club de Caballito", at: NOW });
    expect(briefText(b)).toBe("[2026-08-25 · ana@x.ar] Club de Caballito");
    expect(briefHash(b)).toBe(briefHash({ ...b }));
    expect(briefHash(b)).not.toBe(briefHash(EMPTY_BRIEF));
  });

  it("mergeSuggestions dedupe contra cuentas del plan, aceptadas y descartadas", () => {
    const prev: ClientBrief = {
      ...EMPTY_BRIEF,
      suggestions: [
        { id: "x:viejo", handle: "viejo", platform: "x", category: "individual", direccion: "?", razon: "r", suggestedAt: NOW, status: "dismissed" },
        { id: "instagram:ok", handle: "ok", platform: "instagram", category: "medio", direccion: "A", razon: "r", suggestedAt: NOW, status: "accepted" },
      ],
    };
    const incoming: Omit<ActorSuggestion, "id" | "status" | "suggestedAt">[] = [
      { handle: "@Viejo", platform: "x", category: "individual", direccion: "?", razon: "reaparece" },
      { handle: "ok", platform: "instagram", category: "medio", direccion: "A", razon: "ya aceptada" },
      { handle: "enplan", platform: "x", category: "organizacion", direccion: "B", razon: "está en accounts" },
      { handle: "nuevo", platform: "tiktok", category: "opera", direccion: "B", razon: "nuevo", evidencia: "https://t/1" },
      { handle: "nuevo", platform: "tiktok", category: "opera", direccion: "B", razon: "duplicado en la misma barrida" },
    ];
    const out = mergeSuggestions(prev, incoming, [{ handle: "enplan", platform: "x" }], NOW);
    const pending = out.suggestions.filter((s) => s.status === "pending");
    expect(pending.map((s) => s.id)).toEqual(["tiktok:nuevo"]);
    expect(pending[0].evidencia).toBe("https://t/1");
    // las viejas se conservan
    expect(out.suggestions).toHaveLength(3);
  });

  it("setSuggestionStatus cambia solo la indicada", () => {
    const b: ClientBrief = {
      ...EMPTY_BRIEF,
      suggestions: [
        { id: "x:a", handle: "a", platform: "x", category: "individual", direccion: "?", razon: "", suggestedAt: NOW, status: "pending" },
        { id: "x:b", handle: "b", platform: "x", category: "individual", direccion: "?", razon: "", suggestedAt: NOW, status: "pending" },
      ],
    };
    const out = setSuggestionStatus(b, "x:a", "accepted");
    expect(out.suggestions.map((s) => s.status)).toEqual(["accepted", "pending"]);
  });
});

describe("client-brief · persistencia", () => {
  beforeEach(() => { upsert.mockClear(); stored = null; });

  it("getClientBrief devuelve EMPTY_BRIEF sin fila y normaliza campos faltantes", async () => {
    expect(await getClientBrief("p1")).toEqual(EMPTY_BRIEF);
    stored = { entries: [{ id: "1", at: NOW, by: "a", text: "t" }] };
    const b = await getClientBrief("p1");
    expect(b.entries).toHaveLength(1);
    expect(b.suggestions).toEqual([]);
  });

  it("saveClientBrief upsertea brief:<projectId> con onConflict (connector_id, project_id)", async () => {
    await saveClientBrief("p1", EMPTY_BRIEF);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe("brief:p1");
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/client-brief.test.ts`
Expected: FAIL — `Cannot find module '@/lib/client-brief'`.

- [ ] **Step 3: Implementar `lib/client-brief.ts`**

```ts
// Brief acumulativo del cliente + propuesta de escenario + actores sugeridos.
//
// El operador describe al cliente en lenguaje natural, en aportes fechados y
// append-only; la IA propone el escenario de monitoreo a partir de ese brief
// (lib/scenario-ai.ts) y cada informe diario sugiere actores nuevos
// (lib/daily-report.ts). Lo VIGENTE sigue en listening_config (keywords) y
// monitor-config (resto): acá vive el contexto y lo pendiente de aplicar.
//
// Persistencia sin DDL: fila sintética conector_config brief:<projectId>.
import { createHash, randomUUID } from "node:crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";
import type { CalendarEvent, Category, MonitorAccount, Platform } from "@/lib/monitor-config";

export interface BriefEntry {
  id: string;
  at: string; // ISO
  by: string; // email del operador
  text: string;
}

export interface ScenarioProposal {
  at: string;
  briefHash: string; // hash del brief usado; si difiere del actual, la propuesta quedó vieja
  tipo: "electoral" | "territorial";
  resumen: string;
  keywords: string[];
  searchesA: string[];
  searchesB: string[];
  accounts: MonitorAccount[];
  entidades: Record<string, string>;
  calendar: CalendarEvent[];
  appliedKeywordsAt?: string;
  appliedMonitorAt?: string;
}

export interface ActorSuggestion {
  id: string; // `${platform}:${handle}` normalizado
  handle: string;
  platform: Platform;
  category: Category;
  direccion: "A" | "B" | "?";
  evidencia?: string;
  razon: string;
  suggestedAt: string;
  status: "pending" | "accepted" | "dismissed";
}

export interface ClientBrief {
  entries: BriefEntry[];
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}

export const EMPTY_BRIEF: ClientBrief = { entries: [], suggestions: [] };

const key = (projectId: string) => `brief:${projectId}`;

// ── Helpers puros (inmutables) ──────────────────────────────────────────

export function addEntry(
  brief: ClientBrief,
  input: { by: string; text: string; at?: string },
): ClientBrief {
  const text = input.text.trim();
  if (!text) throw new Error("El aporte está vacío");
  const entry: BriefEntry = {
    id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    by: input.by,
    text,
  };
  return { ...brief, entries: [...brief.entries, entry] };
}

export function removeEntry(brief: ClientBrief, id: string): ClientBrief {
  return { ...brief, entries: brief.entries.filter((e) => e.id !== id) };
}

// Texto del brief tal como lo lee el modelo: una línea por aporte, en orden.
export function briefText(brief: ClientBrief): string {
  return brief.entries
    .map((e) => `[${e.at.slice(0, 10)} · ${e.by}] ${e.text}`)
    .join("\n");
}

export function briefHash(brief: ClientBrief): string {
  return createHash("sha256").update(briefText(brief)).digest("hex").slice(0, 16);
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function suggestionId(platform: Platform, handle: string): string {
  return `${platform}:${normalizeHandle(handle)}`;
}

// Suma sugerencias de una barrida. Fuera: las que ya están en el plan, las
// aceptadas/descartadas antes y los duplicados dentro de la misma tanda.
export function mergeSuggestions(
  brief: ClientBrief,
  incoming: Omit<ActorSuggestion, "id" | "status" | "suggestedAt">[],
  accounts: { handle: string; platform: Platform }[],
  at = new Date().toISOString(),
): ClientBrief {
  const known = new Set<string>([
    ...brief.suggestions.map((s) => s.id),
    ...accounts.map((a) => suggestionId(a.platform, a.handle)),
  ]);
  const added: ActorSuggestion[] = [];
  for (const s of incoming) {
    const id = suggestionId(s.platform, s.handle);
    if (known.has(id)) continue;
    known.add(id);
    added.push({ ...s, handle: normalizeHandle(s.handle), id, suggestedAt: at, status: "pending" });
  }
  return { ...brief, suggestions: [...brief.suggestions, ...added] };
}

export function setSuggestionStatus(
  brief: ClientBrief,
  id: string,
  status: ActorSuggestion["status"],
): ClientBrief {
  return {
    ...brief,
    suggestions: brief.suggestions.map((s) => (s.id === id ? { ...s, status } : s)),
  };
}

// ── Persistencia ────────────────────────────────────────────────────────

export async function getClientBrief(projectId: string): Promise<ClientBrief> {
  if (!dbConfigured()) return EMPTY_BRIEF;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const cfg = data?.config as Partial<ClientBrief> | undefined;
  if (!cfg) return EMPTY_BRIEF;
  return {
    entries: cfg.entries ?? [],
    proposal: cfg.proposal,
    suggestions: cfg.suggestions ?? [],
  };
}

export async function saveClientBrief(projectId: string, brief: ClientBrief): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  // Unique (connector_id, project_id) NULLS NOT DISTINCT → ambas columnas.
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      project_id: null,
      config: brief,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
  if (error) {
    log.warn("client_brief.save_failed", { error: error.message });
    throw error;
  }
}
```

- [ ] **Step 4: Correr tests, tsc, eslint**

Run: `npx vitest run tests/client-brief.test.ts && npx tsc --noEmit && npx eslint lib/client-brief.ts tests/client-brief.test.ts`
Expected: 7 tests PASS; sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/client-brief.ts tests/client-brief.test.ts
git commit -m "feat(escucha): brief acumulativo del cliente (lib/client-brief)

Aportes fechados append-only, propuesta de escenario pendiente y actores
sugeridos por barrida, en conector_config brief:<projectId>. Solo helpers
puros + persistencia; la IA y la UI vienen en commits siguientes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/scenario-examples.ts` — few-shot FERRO

**Files:**
- Create: `lib/scenario-examples.ts`

- [ ] **Step 1: Crear el archivo** (contenido tomado de `scripts/maintenance/seed-monitor.mjs · FERRO`; el brief de ejemplo es la lectura en prosa de ese escenario)

```ts
// Ejemplo few-shot para lib/scenario-ai: cómo se ve un brief y qué escenario
// esperamos que la IA derive de él. Tomado del escenario FERRO (seed).
// Mantenerlo corto: entra en cada prompt de generación.

export const FERRO_EXAMPLE_BRIEF = `[2026-08-01 · operador] Cliente: agrupación de socios del Club Ferro Carril Oeste (Caballito, CABA). Se vienen las elecciones de comisión directiva, fecha tentativa 14 de septiembre de 2026.
[2026-08-03 · operador] Nos interesa la disputa entre el oficialismo (gestión actual) y las listas opositoras que piden recambio. Hay que seguir a la cuenta institucional del club y a los medios partidarios del club, y no confundir el estadio Etcheverri con predios de entrenamiento en otros municipios.
[2026-08-10 · operador] Ojo con atribuir cuentas anónimas a una lista sin evidencia.`;

export const FERRO_EXAMPLE_JSON = {
  tipo: "electoral",
  resumen:
    "Elección de comisión directiva de un club de CABA: conflicto oficialismo vs. listas de recambio. Se monitorea la institucional, los medios partidarios y la conversación de socios; las listas se cargan solo con evidencia.",
  keywords: [
    "Ferro Carril Oeste",
    "Caballito",
    "el Verdolaga",
    "elecciones Ferro",
    "socios Ferro",
    "comisión directiva Ferro",
    "lista Ferro",
    "asamblea Ferro",
  ],
  searchesA: ["Ferro elecciones oficialismo", "Ferro lista oficialista", "gestión Ferro"],
  searchesB: ["Ferro elecciones oposición", "Ferro lista opositora", "recambio Ferro"],
  accounts: [
    { handle: "ferrocarriloeste", platform: "instagram", category: "institucional", nota: "verificar handle" },
    { handle: "ferrooesteoficial", platform: "x", category: "institucional", nota: "verificar handle" },
  ],
  entidades: {
    "Ferro Carril Oeste": "Club deportivo de Caballito, CABA. Estadio Arquitecto Ricardo Etcheverri.",
    Etcheverri: "Estadio de Ferro en Caballito. No confundir con predios de entrenamiento en otro municipio.",
  },
  calendar: [{ label: "Elecciones Ferro (fecha a confirmar)", date: "2026-09-14" }],
};
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/scenario-examples.ts
git commit -m "feat(escucha): ejemplo few-shot FERRO para la generación de escenario

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `lib/scenario-ai.ts` — prompt, parseo y `proposeScenario`

**Files:**
- Create: `lib/scenario-ai.ts`
- Test: `tests/scenario-ai.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/scenario-ai.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateText = vi.fn();
vi.mock("@/lib/anthropic", () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: async () => ({ ANTHROPIC_API_KEY: "sk-test" }),
}));
vi.mock("@/lib/quota", () => ({ incrementUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => ({ keywords: ["Ibicuy"], zona: "Ibicuy, Entre Ríos", pais: "AR" }),
}));
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => ({
    accounts: [], searchesA: ["a1"], searchesB: ["b1"], calendar: [], noRepetir: [], entidades: {}, budget: {},
  }),
}));
const briefStore: { current: import("@/lib/client-brief").ClientBrief } = {
  current: { entries: [{ id: "1", at: "2026-08-25T00:00:00.000Z", by: "ana@x.ar", text: "Municipio de Ibicuy, gestión local, cloacas y caminos" }], suggestions: [] },
};
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { briefStore.current = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => briefStore.current,
  saveClientBrief: (p: string, b: import("@/lib/client-brief").ClientBrief) => saveClientBrief(p, b),
}));

import { buildScenarioPrompt, parseScenarioJson, proposeScenario } from "@/lib/scenario-ai";
import { FERRO_EXAMPLE_JSON } from "@/lib/scenario-examples";

const VALID = {
  tipo: "territorial",
  resumen: "Escucha territorial de un municipio.",
  keywords: ["Entre Rios", "Ibicuy", "cloacas Ibicuy"],
  searchesA: ["Ibicuy gestión"],
  searchesB: ["Ibicuy reclamos"],
  accounts: [{ handle: "@MuniIbicuy", platform: "facebook", category: "institucional" }],
  entidades: { Ibicuy: "Localidad del sur de Entre Ríos" },
  calendar: [],
};
const fence = (o: unknown) => "Acá va:\n```json\n" + JSON.stringify(o) + "\n```\nlisto.";

describe("buildScenarioPrompt", () => {
  it("incluye brief, escenario vigente y el ejemplo FERRO", () => {
    const { system, prompt } = buildScenarioPrompt({
      brief: "[2026-08-25 · ana@x.ar] Municipio de Ibicuy",
      current: { keywords: ["Ibicuy"], searchesA: ["a1"], searchesB: ["b1"], accounts: [], entidades: {}, calendar: [] },
    });
    expect(system).toMatch(/SOLO un bloque/);
    expect(prompt).toContain("Municipio de Ibicuy");
    expect(prompt).toContain('"Ferro Carril Oeste"');
    expect(prompt).toContain("a1");
    expect(prompt).toMatch(/16/); // límite de keywords
  });
});

describe("parseScenarioJson", () => {
  it("acepta un bloque válido y normaliza cuentas (handle sin @, nota verificar)", () => {
    const r = parseScenarioJson(fence(VALID));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.accounts[0]).toEqual({ handle: "MuniIbicuy", platform: "facebook", category: "institucional", nota: "verificar handle" });
    expect(r.data.tipo).toBe("territorial");
  });

  it("acepta el ejemplo FERRO tal cual", () => {
    expect(parseScenarioJson(fence(FERRO_EXAMPLE_JSON)).ok).toBe(true);
  });

  it("sin bloque json → error", () => {
    const r = parseScenarioJson("no hay json acá");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bloque/);
  });

  it("JSON roto → error", () => {
    expect(parseScenarioJson("```json\n{ nope\n```").ok).toBe(false);
  });

  it("recorta keywords a 16 y rechaza A/B desiguales", () => {
    const many = { ...VALID, keywords: Array.from({ length: 20 }, (_, i) => `k${i}`) };
    const r = parseScenarioJson(fence(many));
    expect(r.ok && r.data.keywords).toHaveLength(16);
    const uneven = { ...VALID, searchesA: ["a", "b"], searchesB: ["c"] };
    const r2 = parseScenarioJson(fence(uneven));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/simétric/);
  });

  it("plataforma o categoría inválida → error", () => {
    const bad = { ...VALID, accounts: [{ handle: "x", platform: "threads", category: "medio" }] };
    expect(parseScenarioJson(fence(bad)).ok).toBe(false);
  });
});

describe("proposeScenario", () => {
  beforeEach(() => { generateText.mockReset(); saveClientBrief.mockClear(); briefStore.current = { ...briefStore.current, proposal: undefined }; });

  it("guarda la propuesta con el hash del brief y no toca lo vigente", async () => {
    generateText.mockResolvedValue({ text: fence(VALID), inputTokens: 10, outputTokens: 20 });
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(true);
    expect(saveClientBrief).toHaveBeenCalledTimes(1);
    const saved = briefStore.current.proposal!;
    expect(saved.keywords).toEqual(VALID.keywords);
    expect(saved.briefHash).toHaveLength(16);
    expect(saved.appliedKeywordsAt).toBeUndefined();
  });

  it("brief vacío → error sin llamar al modelo", async () => {
    briefStore.current = { entries: [], suggestions: [] };
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("respuesta inválida → error y no guarda", async () => {
    generateText.mockResolvedValue({ text: "sin json", inputTokens: 1, outputTokens: 1 });
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(false);
    expect(saveClientBrief).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/scenario-ai.test.ts`
Expected: FAIL — `Cannot find module '@/lib/scenario-ai'`.

- [ ] **Step 3: Implementar `lib/scenario-ai.ts`**

```ts
// Genera una PROPUESTA de escenario de monitoreo a partir del brief del
// cliente (lib/client-brief). La IA no aplica nada: la propuesta se guarda
// en el brief y el operador la revisa en los editores de Configurar /
// Escenario, donde Guardar es el único camino a lo vigente.
import { z } from "zod";
import { generateText } from "@/lib/anthropic";
import { getConnectorConfig } from "@/lib/connectors/config";
import { incrementUsage } from "@/lib/quota";
import { getListeningConfig } from "@/lib/listening-config";
import { getMonitorConfig, type CalendarEvent, type MonitorAccount } from "@/lib/monitor-config";
import {
  briefHash,
  briefText,
  getClientBrief,
  normalizeHandle,
  saveClientBrief,
  type ScenarioProposal,
} from "@/lib/client-brief";
import { FERRO_EXAMPLE_BRIEF, FERRO_EXAMPLE_JSON } from "@/lib/scenario-examples";
import { log } from "@/lib/logger";

const CLAUDE_ID = "claude-api";
export const MAX_KEYWORDS = 16; // gdelt-worker lotea de a 7; 16 = 3 lotes
const MAX_TOKENS = 2000;

// ── Esquema de salida del modelo ────────────────────────────────────────

const AccountSchema = z.object({
  handle: z.string().min(1).transform(normalizeHandle),
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  category: z.enum(["organizacion", "medio", "individual", "institucional", "opera"]),
  vinculo: z.string().optional(),
  nota: z.string().optional(),
});

export const ScenarioSchema = z
  .object({
    tipo: z.enum(["electoral", "territorial"]),
    resumen: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1).transform((ks) => ks.slice(0, MAX_KEYWORDS)),
    searchesA: z.array(z.string().min(1)),
    searchesB: z.array(z.string().min(1)),
    accounts: z.array(AccountSchema).transform((as) =>
      as.map((a): MonitorAccount => ({ ...a, nota: a.nota?.trim() || "verificar handle" })),
    ),
    entidades: z.record(z.string(), z.string()),
    calendar: z.array(z.object({ label: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })),
  })
  .refine((s) => s.searchesA.length === s.searchesB.length, {
    message: "Las búsquedas A y B tienen que ser simétricas (misma cantidad)",
  });

export type ScenarioOutput = z.infer<typeof ScenarioSchema>;

export interface CurrentScenario {
  keywords: string[];
  searchesA: string[];
  searchesB: string[];
  accounts: MonitorAccount[];
  entidades: Record<string, string>;
  calendar: CalendarEvent[];
}

// ── Prompt ──────────────────────────────────────────────────────────────

export function buildScenarioPrompt(input: { brief: string; current: CurrentScenario }): {
  system: string;
  prompt: string;
} {
  const system =
    "Sos el analista que arma el escenario de monitoreo de escucha social para un cliente. " +
    "Reglas editoriales: distinguí hecho de inferencia; nunca atribuyas una cuenta u operación a una " +
    "organización sin evidencia explícita en el brief; no inventes cuentas, fechas ni nombres que el brief " +
    "o el escenario vigente no mencionen. Devolvé SOLO un bloque ```json``` con el esquema pedido, sin texto antes ni después.";

  const prompt = `## Ejemplo de referencia (cliente FERRO)
### Brief
${FERRO_EXAMPLE_BRIEF}
### Escenario esperado
\`\`\`json
${JSON.stringify(FERRO_EXAMPLE_JSON, null, 2)}
\`\`\`

## Escenario vigente de ESTE cliente (conservá lo que sigue valiendo; no arranques de cero)
\`\`\`json
${JSON.stringify(input.current, null, 2)}
\`\`\`

## Brief del cliente (aportes del operador, en orden)
${input.brief}

## Reglas de salida
- keywords: máximo ${MAX_KEYWORDS}, amplias primero (territorio/agenda: al menos 3) y después específicas del cliente (al menos 3). Términos que la prensa use de verdad.
- searchesA y searchesB: simétricas, misma cantidad, un lado y otro del conflicto (si no hay conflicto: gestión vs. reclamos).
- accounts: solo cuentas que el brief o el vigente nombren; siempre "nota": "verificar handle"; category en organizacion|medio|individual|institucional|opera; platform en instagram|x|facebook|tiktok.
- entidades: nombre → definición, para lo que se pueda confundir (lugares, cargos, homónimos).
- calendar: solo fechas explícitas del brief, formato YYYY-MM-DD.
- tipo: "electoral" si hay elección, lista o asamblea; "territorial" si no.
- resumen: 3-5 líneas, cómo leíste el brief y qué se va a vigilar.

Esquema:
\`\`\`json
{ "tipo": "electoral|territorial", "resumen": "...", "keywords": [], "searchesA": [], "searchesB": [], "accounts": [{ "handle": "", "platform": "", "category": "", "vinculo": "", "nota": "verificar handle" }], "entidades": {}, "calendar": [{ "label": "", "date": "YYYY-MM-DD" }] }
\`\`\``;

  return { system, prompt };
}

// ── Parseo ──────────────────────────────────────────────────────────────

export type ParseResult = { ok: true; data: ScenarioOutput } | { ok: false; error: string };

export function parseScenarioJson(text: string): ParseResult {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return { ok: false, error: "La respuesta no trae un bloque ```json```" };
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return { ok: false, error: "El bloque json no es JSON válido" };
  }
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join("; ") };
  }
  return { ok: true, data: parsed.data };
}

// ── Orquestación ────────────────────────────────────────────────────────

export type ProposeResult = { ok: true; proposal: ScenarioProposal } | { ok: false; error: string };

export async function proposeScenario(projectId: string): Promise<ProposeResult> {
  const brief = await getClientBrief(projectId);
  if (brief.entries.length === 0) return { ok: false, error: "El brief está vacío: agregá al menos un aporte" };

  const claudeCfg = await getConnectorConfig(CLAUDE_ID, projectId);
  const apiKey = claudeCfg.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "Conector claude-api sin ANTHROPIC_API_KEY" };

  const [cfg, monitor] = await Promise.all([getListeningConfig(projectId), getMonitorConfig(projectId)]);
  const current: CurrentScenario = {
    keywords: cfg.keywords,
    searchesA: monitor.searchesA,
    searchesB: monitor.searchesB,
    accounts: monitor.accounts,
    entidades: monitor.entidades,
    calendar: monitor.calendar,
  };

  const { system, prompt } = buildScenarioPrompt({ brief: briefText(brief), current });
  const result = await generateText({ apiKey, system, prompt, maxTokens: MAX_TOKENS });
  await incrementUsage(CLAUDE_ID, result.inputTokens + result.outputTokens, projectId);

  const parsed = parseScenarioJson(result.text);
  if (!parsed.ok) {
    log.warn("scenario_ai.parse_failed", { projectId, error: parsed.error, head: result.text.slice(0, 300) });
    return { ok: false, error: `La IA devolvió algo que no pude interpretar (${parsed.error}). Probá de nuevo.` };
  }

  const proposal: ScenarioProposal = {
    at: new Date().toISOString(),
    briefHash: briefHash(brief),
    ...parsed.data,
  };
  await saveClientBrief(projectId, { ...brief, proposal });
  log.info("scenario_ai.proposed", { projectId, keywords: proposal.keywords.length, accounts: proposal.accounts.length });
  return { ok: true, proposal };
}
```

- [ ] **Step 4: Correr tests, tsc, eslint**

Run: `npx vitest run tests/scenario-ai.test.ts && npx tsc --noEmit && npx eslint lib/scenario-ai.ts tests/scenario-ai.test.ts`
Expected: 10 tests PASS; sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/scenario-ai.ts tests/scenario-ai.test.ts
git commit -m "feat(escucha): proponer escenario con IA a partir del brief (lib/scenario-ai)

Prompt = brief + escenario vigente + few-shot FERRO; salida JSON validada
con zod (≤16 keywords, A/B simétricas, cuentas con \"verificar handle\").
Se guarda como propuesta en el brief; nunca se aplica sola.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Informe diario — brief en el prompt y `nuevosActores`

**Files:**
- Modify: `lib/daily-report.ts`
- Test: `tests/daily-report-split.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/daily-report-split.test.ts
import { describe, it, expect } from "vitest";
import { splitReport } from "@/lib/daily-report";

describe("splitReport", () => {
  it("separa el markdown del bloque json de nuevosActores", () => {
    const text = "# Informe\n\nTexto.\n\n```json\n{\"nuevosActores\":[{\"handle\":\"@LaVozDeIbicuy\",\"platform\":\"facebook\",\"category\":\"medio\",\"direccion\":\"B\",\"evidencia\":\"https://fb/1\",\"razon\":\"publicó 3 críticas\"}]}\n```";
    const { markdown, nuevosActores } = splitReport(text);
    expect(markdown).toBe("# Informe\n\nTexto.");
    expect(nuevosActores).toEqual([
      { handle: "@LaVozDeIbicuy", platform: "facebook", category: "medio", direccion: "B", evidencia: "https://fb/1", razon: "publicó 3 críticas" },
    ]);
  });

  it("sin bloque → markdown completo y []", () => {
    expect(splitReport("# Solo texto")).toEqual({ markdown: "# Solo texto", nuevosActores: [] });
  });

  it("bloque inválido → markdown sin el bloque y []", () => {
    const { markdown, nuevosActores } = splitReport("Texto\n```json\n{ roto\n```");
    expect(markdown).toBe("Texto");
    expect(nuevosActores).toEqual([]);
  });

  it("descarta actores con plataforma/categoría fuera de la taxonomía", () => {
    const text = "T\n```json\n{\"nuevosActores\":[{\"handle\":\"a\",\"platform\":\"threads\",\"category\":\"medio\",\"direccion\":\"?\",\"razon\":\"r\"},{\"handle\":\"b\",\"platform\":\"x\",\"category\":\"opera\",\"direccion\":\"A\",\"razon\":\"r\"}]}\n```";
    expect(splitReport(text).nuevosActores.map((a) => a.handle)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/daily-report-split.test.ts`
Expected: FAIL — `splitReport is not a function` (o no exportado).

- [ ] **Step 3: Agregar `splitReport` y el esquema en `lib/daily-report.ts`** (después de los imports; nuevo import de zod y de client-brief)

```ts
import { z } from "zod";
import { getClientBrief, briefText, mergeSuggestions, saveClientBrief } from "@/lib/client-brief";
```

```ts
// Actores nuevos que el modelo detecta en las menciones y no están en el
// plan. Van al final del informe como bloque ```json```; se separan del
// markdown antes de guardar. Un bloque ausente o inválido nunca rompe el
// informe: solo deja 0 sugerencias.
const ActorSchema = z.object({
  handle: z.string().min(1),
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  category: z.enum(["organizacion", "medio", "individual", "institucional", "opera"]),
  direccion: z.enum(["A", "B", "?"]).default("?"),
  evidencia: z.string().url().optional(),
  razon: z.string().default(""),
});
export type NuevoActor = z.infer<typeof ActorSchema>;

export function splitReport(text: string): { markdown: string; nuevosActores: NuevoActor[] } {
  const m = text.match(/```json\s*([\s\S]*?)```\s*$/);
  if (!m) return { markdown: text.trim(), nuevosActores: [] };
  const markdown = text.slice(0, m.index).trim();
  try {
    const raw = JSON.parse(m[1]) as { nuevosActores?: unknown[] };
    const actores = (raw.nuevosActores ?? [])
      .map((a) => ActorSchema.safeParse(a))
      .filter((r): r is { success: true; data: NuevoActor } => r.success)
      .map((r) => r.data);
    return { markdown, nuevosActores: actores };
  } catch {
    log.warn("daily_report.actors_parse_failed", { head: m[1].slice(0, 200) });
    return { markdown, nuevosActores: [] };
  }
}
```

- [ ] **Step 4: Inyectar el brief al prompt y pedir el bloque**

En `generateDailyReport`, junto a los otros `await` iniciales (después de `const previous = ...`):

```ts
  const brief = await getClientBrief(projectId);
  const briefSection = brief.entries.length
    ? `## Brief del cliente (aportes del operador, en orden)\n${briefText(brief)}\n\n`
    : "";
```

Cambiar el arranque del template del prompt de

```ts
  const prompt = `## Contexto del cliente (config del panel)
```

a

```ts
  const prompt = `${briefSection}## Contexto del cliente (config del panel)
```

Y al final del prompt, después de la línea `Si casi no hay menciones nuevas, decilo sin inflar, y sugerí ajustes de fuentes/keywords.` agregar (dentro del mismo template):

```ts
Cerrá el informe con un bloque \`\`\`json\`\`\` con este esquema exacto:
{ "nuevosActores": [{ "handle": "", "platform": "instagram|x|facebook|tiktok", "category": "organizacion|medio|individual|institucional|opera", "direccion": "A|B|?", "evidencia": "url de la mención", "razon": "por qué vale seguirla" }] }
Solo cuentas que aparecen en las menciones de arriba y NO están en el plan${monitor.accounts.length ? ` (plan: ${monitor.accounts.map((a) => "@" + a.handle).join(", ")})` : ""}. Si no hay, "nuevosActores": [].`;
```

- [ ] **Step 5: Separar el bloque y guardar sugerencias**

Reemplazar la construcción del `report` por:

```ts
  const { markdown, nuevosActores } = splitReport(result.text);
  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    pull,
  };
  await saveReport(projectId, report);
  if (nuevosActores.length > 0) {
    const merged = mergeSuggestions(brief, nuevosActores, monitor.accounts, report.at);
    if (merged.suggestions.length !== brief.suggestions.length) {
      await saveClientBrief(projectId, merged);
    }
  }
  log.info("daily_report.generated", {
    projectId,
    items24h: items24.length,
    nuevosActores: nuevosActores.length,
    tokens: result.inputTokens + result.outputTokens,
  });
  return report;
```

- [ ] **Step 6: Correr tests, tsc, eslint**

Run: `npx vitest run tests/daily-report-split.test.ts tests/monitor-config.test.ts && npx tsc --noEmit && npx eslint lib/daily-report.ts`
Expected: PASS; sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/daily-report.ts tests/daily-report-split.test.ts
git commit -m "feat(escucha): el informe diario lee el brief y sugiere nuevos actores

El prompt incorpora el brief del cliente y pide un bloque json final con
nuevosActores (solo cuentas vistas en las menciones y fuera del plan). Se
separa del markdown y se acumula como sugerencias pendientes en el brief.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Server actions — brief, propuesta, actores sugeridos, marcar aplicado

**Files:**
- Modify: `lib/workspace.ts` (exportar `currentUserEmail`)
- Modify: `app/(dashboard)/escucha/actions.ts`
- Test: `tests/escucha-brief-actions.test.ts`

- [ ] **Step 1: Exportar `currentUserEmail` en `lib/workspace.ts`** (debajo de `sessionEmail`, que es privada)

```ts
// Email del operador logueado (para autoría de aportes al brief).
export async function currentUserEmail(): Promise<string> {
  return (await sessionEmail()) ?? "desconocido";
}
```

- [ ] **Step 2: Escribir el test que falla** (probamos la lógica de incorporar actor, que es la única con reglas; el resto son wrappers de persistencia)

```ts
// tests/escucha-brief-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/workspace", () => ({
  requireMember: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  requireProject: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));

const NOW = "2026-08-25T00:00:00.000Z";
let brief = {
  entries: [],
  suggestions: [
    { id: "x:nuevo", handle: "nuevo", platform: "x", category: "medio", direccion: "B", razon: "r", suggestedAt: NOW, status: "pending" },
  ],
};
let monitor = { accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: [], budget: {}, entidades: {} };
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
const saveMonitorConfig = vi.fn(async (_p: string, m: typeof monitor) => { monitor = m; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
  saveMonitorConfig: (p: string, m: typeof monitor) => saveMonitorConfig(p, m),
}));

import { resolverActorSugerido } from "@/app/(dashboard)/escucha/actions";

describe("resolverActorSugerido", () => {
  beforeEach(() => { saveClientBrief.mockClear(); saveMonitorConfig.mockClear(); });

  it("incorporar: agrega la cuenta al plan con nota y marca accepted", async () => {
    await resolverActorSugerido({ id: "x:nuevo", accepted: true });
    expect(monitor.accounts).toEqual([
      { handle: "nuevo", platform: "x", category: "medio", nota: "sugerido por barrida 2026-08-25" },
    ]);
    expect(brief.suggestions[0].status).toBe("accepted");
  });

  it("descartar: no toca el plan y marca dismissed", async () => {
    brief = { ...brief, suggestions: [{ ...brief.suggestions[0], status: "pending" }] };
    monitor = { ...monitor, accounts: [] };
    await resolverActorSugerido({ id: "x:nuevo", accepted: false });
    expect(saveMonitorConfig).not.toHaveBeenCalled();
    expect(brief.suggestions[0].status).toBe("dismissed");
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/escucha-brief-actions.test.ts`
Expected: FAIL — `resolverActorSugerido` no exportada.

- [ ] **Step 4: Agregar imports y acciones en `app/(dashboard)/escucha/actions.ts`**

Imports (junto a los existentes):

```ts
import { currentUserEmail } from "@/lib/workspace";
import {
  addEntry,
  getClientBrief,
  removeEntry,
  saveClientBrief,
  setSuggestionStatus,
} from "@/lib/client-brief";
import { proposeScenario } from "@/lib/scenario-ai";
```

Acciones nuevas (al final del archivo):

```ts
// ── Brief del cliente → escenario con IA ────────────────────────────────

export async function agregarAporteBrief(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const text = String(formData.get("text") ?? "");
  if (!text.trim()) redirect("/escucha?tab=informe&brief_error=vacio");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, addEntry(brief, { by: await currentUserEmail(), text }));
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&brief=1");
}

export async function quitarAporteBrief(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const id = String(formData.get("id") ?? "");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, removeEntry(brief, id));
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe");
}

export async function generarEscenarioIA() {
  const { id: projectId } = await requireMember("editor");
  const r = await proposeScenario(projectId);
  revalidatePath("/escucha");
  if (!r.ok) redirect(`/escucha?tab=informe&ia_error=${encodeURIComponent(r.error.slice(0, 200))}`);
  redirect("/escucha?tab=informe&ia=1");
}

export async function descartarPropuesta() {
  const { id: projectId } = await requireMember("editor");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, { ...brief, proposal: undefined });
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe");
}

// Incorporar (→ plan de colecta, con nota de origen) o descartar un actor
// sugerido por una barrida. Nunca automático: spec FERRO §9.2.
export async function resolverActorSugerido(input: { id: string; accepted: boolean }) {
  const { id: projectId } = await requireMember("editor");
  const brief = await getClientBrief(projectId);
  const s = brief.suggestions.find((x) => x.id === input.id);
  if (!s) return;
  if (input.accepted) {
    const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
    const monitor = await getMonitorConfig(projectId);
    const yaEsta = monitor.accounts.some((a) => a.platform === s.platform && a.handle.toLowerCase() === s.handle);
    if (!yaEsta) {
      await saveMonitorConfig(projectId, {
        ...monitor,
        accounts: [
          ...monitor.accounts,
          { handle: s.handle, platform: s.platform, category: s.category, nota: `sugerido por barrida ${s.suggestedAt.slice(0, 10)}` },
        ],
      });
    }
  }
  await saveClientBrief(projectId, setSuggestionStatus(brief, input.id, input.accepted ? "accepted" : "dismissed"));
  revalidatePath("/escucha");
}
```

- [ ] **Step 5: Marcar la propuesta como aplicada en `guardarMonitor` y `guardarEscucha`**

En `guardarMonitor`, justo antes de `revalidatePath("/escucha");`:

```ts
  // Si había propuesta de IA pendiente, este Guardar la aplica (parte escenario).
  const brief = await getClientBrief(projectId);
  if (brief.proposal && !brief.proposal.appliedMonitorAt) {
    await saveClientBrief(projectId, {
      ...brief,
      proposal: { ...brief.proposal, appliedMonitorAt: new Date().toISOString() },
    });
  }
```

En `guardarEscucha`, justo después de `await saveListeningConfig(projectId, parsed.data);`:

```ts
  // Si había propuesta de IA pendiente, este Guardar aplica las keywords.
  const brief = await getClientBrief(projectId);
  if (brief.proposal && !brief.proposal.appliedKeywordsAt) {
    await saveClientBrief(projectId, {
      ...brief,
      proposal: { ...brief.proposal, appliedKeywordsAt: new Date().toISOString() },
    });
  }
```

- [ ] **Step 6: Correr tests, tsc, eslint**

Run: `npx vitest run tests/escucha-brief-actions.test.ts && npx tsc --noEmit && npx eslint "app/(dashboard)/escucha/actions.ts" lib/workspace.ts`
Expected: 2 tests PASS; sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/workspace.ts "app/(dashboard)/escucha/actions.ts" tests/escucha-brief-actions.test.ts
git commit -m "feat(escucha): acciones de brief, propuesta IA y actores sugeridos

agregar/quitar aporte, generar escenario, descartar propuesta, incorporar o
descartar actor sugerido. Guardar escenario / keywords marcan la propuesta
como aplicada (por parte).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: UI — `brief-panel.tsx` y `actor-suggestions.tsx`

**Files:**
- Create: `components/escucha/brief-panel.tsx`
- Create: `components/escucha/actor-suggestions.tsx`

- [ ] **Step 1: Crear `components/escucha/brief-panel.tsx`** (server component; forms con server actions)

```tsx
// Contexto del cliente: aportes acumulativos (append-only) + "Generar
// escenario con IA" + estado de la propuesta pendiente. Lo generado NO se
// aplica acá: se prellena en los editores de Escenario / Configurar y se
// aplica con sus Guardar.
import {
  agregarAporteBrief,
  quitarAporteBrief,
  generarEscenarioIA,
  descartarPropuesta,
} from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { briefHash, type ClientBrief } from "@/lib/client-brief";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function BriefPanel({
  brief,
  canGenerate,
  flags,
}: {
  brief: ClientBrief;
  // false si falta la API key de Claude
  canGenerate: boolean;
  flags: { saved: boolean; generated: boolean; iaError?: string; briefError?: string };
}) {
  const p = brief.proposal;
  const pendiente = p && !(p.appliedKeywordsAt && p.appliedMonitorAt);
  const briefCambio = p && p.briefHash !== briefHash(brief);
  const parcial = p && (p.appliedKeywordsAt ? !p.appliedMonitorAt : Boolean(p.appliedMonitorAt));

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Contexto del cliente</h2>
        <p className="max-w-[70ch] text-xs text-zinc-500">
          Contá quién es el cliente, qué se juega, actores, territorio y fechas. Cada aporte se suma
          al anterior; la IA arma el escenario de monitoreo a partir de todo el brief.
        </p>
      </div>

      {brief.entries.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {brief.entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-[13px]">
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                {fecha(e.at)} · {e.by}
              </span>
              <span className="flex-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{e.text}</span>
              <form action={quitarAporteBrief}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="text-[11px] text-zinc-400 hover:text-red-600" title="Quitar aporte">
                  quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">Todavía no hay aportes.</p>
      )}

      <form action={agregarAporteBrief} className="space-y-2">
        <textarea
          name="text"
          rows={3}
          placeholder="Ej: Municipio de Ibicuy (Entre Ríos). Nos interesa la gestión local: cloacas, caminos, agua. Intendente actual X; la oposición se agrupa en Y."
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton variant="secondary" pendingLabel="Guardando…">Agregar aporte</SubmitButton>
          <FormStatus ok={flags.saved ? "Aporte guardado." : null} error={flags.briefError ? "El aporte está vacío." : null} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <form action={generarEscenarioIA}>
          <SubmitButton
            variant="accent"
            disabled={!canGenerate || brief.entries.length === 0}
            pendingLabel="Leyendo el brief y armando el escenario…"
          >
            Generar escenario con IA
          </SubmitButton>
        </form>
        {!canGenerate && (
          <span className="text-xs text-zinc-500">Configurá el conector Claude (API key) para generar.</span>
        )}
        {canGenerate && brief.entries.length === 0 && (
          <span className="text-xs text-zinc-500">Agregá al menos un aporte.</span>
        )}
      </div>
      <FormStatus ok={flags.generated ? "Propuesta lista: revisala abajo y en Configurar → Keywords." : null} error={flags.iaError ?? null} />

      {p && pendiente && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="font-medium">
            Propuesta del {fecha(p.at)} {parcial ? "parcialmente aplicada" : "sin aplicar"} · {p.tipo}
            {briefCambio && " · el brief cambió desde esta propuesta"}
          </div>
          <p className="whitespace-pre-wrap">{p.resumen}</p>
          <p className="text-xs">
            {p.keywords.length} keywords · {p.searchesA.length}+{p.searchesB.length} búsquedas · {p.accounts.length} cuentas ·{" "}
            {Object.keys(p.entidades).length} entidades · {p.calendar.length} hitos.{" "}
            {p.appliedKeywordsAt ? "Keywords aplicadas. " : "Keywords: Configurar → Guardar. "}
            {p.appliedMonitorAt ? "Escenario aplicado." : "Escenario: abajo → Guardar escenario."}
          </p>
          <form action={descartarPropuesta}>
            <button type="submit" className="text-xs underline">Descartar propuesta</button>
          </form>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Crear `components/escucha/actor-suggestions.tsx`** (client component: botones con `useTransition`)

```tsx
"use client";

// Actores que las barridas sugirieron y todavía no se resolvieron.
// Incorporar → plan de colecta (con nota de origen). Descartar → no vuelve.
import { useTransition } from "react";
import { resolverActorSugerido } from "@/app/(dashboard)/escucha/actions";
import type { ActorSuggestion } from "@/lib/client-brief";

export function ActorSuggestions({ suggestions }: { suggestions: ActorSuggestion[] }) {
  const [pending, start] = useTransition();
  const list = suggestions.filter((s) => s.status === "pending");
  if (list.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Actores sugeridos ({list.length})
      </h2>
      <p className="max-w-[70ch] text-xs text-zinc-500">
        Cuentas que aparecieron en las menciones y no están en el plan. Incorporar las suma al
        escenario con nota de origen; nada entra solo.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="py-1 pr-3">Cuenta</th>
              <th className="py-1 pr-3">Plataforma</th>
              <th className="py-1 pr-3">Categoría</th>
              <th className="py-1 pr-3">Dir.</th>
              <th className="py-1 pr-3">Razón</th>
              <th className="py-1 pr-3">Barrida</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5 pr-3 font-mono">@{s.handle}</td>
                <td className="py-1.5 pr-3">{s.platform}</td>
                <td className="py-1.5 pr-3">{s.category}</td>
                <td className="py-1.5 pr-3">{s.direccion}</td>
                <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-300">
                  {s.razon}
                  {s.evidencia && (
                    <>
                      {" "}
                      <a href={s.evidencia} target="_blank" rel="noreferrer" className="underline">
                        evidencia →
                      </a>
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-3 font-mono tabular-nums text-zinc-500">{s.suggestedAt.slice(0, 10)}</td>
                <td className="py-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(() => resolverActorSugerido({ id: s.id, accepted: true }))}
                    className="mr-2 rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Incorporar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(() => resolverActorSugerido({ id: s.id, accepted: false }))}
                    className="text-zinc-500 hover:text-red-600 disabled:opacity-60"
                  >
                    Descartar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: tsc + eslint**

Run: `npx tsc --noEmit && npx eslint components/escucha/brief-panel.tsx components/escucha/actor-suggestions.tsx`
Expected: sin errores (los componentes todavía no se montan; se conectan en Task 9).

- [ ] **Step 4: Commit**

```bash
git add components/escucha/brief-panel.tsx components/escucha/actor-suggestions.tsx
git commit -m "feat(escucha): paneles de brief del cliente y actores sugeridos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Editores prellenados con la propuesta (`monitor-editor.tsx`, `config-form.tsx`)

**Files:**
- Modify: `components/escucha/monitor-editor.tsx`
- Modify: `components/escucha/config-form.tsx:159-175` y `:233-244`

- [ ] **Step 1: `monitor-editor.tsx` — prop `proposal`, prellenado y diff por campo**

Reemplazar la firma y agregar un helper de diff. Contenido nuevo del archivo (mantiene `Field` e `inputCls` como están):

```tsx
// Editor del escenario de monitoreo electoral (server-first): cuentas del
// plan de colecta, búsquedas simétricas, calendario, memoria de errores y
// definiciones. Editor por líneas, en línea con el patrón de config de fuentes.
//
// Con una propuesta de IA pendiente (lib/scenario-ai), los campos que la IA
// produce se prellenan con la propuesta y muestran "vigente → propuesto";
// Guardar aplica. noRepetir y budget no los toca la IA.
import { guardarMonitor } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ScenarioProposal } from "@/lib/client-brief";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-[12px] text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Field({ label, children, hint, diff }: { label: string; children: React.ReactNode; hint?: React.ReactNode; diff?: string }) {
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          {label}
          {diff && <span className="ml-2 normal-case tracking-normal text-amber-700 dark:text-amber-300">{diff}</span>}
        </span>
        {children}
      </label>
      {hint && <p className="max-w-[70ch] text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

// "vigente 3 → propuesto 5 (+3 −1)" comparando líneas normalizadas.
export function diffLabel(current: string[], proposed: string[] | undefined): string | undefined {
  if (!proposed) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const cur = new Set(current.map(norm));
  const pro = new Set(proposed.map(norm));
  const added = [...pro].filter((x) => !cur.has(x)).length;
  const removed = [...cur].filter((x) => !pro.has(x)).length;
  return `vigente ${current.length} → propuesto ${proposed.length} (+${added} −${removed})`;
}

const accLine = (a: { handle: string; platform: string; category: string; vinculo?: string }) =>
  `${a.handle}, ${a.platform}, ${a.category}${a.vinculo ? `, ${a.vinculo}` : ""}`;
const calLine = (e: { label: string; date: string }) => `${e.label}, ${e.date}`;
const entLines = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}: ${v}`);

export function MonitorEditor({ cfg, saved, proposal }: { cfg: MonitorConfig; saved: boolean; proposal?: ScenarioProposal }) {
  // Solo se prellena si la propuesta no se aplicó todavía en esta parte.
  const p = proposal && !proposal.appliedMonitorAt ? proposal : undefined;
  const accounts = { cur: cfg.accounts.map(accLine), pro: p?.accounts.map(accLine) };
  const sA = { cur: cfg.searchesA, pro: p?.searchesA };
  const sB = { cur: cfg.searchesB, pro: p?.searchesB };
  const cal = { cur: cfg.calendar.map(calLine), pro: p?.calendar.map(calLine) };
  const ent = { cur: entLines(cfg.entidades), pro: p ? entLines(p.entidades) : undefined };
  const val = (x: { cur: string[]; pro?: string[] }) => (x.pro ?? x.cur).join("\n");

  return (
    <details open={Boolean(p)} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Escenario de monitoreo electoral ({cfg.accounts.length} cuentas)
        {p && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">· propuesta de IA prellenada — revisá y guardá</span>}
      </summary>
      <form action={guardarMonitor} className="mt-4 space-y-5">
        <Field
          label="Cuentas a monitorear (una por línea)"
          diff={diffLabel(accounts.cur, accounts.pro)}
          hint={<>Formato: <code>handle, plataforma, categoría[, vínculo]</code>. Plataforma: instagram/x/facebook/tiktok. Categoría: organizacion/medio/individual/institucional/opera. El plugin baja estas cuentas como plan de colecta.</>}
        >
          <textarea name="accounts" rows={6} defaultValue={val(accounts)} placeholder={"listaverde, instagram, organizacion\ndiariodelclub, x, medio, lista azul\nmuni, facebook, institucional"} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Búsquedas dirección A" diff={diffLabel(sA.cur, sA.pro)} hint="Términos de un lado del conflicto.">
            <textarea name="searchesA" rows={3} defaultValue={val(sA)} className={inputCls} />
          </Field>
          <Field label="Búsquedas dirección B" diff={diffLabel(sB.cur, sB.pro)} hint="Términos simétricos del otro lado (spec §7.5).">
            <textarea name="searchesB" rows={3} defaultValue={val(sB)} className={inputCls} />
          </Field>
        </div>
        <Field label="Calendario (una por línea)" diff={diffLabel(cal.cur, cal.pro)} hint={<>Formato: <code>hito, fecha</code> (ej: <code>Elección, 2026-09-14</code>). El informe expresa la cuenta regresiva en días que faltan.</>}>
          <textarea name="calendar" rows={2} defaultValue={val(cal)} className={inputCls} />
        </Field>
        <Field label="Memoria de errores — no repetir (una por línea)" hint="Cada corrección que hagas se inyecta al prompt del informe para no repetir el mismo error.">
          <textarea name="noRepetir" rows={3} defaultValue={cfg.noRepetir.join("\n")} className={inputCls} />
        </Field>
        <Field label="Definiciones de entidades (una por línea)" diff={diffLabel(ent.cur, ent.pro)} hint={<>Formato: <code>nombre: definición</code>. Lugares/personas/cargos que no hay que confundir (spec §7.8).</>}>
          <textarea name="entidades" rows={3} defaultValue={val(ent)} className={inputCls} />
        </Field>
        <div className="space-y-2">
          <SubmitButton variant="accent" pendingLabel="Guardando…">Guardar escenario</SubmitButton>
          <FormStatus ok={saved ? "Escenario guardado. El plugin lo bajará en la próxima corrida." : null} error={null} />
        </div>
      </form>
    </details>
  );
}
```

- [ ] **Step 2: `config-form.tsx` — prop `proposedKeywords` y aviso**

En `ConfigFormProps` (buscar la interfaz; está arriba de la función) agregar:

```ts
  // Keywords propuestas por la IA (brief del cliente) pendientes de aplicar.
  proposedKeywords?: string[];
```

En la firma de `ConfigForm` agregar `proposedKeywords,` a la destructuración. Reemplazar el `Field` de Keywords por:

```tsx
          <Field
            label="Keywords (una por línea)"
            hint={
              proposedKeywords ? (
                <>
                  <span className="text-amber-700 dark:text-amber-300">
                    Propuesta de IA prellenada (vigente {cfg.keywords.length} → propuesto {proposedKeywords.length}). Guardar la aplica.
                  </span>{" "}
                  La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT.
                </>
              ) : (
                "Temas a rastrear en todas las fuentes. La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT."
              )
            }
          >
            <textarea
              name="keywords"
              rows={proposedKeywords ? 8 : 3}
              defaultValue={(proposedKeywords ?? cfg.keywords).join("\n")}
              placeholder={"obras\nseguridad\nsalud"}
              className={`${inputCls} font-mono`}
            />
          </Field>
```

- [ ] **Step 3: tsc + eslint**

Run: `npx tsc --noEmit && npx eslint components/escucha/monitor-editor.tsx components/escucha/config-form.tsx`
Expected: sin errores (`proposal`/`proposedKeywords` son opcionales; los callers actuales compilan).

- [ ] **Step 4: Commit**

```bash
git add components/escucha/monitor-editor.tsx components/escucha/config-form.tsx
git commit -m "feat(escucha): editores prellenados con la propuesta de IA y diff por campo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Cablear página y panel Informe

**Files:**
- Modify: `components/escucha/informe-panel.tsx`
- Modify: `app/(dashboard)/escucha/page.tsx:125-140`

- [ ] **Step 1: `informe-panel.tsx` — props nuevas y orden de secciones**

Imports nuevos:

```tsx
import { BriefPanel } from "@/components/escucha/brief-panel";
import { ActorSuggestions } from "@/components/escucha/actor-suggestions";
import type { ClientBrief } from "@/lib/client-brief";
```

Firma:

```tsx
export function InformePanel({
  latest,
  history,
  generado,
  monitor,
  monitorSaved,
  brief,
  canGenerate,
  briefFlags,
}: {
  latest: DailyReport | null;
  history: DailyReport[];
  generado: boolean;
  monitor: MonitorConfig;
  monitorSaved: boolean;
  brief: ClientBrief;
  canGenerate: boolean;
  briefFlags: { saved: boolean; generated: boolean; iaError?: string; briefError?: string };
}) {
```

Dentro del `<div className="space-y-6">`, como PRIMEROS hijos (antes de la sección "Último informe"):

```tsx
      <BriefPanel brief={brief} canGenerate={canGenerate} flags={briefFlags} />
      <ActorSuggestions suggestions={brief.suggestions} />
```

Y reemplazar `<MonitorEditor cfg={monitor} saved={monitorSaved} />` por:

```tsx
      <MonitorEditor cfg={monitor} saved={monitorSaved} proposal={brief.proposal} />
```

- [ ] **Step 2: `page.tsx` — leer brief, API key y pasar props**

Imports nuevos:

```tsx
import { getClientBrief } from "@/lib/client-brief";
import { getConnectorConfig } from "@/lib/connectors/config";
```

Reemplazar la rama `tab === "informe"` por:

```tsx
      ) : tab === "informe" ? (
        <InformePanel
          {...await readDailyReports(projectId)}
          generado={params.generado === "1"}
          monitor={await getMonitorConfig(projectId)}
          monitorSaved={params.monitor === "1"}
          brief={await getClientBrief(projectId)}
          canGenerate={Boolean((await getConnectorConfig("claude-api", projectId)).ANTHROPIC_API_KEY)}
          briefFlags={{
            saved: params.brief === "1",
            generated: params.ia === "1",
            iaError: params.ia_error,
            briefError: params.brief_error,
          }}
        />
```

En la rama de Configurar, agregar a `<ConfigForm ... />` la prop:

```tsx
            proposedKeywords={await proposedKeywordsFor(projectId)}
```

y arriba del componente `EscuchaPage` (mismo archivo) el helper:

```tsx
// Keywords de la propuesta de IA pendiente (brief del cliente), si la hay.
async function proposedKeywordsFor(projectId: string): Promise<string[] | undefined> {
  const { proposal } = await getClientBrief(projectId);
  return proposal && !proposal.appliedKeywordsAt ? proposal.keywords : undefined;
}
```

- [ ] **Step 3: tsc, eslint, suite completa**

Run: `npx tsc --noEmit && npx eslint "app/(dashboard)/escucha/page.tsx" components/escucha/informe-panel.tsx && npx vitest run`
Expected: sin errores; todos los tests PASS (los ~790 previos + los nuevos).

- [ ] **Step 4: Commit**

```bash
git add components/escucha/informe-panel.tsx "app/(dashboard)/escucha/page.tsx"
git commit -m "feat(escucha): brief del cliente, propuesta IA y actores sugeridos en el panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación en producción

**Files:** ninguno (verificación manual + logs)

- [ ] **Step 1: Push y esperar deploy**

```bash
git push origin main
for i in $(seq 1 45); do st=$(gh api "repos/rundes/severo-tronador/commits/$(git rev-parse HEAD)/status" -q .state); [ "$st" = "success" ] && break; sleep 10; done; echo "deploy=$st"
```

Expected: `deploy=success`.

- [ ] **Step 2: Smoke en el panel (proyecto Ibicuy)** — `https://severo-tronador.vercel.app/escucha?tab=informe`
  1. "Contexto del cliente" arriba; agregar un aporte → aparece con fecha y email; "Aporte guardado."
  2. "Generar escenario con IA" habilitado (hay API key) → banner ámbar "Propuesta del … sin aplicar" con resumen y conteos.
  3. Escenario de monitoreo abierto, campos con `vigente N → propuesto M`; Guardar escenario → "Escenario guardado" y el banner pasa a "parcialmente aplicada".
  4. Configurar → Keywords prellenadas con aviso ámbar; Guardar → volver a Informe: banner desaparece (aplicada completa).
  5. "Barrer y generar informe" → el informe se guarda (fix Task 1) y, si el modelo detectó cuentas, aparece "Actores sugeridos (N)"; Incorporar una → entra en Cuentas con nota `sugerido por barrida <fecha>`.

- [ ] **Step 3: Si algo falla** — `gh run list` no aplica (es Vercel): revisar logs de la función en Vercel buscando `scenario_ai.parse_failed`, `client_brief.save_failed`, `daily_report.actors_parse_failed`. Si el modelo no cierra con el bloque json, el informe igual se guarda (por diseño); ajustar la instrucción final del prompt en Task 5 Step 4.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec**: datos (Task 2), prompt/parseo/propuesta (3-4), informe + actores (5), acciones + marcar aplicado por parte (6), UI (7-9), fix 42P10 (1, incluye `saveReport` que el spec no nombraba pero tiene el mismo bug), errores (sin API key → botón deshabilitado en 7/9; JSON inválido → `ia_error` en 6/7; brief vacío → 4/6/7), tests por módulo (1,2,4,5,6). Fuera de alcance respetado.
- **Tipos**: `ScenarioProposal` (Task 2) usa `appliedKeywordsAt`/`appliedMonitorAt` (el spec decía `appliedAt`; se desdobló para expresar "parcialmente aplicada"); `MonitorAccount`, `CalendarEvent`, `Platform`, `Category` vienen de `lib/monitor-config`; `ActorSuggestion.status` con los tres valores usados en 5/6/7; `resolverActorSugerido({ id, accepted })` igual en 6 y 7; `diffLabel` exportada por si se testea.
- **Sin placeholders**: cada paso trae código o comando exacto.
