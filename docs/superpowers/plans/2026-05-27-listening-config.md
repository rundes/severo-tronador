# Listening Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar la escucha (zona geográfica + país + radio + keywords + fuentes) desde `/escucha`, persistida en `listening_config`, e inyectada en los `fetch` de los conectores de listening.

**Architecture:** `getListeningConfig()` lee la fila única de `listening_config` (o un default sin Supabase). `runListening()` arma un `ListenQuery` desde esa config y corre solo los conectores en `fuentes`. Un form en `/escucha` guarda la config vía server action.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase (`listening_config`, single row id=1), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-listening-config-design.md`

---

## File structure
| Archivo | Responsabilidad |
|---|---|
| `lib/listening-config.ts` | get/save de la config (single row) |
| `lib/connectors/types.ts` | extender `ListenQuery` |
| `lib/listening.ts` | `runListening` usa la config |
| `app/(dashboard)/escucha/actions.ts` | server action `guardarEscucha` |
| `app/(dashboard)/escucha/page.tsx` | form de config + mostrar config activa |
| `tests/listening-config.test.ts` | tests |

---

## Task 1: `lib/listening-config.ts` + extender `ListenQuery`

**Files:**
- Create: `lib/listening-config.ts`
- Modify: `lib/connectors/types.ts` (interface `ListenQuery`)
- Test: `tests/listening-config.test.ts`

- [ ] **Step 1: Test (sin Supabase → default)**

Create `tests/listening-config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getListeningConfig } from "@/lib/listening-config";

