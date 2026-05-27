# Supabase Persistence Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los stores en memoria (`globalThis`) por Supabase como base operativa, con Google Sheets espejado write-behind para preservación, y el padrón cargado por el usuario.

**Architecture:** Supabase (Postgres) primario vía service-role. Interfaz `Repository<T>` por entidad (impl Supabase) + decorador `withMirror` que encola en `sheets_sync_queue`; un Vercel Cron drena a Sheets con backoff. Sin credenciales Supabase, fallback a los stores en memoria actuales (dev). Login sigue en NextAuth. Single-tenant, sin RLS.

**Tech Stack:** Next.js 16, TypeScript, `@supabase/supabase-js`, Vitest, Web Crypto (AES-GCM), `googleapis` (export a Sheets).

**Spec:** `docs/superpowers/specs/2026-05-27-supabase-persistence-design.md`

---

## File structure

| Archivo | Responsabilidad |
|---|---|
| `lib/db/supabase.ts` | Cliente service-role + flag `dbConfigured` |
| `lib/db/types.ts` | `Repository<T>` + tipos de fila |
| `lib/db/repo.ts` | `supabaseRepo<T>(table)` genérico |
| `lib/db/mirror.ts` | `withMirror()` + `enqueueSheetSync()` |
| `lib/db/memory.ts` | `memoryRepo<T>()` (fallback dev, sin Supabase) |
| `lib/db/padron.ts` | repo padrón + `filterPadron` + parser CSV |
| `lib/crypto.ts` | AES-GCM `encrypt`/`decrypt` |
| `lib/sheets-export.ts` | escribe filas a la Sheet de preservación |
| `supabase/migrations/0001_init.sql` | esquema |
| `app/api/cron/sheets-sync/route.ts` | drena la cola → Sheets |
| `app/(dashboard)/padron/page.tsx` + `actions.ts` | ingest del padrón |
| `vitest.config.ts`, `tests/**` | tests |

Cada módulo operativo (`campaigns.ts`, `survey.ts`, `optout.ts`, `quota.ts`, `templates.ts`, `calls.ts`, `segments.ts`) cambia su store interno por un repo, **manteniendo su firma pública**.

---

## Task 0: Dependencias y Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar deps**

Run:
```bash
npm install @supabase/supabase-js
npm install -D vitest
```
Expected: añadidas sin error.

- [ ] **Step 2: Config de Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Script de test**

Modify `package.json` scripts: agregar `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Smoke**

Run: `npm test`
Expected: "No test files found" (exit 0) — Vitest corre.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add supabase-js + vitest"
```

---

## Task 1: Cliente Supabase + flag de configuración

**Files:**
- Create: `lib/db/supabase.ts`
- Test: `tests/db/supabase.test.ts`

- [ ] **Step 1: Test**

Create `tests/db/supabase.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("dbConfigured", () => {
  it("false sin env", async () => {
    const m = await import("@/lib/db/supabase?" + Date.now());
    expect(m.dbConfigured()).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/db/supabase.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Create `lib/db/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

// Cliente service-role (solo server). Single-tenant, sin RLS.
export function getSupabase(): SupabaseClient {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  if (!cached) {
    cached = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return cached;
}
```

- [ ] **Step 4: Verificar**

Run: `npm test -- tests/db/supabase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/supabase.ts tests/db/supabase.test.ts
git commit -m "feat(db): cliente Supabase service-role + dbConfigured"
```

---

## Task 2: Esquema SQL

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Escribir el esquema**

Create `supabase/migrations/0001_init.sql`:
```sql
-- Espejadas a Sheets
create table if not exists padron (
  id uuid primary key default gen_random_uuid(),
  dni text unique not null,
  nombre text, apellido text, fecha_nac text, sexo text, domicilio text,
  barrio text, circuito text, mesa text, telefono text, email text,
  source text, imported_at timestamptz default now()
);
create table if not exists segmentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, filtros jsonb not null default '{}',
  created_by text, created_at timestamptz default now()
);
create table if not exists templates (
  id text primary key, channel text not null, nombre text not null,
  asunto text, cuerpo text not null, estado text not null default 'activo',
  created_at timestamptz default now()
);
create table if not exists campanas (
  id text primary key, nombre text not null, channel text not null,
  template_id text, segment_filter jsonb, preguntas jsonb,
  estado text, metrics jsonb, created_at timestamptz default now()
);
create table if not exists envios (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null, dni text, nombre text, destino text,
  estado text, reason text, provider_message_id text, delivery text,
  token text, created_at timestamptz default now()
);
create table if not exists respuestas (
  id uuid primary key default gen_random_uuid(),
  token text not null, campaign_id text, dni text,
  answers jsonb not null default '[]', created_at timestamptz default now()
);
create table if not exists opt_outs (
  dni text primary key, at timestamptz default now(), reason text
);
create table if not exists llamadas (
  id uuid primary key default gen_random_uuid(),
  dni text not null, at timestamptz default now(), outcome text, notes text
);
-- Solo Supabase
create table if not exists conector_config (
  connector_id text primary key, config jsonb, enabled boolean default false,
  updated_at timestamptz default now()
);
create table if not exists cuotas (
  connector_id text primary key, used int not null default 0,
  period text, resets_at timestamptz, updated_at timestamptz default now()
);
create table if not exists listening_config (
  id int primary key default 1, geo jsonb, keywords text[], fuentes text[],
  radio int, updated_at timestamptz default now()
);
create table if not exists survey_tokens (
  token text primary key, campaign_id text not null, dni text not null,
  created_at timestamptz default now()
);
create table if not exists listening_items (
  id uuid primary key default gen_random_uuid(),
  source text, text text, url text, published_at timestamptz, topic text
);
create table if not exists sheets_sync_queue (
  id uuid primary key default gen_random_uuid(),
  entity text not null, op text not null, payload jsonb not null,
  status text not null default 'pending', attempts int default 0,
  last_error text, created_at timestamptz default now()
);
create index if not exists idx_padron_dni on padron(dni);
create index if not exists idx_envios_token on envios(token);
create index if not exists idx_sync_status on sheets_sync_queue(status);
```

- [ ] **Step 2: Commit** (la migración se aplica en Supabase manualmente o vía CLI; no requiere test)

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): esquema inicial Supabase"
```

---

## Task 3: Interfaz Repository + repos Supabase y memoria

**Files:**
- Create: `lib/db/types.ts`, `lib/db/repo.ts`, `lib/db/memory.ts`
- Test: `tests/db/memory.test.ts`

- [ ] **Step 1: Test del repo en memoria**

Create `tests/db/memory.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { memoryRepo } from "@/lib/db/memory";

type Row = { id?: string; n: number };

describe("memoryRepo", () => {
  it("upsert + list + get + remove", async () => {
    const r = memoryRepo<Row>("test");
    const a = await r.upsert({ id: "1", n: 1 });
    expect(a.id).toBe("1");
    await r.upsert({ id: "2", n: 2 });
    expect((await r.list()).length).toBe(2);
    expect((await r.get("1"))?.n).toBe(1);
    await r.remove("1");
    expect(await r.get("1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/db/memory.test.ts` → FAIL.

- [ ] **Step 3: Implementar tipos + repos**

Create `lib/db/types.ts`:
```ts
export interface Repository<T extends { id?: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(row: T): Promise<T>;
  remove(id: string): Promise<void>;
}
```

Create `lib/db/memory.ts`:
```ts
import type { Repository } from "./types";

// Fallback sin Supabase (dev). Store por tabla en globalThis para sobrevivir HMR.
const g = globalThis as unknown as { __memRepos?: Map<string, Map<string, unknown>> };
const repos = (g.__memRepos ??= new Map());

export function memoryRepo<T extends { id?: string }>(table: string): Repository<T> {
  const store = (repos.get(table) ?? repos.set(table, new Map()).get(table)) as Map<string, T>;
  return {
    async list() { return [...store.values()]; },
    async get(id) { return store.get(id); },
    async upsert(row) {
      const id = row.id ?? crypto.randomUUID();
      const saved = { ...row, id } as T;
      store.set(id, saved);
      return saved;
    },
    async remove(id) { store.delete(id); },
  };
}
```