describe("listening-config", () => {
  it("sin Supabase devuelve el default (pais AR, listas vacías)", async () => {
    const cfg = await getListeningConfig();
    expect(cfg.pais).toBe("AR");
    expect(cfg.keywords).toEqual([]);
    expect(cfg.fuentes).toEqual([]);
    expect(cfg.zona).toBe("");
    expect(cfg.radioKm).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npm test -- tests/listening-config.test.ts`).

- [ ] **Step 3: Create `lib/listening-config.ts`:**
```ts
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface ListeningConfig {
  zona: string;
  pais: string;
  radioKm: number | null;
  keywords: string[];
  fuentes: string[];
}

const DEFAULT: ListeningConfig = {
  zona: "", pais: "AR", radioKm: null, keywords: [], fuentes: [],
};

interface Row {
  geo: { zona?: string; pais?: string } | null;
  radio: number | null;
  keywords: string[] | null;
  fuentes: string[] | null;
}

export async function getListeningConfig(): Promise<ListeningConfig> {
  if (!dbConfigured()) return { ...DEFAULT };
  const { data } = await getSupabase()
    .from("listening_config").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT };
  const r = data as Row;
  return {
    zona: r.geo?.zona ?? "",
    pais: r.geo?.pais ?? "AR",
    radioKm: r.radio ?? null,
    keywords: r.keywords ?? [],
    fuentes: r.fuentes ?? [],
  };
}

export async function saveListeningConfig(cfg: ListeningConfig): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado: no se puede guardar la configuración de escucha");
  const { error } = await getSupabase().from("listening_config").upsert(
    {
      id: 1,
      geo: { zona: cfg.zona, pais: cfg.pais },
      radio: cfg.radioKm,
      keywords: cfg.keywords,
      fuentes: cfg.fuentes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}
```

- [ ] **Step 4: Extender `ListenQuery`** en `lib/connectors/types.ts`. Localizar la interface actual (`{ keywords: string[]; geo?: string; since?: string }`) y reemplazarla por:
```ts
export interface ListenQuery {
  keywords: string[];
  geo?: string;
  since?: string;
  zona?: string;
  pais?: string;
  radioKm?: number | null;
}
```

- [ ] **Step 5: Run → PASS** (`npm test -- tests/listening-config.test.ts`) + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**
```bash
git add lib/listening-config.ts lib/connectors/types.ts tests/listening-config.test.ts
git commit -m "feat(listening): config de escucha (get/save) + ListenQuery con geo"
```

---

## Task 2: `runListening` usa la config

**Files:**
- Modify: `lib/listening.ts`
- Test: `tests/listening-run.test.ts`

- [ ] **Step 1: Test (con config default corre todas las fuentes y trae items del mock)**

Create `tests/listening-run.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runListening } from "@/lib/listening";

describe("runListening con config", () => {
  it("sin config (default) trae items del mock y detecta temas", async () => {
    const res = await runListening();
    expect(res.totalItems).toBeGreaterThan(0);
    expect(Array.isArray(res.topics)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → debería pasar ya (runListening existe); luego refactor.** Run `npm test -- tests/listening-run.test.ts`.

- [ ] **Step 3: Refactor `runListening`** en `lib/listening.ts`. Leer la firma actual (hoy: `export async function runListening(keywords: string[] = []): Promise<ListeningResult>` que filtra `connectors` por category `listening` y hace `fetch({ keywords })`). Cambiar a leer la config:
```ts
import { getListeningConfig } from "@/lib/listening-config";
import type { ListenQuery } from "@/lib/connectors/types";
// ...
export async function runListening(): Promise<ListeningResult> {
  const cfg = await getListeningConfig();
  const listeners = (connectors.filter((c) => c.category === "listening") as ListeningConnector[])
    .filter((c) => cfg.fuentes.length === 0 || cfg.fuentes.includes(c.id));
  const query: ListenQuery = {
    keywords: cfg.keywords,
    zona: cfg.zona || undefined,
    pais: cfg.pais || undefined,
    radioKm: cfg.radioKm,
  };
  const items: ListenItem[] = (await Promise.all(listeners.map((l) => l.fetch(query)))).flat();
  // ...resto IGUAL (coding con claudeApiConnector, cálculo de topics emerging, bySource)...
}
```
Mantener el resto del cuerpo (análisis/temas) sin cambios. El page `/escucha` llama `runListening()` sin args — sigue válido.

- [ ] **Step 4: Run → PASS** (`npm test -- tests/listening-run.test.ts`) + `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add lib/listening.ts tests/listening-run.test.ts
git commit -m "feat(listening): runListening usa la config (fuentes + query geo)"
```

---

## Task 3: UI de configuración en `/escucha`

**Files:**
- Create: `app/(dashboard)/escucha/actions.ts`
- Modify: `app/(dashboard)/escucha/page.tsx`

- [ ] **Step 1: Server action**

Create `app/(dashboard)/escucha/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";

export async function guardarEscucha(formData: FormData) {
  const keywords = String(formData.get("keywords") ?? "")
    .split("\n").map((k) => k.trim()).filter(Boolean);
  const fuentes = formData.getAll("fuentes").map(String);
  const radioRaw = String(formData.get("radioKm") ?? "").trim();
  const radioKm = radioRaw && !Number.isNaN(Number(radioRaw)) ? Number(radioRaw) : null;
  await saveListeningConfig({
    zona: String(formData.get("zona") ?? "").trim(),
    pais: String(formData.get("pais") ?? "AR").trim() || "AR",
    radioKm,
    keywords,
    fuentes,
  });
  revalidatePath("/escucha");
}
```

- [ ] **Step 2: Form + config activa en la page**

Modify `app/(dashboard)/escucha/page.tsx`. Leer el archivo actual primero. Importar `getListeningConfig` y `guardarEscucha`. Al inicio del componente: `const cfg = await getListeningConfig();`. Agregar (arriba de la lista de temas) una sección con un `<form action={guardarEscucha}>`:
```tsx
const FUENTES = [
  { id: "gdelt", label: "📰 GDELT" },
  { id: "x-api", label: "𝕏 X" },
  { id: "reddit-api", label: "👽 Reddit" },
];
// ...dentro del JSX, antes de los temas:
<form action={guardarEscucha} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
  <div className="text-sm font-medium">Configurar escucha</div>
  <div className="grid grid-cols-2 gap-3">
    <label className="flex flex-col gap-1 text-xs text-zinc-500">Zona
      <input name="zona" defaultValue={cfg.zona} placeholder="ej: La Plata"
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
    </label>
    <label className="flex flex-col gap-1 text-xs text-zinc-500">País
      <input name="pais" defaultValue={cfg.pais}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
    </label>
    <label className="flex flex-col gap-1 text-xs text-zinc-500">Radio (km, opcional)
      <input name="radioKm" type="number" defaultValue={cfg.radioKm ?? ""}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
    </label>
  </div>
  <label className="flex flex-col gap-1 text-xs text-zinc-500">Keywords (una por línea)
    <textarea name="keywords" rows={3} defaultValue={cfg.keywords.join("\n")}
      className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
  </label>
  <div className="flex flex-wrap gap-3 text-sm">
    {FUENTES.map((f) => (
      <label key={f.id} className="flex items-center gap-1">
        <input type="checkbox" name="fuentes" value={f.id} defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes(f.id)} />
        {f.label}
      </label>
    ))}
  </div>
  <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Guardar escucha</button>
  <p className="text-xs text-zinc-400">Sin Supabase configurado, guardar avisa el error; la escucha corre con el default (todo el mock).</p>
</form>
```
No cambiar el resto del page (ya llama `runListening()` que ahora lee la config). El page ya es async server component.

- [ ] **Step 3: Build + smoke**

Run `npm run build` (compila, `/escucha` presente). `npm run dev`, GET `/escucha` → 200 y el HTML contiene "Configurar escucha". Parar el dev server (kill PID del puerto 3000).

- [ ] **Step 4: Commit**
```bash
git add "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx"
git commit -m "feat(ui): configurar la escucha (zona/keywords/fuentes) en /escucha"
```

---

## Task 4: Docs + verificación

**Files:** `docs/STABILIZATION.md`, `docs/INTEGRATIONS.md`

- [ ] **Step 1:** En `docs/STABILIZATION.md`, ítem 13 (Listening real): aclarar que la **config** de escucha (zona/keywords/fuentes) ya existe y se gestiona desde `/escucha`; lo pendiente es el `fetch` real de GDELT/X/Reddit (hoy mock).

- [ ] **Step 2:** En `docs/INTEGRATIONS.md`, en las secciones GDELT/X/Reddit, una nota: "La zona/keywords/fuentes se configuran desde `/escucha → Configurar escucha`; esos parámetros se inyectan en el query de la API cuando el conector está en modo real."

- [ ] **Step 3:** `npm test` (todo verde) + `npm run build` (verde). Smoke `/escucha`: form presente, guardar sin Supabase muestra el aviso de error (esperado).

- [ ] **Step 4: Commit**
```bash
git add docs/STABILIZATION.md docs/INTEGRATIONS.md
git commit -m "docs: configuración de escucha desde /escucha"
```

---

## Self-review (cobertura del spec)
- `getListeningConfig`/`saveListeningConfig` single-row + default → Task 1 ✓
- `ListenQuery` con geo → Task 1 ✓
- `runListening` arma query + filtra fuentes → Task 2 ✓
- UI form (zona/pais/radio/keywords/fuentes) + server action + config activa → Task 3 ✓
- Degradación sin Supabase (default + aviso) → Tasks 1, 3 ✓
- Mapeo geo por conector: en mock los conectores filtran por keywords; la geo viaja en el query para el modo real (sin cambios de conector necesarios — `fetch(query)` ya recibe `ListenQuery`) ✓
- Docs → Task 4 ✓

> **Nota de alcance**: los conectores de listening ya aceptan `ListenQuery` en `fetch()`; no requieren cambios para recibir la geo (la usan cuando se implemente el modo real, P2). Por eso no hay una task de "refactor de conectores" como en #1.