Create `lib/db/repo.ts`:
```ts
import { getSupabase } from "./supabase";
import type { Repository } from "./types";

export function supabaseRepo<T extends { id?: string }>(table: string): Repository<T> {
  return {
    async list() {
      const { data, error } = await getSupabase().from(table).select("*");
      if (error) throw error;
      return (data ?? []) as T[];
    },
    async get(id) {
      const { data, error } = await getSupabase().from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? undefined) as T | undefined;
    },
    async upsert(row) {
      const { data, error } = await getSupabase().from(table).upsert(row).select().single();
      if (error) throw error;
      return data as T;
    },
    async remove(id) {
      const { error } = await getSupabase().from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 4: Verificar** → `npm test -- tests/db/memory.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/types.ts lib/db/repo.ts lib/db/memory.ts tests/db/memory.test.ts
git commit -m "feat(db): Repository + supabaseRepo + memoryRepo"
```

---

## Task 4: Decorador withMirror + cola de sync

**Files:**
- Create: `lib/db/mirror.ts`
- Test: `tests/db/mirror.test.ts`

- [ ] **Step 1: Test**

Create `tests/db/mirror.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { memoryRepo } from "@/lib/db/memory";

describe("withMirror", () => {
  it("encola tras upsert", async () => {
    const enqueue = vi.fn(async () => {});
    const { withMirror } = await import("@/lib/db/mirror");
    const base = memoryRepo<{ id?: string; n: number }>("m");
    const repo = withMirror(base, { entity: "m", enqueue });
    await repo.upsert({ id: "1", n: 1 });
    expect(enqueue).toHaveBeenCalledWith("m", "upsert", { id: "1", n: 1 });
  });
});
```

- [ ] **Step 2: Verificar que falla** → FAIL.

- [ ] **Step 3: Implementar**

Create `lib/db/mirror.ts`:
```ts
import { dbConfigured, getSupabase } from "./supabase";
import type { Repository } from "./types";

export async function enqueueSheetSync(entity: string, op: string, payload: unknown) {
  if (!dbConfigured()) return; // sin DB no hay espejo
  await getSupabase().from("sheets_sync_queue").insert({ entity, op, payload });
}

interface MirrorOpts<T> {
  entity: string;
  enqueue?: (entity: string, op: string, payload: T) => Promise<void>;
}

export function withMirror<T extends { id?: string }>(
  base: Repository<T>,
  opts: MirrorOpts<T>,
): Repository<T> {
  const enq = opts.enqueue ?? ((e, o, p) => enqueueSheetSync(e, o, p));
  return {
    list: base.list,
    get: base.get,
    async upsert(row) {
      const saved = await base.upsert(row);
      await enq(opts.entity, "upsert", saved);
      return saved;
    },
    async remove(id) {
      await base.remove(id);
      await enq(opts.entity, "remove", { id } as T);
    },
  };
}
```

- [ ] **Step 4: Verificar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/mirror.ts tests/db/mirror.test.ts
git commit -m "feat(db): withMirror + cola sheets_sync_queue"
```

---

## Task 5: Crypto AES-GCM (para config de conectores)

**Files:**
- Create: `lib/crypto.ts`
- Test: `tests/crypto.test.ts`

- [ ] **Step 1: Test**

Create `tests/crypto.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.CONFIG_MASTER_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
});

describe("crypto", () => {
  it("encrypt→decrypt round-trip", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/crypto");
    const obj = { token: "secreto", n: 1 };
    const enc = await encryptJson(obj);
    expect(typeof enc).toBe("string");
    expect(enc).not.toContain("secreto");
    expect(await decryptJson(enc)).toEqual(obj);
  });
});
```

- [ ] **Step 2: Verificar que falla** → FAIL.

- [ ] **Step 3: Implementar**

Create `lib/crypto.ts`:
```ts
// AES-GCM con CONFIG_MASTER_KEY (32 bytes base64). Para credenciales de conectores.
function keyBytes(): Uint8Array {
  const b64 = process.env.CONFIG_MASTER_KEY;
  if (!b64) throw new Error("CONFIG_MASTER_KEY ausente");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function importKey() {
  return crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(), data);
  return Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString("base64");
}

export async function decryptJson<T = unknown>(enc: string): Promise<T> {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await importKey(), ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
```

- [ ] **Step 4: Verificar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts tests/crypto.test.ts
git commit -m "feat: crypto AES-GCM para credenciales de conectores"
```

---

## Task 6: Export a Sheets + Cron que drena la cola

**Files:**
- Create: `lib/sheets-export.ts`, `app/api/cron/sheets-sync/route.ts`

- [ ] **Step 1: Writer de Sheets**

Create `lib/sheets-export.ts`:
```ts
import { google } from "googleapis";

// Mapea entidad → nombre de hoja en el Sheet de preservación.
const SHEET_BY_ENTITY: Record<string, string> = {
  padron: "padron", segmentos: "segmentos", templates: "templates",
  campanas: "campañas", envios: "envios", respuestas: "respuestas",
  opt_outs: "opt_outs", llamadas: "llamadas",
};

function sheetsClient() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  const credentials = JSON.parse(Buffer.from(keyB64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function canExportSheets(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.SHEETS_PRESERVATION_SHEET_ID);
}

// Append de una fila (op upsert) a la hoja de la entidad. Idempotencia simple:
// se appendea; la dedupe fina se hace al consolidar (fuera de alcance acá).
export async function appendRow(entity: string, payload: Record<string, unknown>) {
  const sheet = SHEET_BY_ENTITY[entity];
  if (!sheet) return;
  const values = [Object.values(payload).map((v) =>
    v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))];
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: process.env.SHEETS_PRESERVATION_SHEET_ID!,
    range: `${sheet}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}
```

- [ ] **Step 2: Cron route**

Create `app/api/cron/sheets-sync/route.ts`:
```ts
import { NextResponse } from "next/server";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { appendRow, canExportSheets } from "@/lib/sheets-export";

const BATCH = 50;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!dbConfigured() || !canExportSheets()) {
    return NextResponse.json({ skipped: "no db o no sheets" });
  }
  const db = getSupabase();
  const { data: rows } = await db.from("sheets_sync_queue")
    .select("*").eq("status", "pending").order("created_at").limit(BATCH);
  let done = 0, failed = 0;
  for (const row of rows ?? []) {
    try {
      if (row.op === "upsert") await appendRow(row.entity, row.payload);
      await db.from("sheets_sync_queue").update({ status: "done" }).eq("id", row.id);
      done++;
    } catch (e) {
      failed++;
      await db.from("sheets_sync_queue").update({
        status: "pending", attempts: (row.attempts ?? 0) + 1,
        last_error: (e as Error).message,
      }).eq("id", row.id);
      break; // backoff: cortar el batch ante el primer 429/error, reintenta al próximo tick
    }
  }
  return NextResponse.json({ done, failed });
}
```

- [ ] **Step 3: Cron en Vercel**

Modify `vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [{ "path": "/api/cron/sheets-sync", "schedule": "* * * * *" }]
}
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: compila; ruta `ƒ /api/cron/sheets-sync` listada.

- [ ] **Step 5: Commit**

```bash
git add lib/sheets-export.ts app/api/cron/sheets-sync/route.ts vercel.json
git commit -m "feat(db): export a Sheets + cron que drena la cola"
```

---

## Task 7: Padrón — repo, filtro y parser CSV

**Files:**
- Create: `lib/db/padron.ts`
- Modify: `lib/segments.ts` (`loadContacts`)
- Test: `tests/db/padron.test.ts`

- [ ] **Step 1: Test del parser CSV**

Create `tests/db/padron.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parsePadronCsv } from "@/lib/db/padron";

describe("parsePadronCsv", () => {
  it("mapea headers a Contact", () => {
    const csv = "dni,nombre,apellido,barrio\n123,Ana,Lopez,Centro\n456,Juan,Diaz,Norte";
    const rows = parsePadronCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ dni: "123", nombre: "Ana", barrio: "Centro" });
  });
});
```

- [ ] **Step 2: Verificar que falla** → FAIL.

- [ ] **Step 3: Implementar**

Create `lib/db/padron.ts`:
```ts
import { dbConfigured, getSupabase } from "./supabase";
import type { Contact } from "@/lib/connectors/types";

const COLS = ["dni","nombre","apellido","fecha_nac","sexo","domicilio","barrio","circuito","mesa","telefono","email"];

export function parsePadronCsv(csv: string): Contact[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { if (COLS.includes(h)) o[h] = (cells[i] ?? "").trim(); });
    return o as unknown as Contact;
  }).filter((c) => c.dni);
}

// Reemplaza el padrón cargado (upsert por dni en lotes).
export async function importPadron(rows: Contact[], source: string): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const db = getSupabase();
  const withSource = rows.map((r) => ({ ...r, source }));
  for (let i = 0; i < withSource.length; i += 500) {
    const { error } = await db.from("padron").upsert(withSource.slice(i, i + 500), { onConflict: "dni" });
    if (error) throw error;
  }
  return rows.length;
}

export async function readPadronFromDb(limit?: number): Promise<Contact[]> {
  if (!dbConfigured()) return [];
  let q = getSupabase().from("padron").select("*");
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function padronCount(): Promise<number> {
  if (!dbConfigured()) return 0;
  const { count } = await getSupabase().from("padron").select("*", { count: "exact", head: true });
  return count ?? 0;
}
```

- [ ] **Step 4: `loadContacts` lee de Supabase con fallback a mock**

Modify `lib/segments.ts` — reemplazar el cuerpo de `loadContacts`:
```ts
import { dbConfigured } from "@/lib/db/supabase";
import { readPadronFromDb } from "@/lib/db/padron";
import { mockPadron } from "@/lib/mock/padron";
// ...
export async function loadContacts(): Promise<ContactWithRelationship[]> {
  const contacts = dbConfigured() ? await readPadronFromDb() : mockPadron;
  return contacts.map((contact) => ({
    contact,
    rel: deriveRelationship(contact.dni, getRawRelationship(contact.dni)),
    edad: edadDe(contact.fecha_nac),
  }));
}
```
(Quitar el `import { googleSheetsConnector }` si queda sin uso.)

- [ ] **Step 5: Verificar + commit**

Run: `npm test -- tests/db/padron.test.ts` (PASS) y `npm run build` (compila).
```bash
git add lib/db/padron.ts lib/segments.ts tests/db/padron.test.ts
git commit -m "feat(db): padrón en Supabase + parser CSV + loadContacts desde DB"
```

---

## Task 8: UI de ingest del padrón (`/padron`)

**Files:**
- Create: `app/(dashboard)/padron/page.tsx`, `app/(dashboard)/padron/actions.ts`
- Modify: `app/(dashboard)/layout.tsx` (NAV += Padrón)

- [ ] **Step 1: Server action de import**

Create `app/(dashboard)/padron/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { importPadron, parsePadronCsv } from "@/lib/db/padron";

export async function importarCsv(formData: FormData) {
  const file = formData.get("csv");
  if (!(file instanceof File)) return;
  const text = await file.text();
  const rows = parsePadronCsv(text);
  if (rows.length) await importPadron(rows, "csv");
  revalidatePath("/padron");
}
```

- [ ] **Step 2: Página**

Create `app/(dashboard)/padron/page.tsx`:
```tsx
import { importarCsv } from "./actions";
import { dbConfigured } from "@/lib/db/supabase";
import { padronCount } from "@/lib/db/padron";

export const metadata = { title: "Padrón · Severo Tronador" };

export default async function PadronPage() {
  const count = dbConfigured() ? await padronCount() : 0;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Padrón</h1>
      {!dbConfigured() && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Supabase no configurado — usando padrón mock de dev. Cargá las env vars de Supabase para persistir el padrón real.
        </p>
      )}
      <p className="text-sm text-zinc-500">{count} contactos cargados.</p>
      <form action={importarCsv} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-medium">Importar CSV</div>
        <p className="text-xs text-zinc-500">Encabezados: dni, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email.</p>
        <input type="file" name="csv" accept=".csv" required className="text-sm" />
        <button type="submit" className="block rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Importar</button>
      </form>
      <p className="text-xs text-zinc-400">Conectar un Google Sheet como fuente: ver el conector Google Sheets en /conectores (se importa a la misma tabla).</p>
    </div>
  );
}
```

- [ ] **Step 3: NAV**

Modify `app/(dashboard)/layout.tsx`: agregar `{ href: "/padron", label: "Padrón" }` como primer item del `NAV`.

- [ ] **Step 4: Verificar build**

Run: `npm run build` → compila, ruta `ƒ /padron`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/padron" "app/(dashboard)/layout.tsx"
git commit -m "feat: pantalla de ingest del padrón (CSV)"
```

---

## Task 9: Migrar stores operativos a repos (manteniendo firmas)

Migrar de a un módulo. **Patrón**: el `globalThis` Map/Array se reemplaza por un repo (`withMirror(supabaseRepo(...))` para entidades preservables, `supabaseRepo`/`memoryRepo` para las no espejadas), eligiendo `memoryRepo` cuando `!dbConfigured()`. Las funciones exportadas (firma idéntica) pasan a `async` si no lo eran y delegan al repo.

> Helper común — Create `lib/db/index.ts`:
> ```ts
> import { dbConfigured } from "./supabase";
> import { supabaseRepo } from "./repo";
> import { memoryRepo } from "./memory";
> import { withMirror } from "./mirror";
> import type { Repository } from "./types";
> export function repo<T extends { id?: string }>(table: string, mirror = false): Repository<T> {
>   const base = dbConfigured() ? supabaseRepo<T>(table) : memoryRepo<T>(table);
>   return mirror && dbConfigured() ? withMirror(base, { entity: table }) : base;
> }
> ```

- [ ] **Step 1 — opt_outs** (`lib/optout.ts`): test + reemplazar el `Map` por `repo("opt_outs", true)`. Como `optOut`/`isOptedOut`/`listOptOuts` hoy son sync, pasan a async; actualizar los call-sites (`campaigns.ts`, `app/encuesta/[token]/actions.ts`). Test `tests/optout.test.ts`: dedupe (no pisa), `isOptedOut` true tras `optOut`. Commit.

- [ ] **Step 2 — survey** (`lib/survey.ts`): `survey_tokens` (sin mirror) + `respuestas` (con mirror). `createToken`/`resolveToken`/`addResponse`/`hasResponded`/`listResponses` → async. Actualizar call-sites (`campaigns.ts`, `app/encuesta/[token]/*`, `respuestas/page.tsx`, `analysis.ts`, `campanas/[id]/*`). Test: dedupe de respuesta por token. Commit.

- [ ] **Step 3 — quota** (`lib/quota.ts`): tabla `cuotas` (sin mirror). `getUsage`/`incrementUsage`/`resetUsage` → async. Actualizar todos los conectores outreach (`resend`, `meta-wa-cloud`, `telnyx-sms`, `telnyx-voice`, `claude-api`) y `layout.tsx`. Test: increment acumula. Commit.

- [ ] **Step 4 — templates** (`lib/templates.ts`): `templates` (con mirror) + seed si la tabla está vacía. `listTemplates`/`getTemplate`/`createTemplate` → async. Actualizar `templates/*`, `campanas/nueva/*`, `campaigns.ts`. Test: create + list. Commit.

- [ ] **Step 5 — calls** (`lib/calls.ts`): `llamadas` (con mirror). `addManualCall`/`listCallsFor` → async. Actualizar `contactos/[dni]/*`. Test. Commit.

- [ ] **Step 6 — campaigns** (`lib/campaigns.ts`): `campanas` + `envios` (con mirror). `listCampaigns`/`getCampaign`/`updateEnvioStatus`/`executeCampaign` ya async (salvo getters). `executeCampaign` persiste la campaña y cada envío. Actualizar `campanas/*`, webhook. Test: executeCampaign sobre mock crea filas. Commit.

> **Nota de cada step**: 1) escribir test del módulo (Vitest, con `memoryRepo` vía `dbConfigured()` falso), 2) verlo fallar, 3) migrar el módulo + call-sites, 4) `npm test` del módulo + `npm run build`, 5) commit. Mantener la firma pública salvo el cambio sync→async, que se propaga con `await`.

---

## Task 10: Env, degradación y docs

**Files:**
- Modify: `.env.example`, `docs/INTEGRATIONS.md`, `docs/STABILIZATION.md`

- [ ] **Step 1: .env.example** — agregar bloque:
```env
# ── Persistencia (Supabase) ───────────────────────────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CONFIG_MASTER_KEY=               # base64 de 32 bytes (openssl rand -base64 32)
SHEETS_PRESERVATION_SHEET_ID=    # Sheet destino del espejo de preservación
# CRON_SECRET ya existe arriba
```

- [ ] **Step 2: INTEGRATIONS.md** — sección "Supabase (persistencia)": crear proyecto en supabase.com, copiar `Project URL` y `service_role key` (Settings → API), correr `supabase/migrations/0001_init.sql` en el SQL Editor, generar `CONFIG_MASTER_KEY`, crear el Sheet de preservación con las 8 hojas. Links: https://supabase.com/dashboard, https://supabase.com/docs.

- [ ] **Step 3: STABILIZATION.md** — marcar P0.1 (persistencia) como resuelto por este plan; dejar P0.4 (cola de **envíos**) pendiente.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/INTEGRATIONS.md docs/STABILIZATION.md
git commit -m "docs: Supabase env + guía de setup + estado de estabilización"
```

---

## Task 11: Verificación final

- [ ] **Step 1:** `npm test` → todos los tests PASS.
- [ ] **Step 2:** `npm run build` → verde, rutas nuevas (`/padron`, `/api/cron/sheets-sync`) listadas.
- [ ] **Step 3: Smoke sin Supabase** (modo dev/mock): `npm run dev`, verificar que `/segmentos`, `/campanas`, `/escucha` siguen funcionando contra memoria (fallback) y `/padron` muestra el aviso "Supabase no configurado".
- [ ] **Step 4: Smoke con Supabase** (si hay credenciales de prueba): setear env, importar un CSV en `/padron`, verificar filas en la tabla `padron` y que una campaña crea filas en `envios` + `sheets_sync_queue`.
- [ ] **Step 5: Commit final / merge.**

---

## Self-review (cobertura del spec)

- Arquitectura Supabase+mirror → Tasks 1,3,4,6 ✓
- Esquema (espejadas vs solo-Supabase) → Task 2 ✓
- Ingest del padrón por el usuario → Tasks 7,8 ✓
- Repos `Repository`+`withMirror` → Tasks 3,4 ✓
- Encriptación de config → Task 5 ✓ (uso real en spec #1, fuera de este plan)
- Cola write-behind + cron + backoff → Tasks 4,6 ✓
- Fallback a memoria sin Supabase → Tasks 3,7,9 (helper `repo()`), Task 11 smoke ✓
- Migración de stores manteniendo firmas → Task 9 ✓
- Env nuevas → Task 10 ✓
- Enganches #1/#2 (`conector_config`, `listening_config`) → tablas creadas en Task 2; UI/uso en specs aparte ✓

**Nota de alcance:** la dedupe fina al consolidar en Sheets (append vs upsert por clave) queda como mejora; el cron hace append idempotente a nivel de cola (`status`), suficiente para la primera versión.
