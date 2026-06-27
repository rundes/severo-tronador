# Cerrar bucle 2 vías (WhatsApp · SMS · Telegram) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingerir mensajes entrantes de WhatsApp/SMS/Telegram, asociarlos al contacto y (cuando hay encuesta activa) persistirlos como respuesta, vía un resolver único + tabla cruda, a costo $0 incremental.

**Architecture:** Una columna de ingesta: webhooks finos parsean su payload y llaman `ingestInbound(...)` (`lib/inbound.ts`), la única pieza con lógica de identidad/contexto/opt-out/persistencia. Todo entrante aterriza en la tabla nueva `inbound_messages` (idempotente); cuando se resuelve contacto + token de encuesta activa, se deriva una fila en `respuestas` reusando `addResponse`. Sin UI nueva.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript estricto, Supabase (Postgres, service-role, RLS deny-all) con fallback `memoryRepo` en globalThis, Vitest (node env, tests en `tests/**`).

## Global Constraints

- Costo $0 incremental: solo Supabase + free-tier de los canales. No agregar servicios pagos.
- Voz/IVR fuera de alcance (stub + pago).
- Solo mensajes entrantes `type=text` (media/interactive fuera de alcance).
- Las firmas de webhook ya validadas (HMAC-SHA256 / Ed25519 / secret token) **no se tocan**.
- Single-tenant operativo: proyecto se resuelve por `projectId` provisto o `DEFAULT_PROJECT_ID` (el lookup receptor→`conector_config` es YAGNI hoy; ver Task 5 nota).
- Idempotencia obligatoria por `(channel, provider_message_id)`.
- Opt-out permanente y cross-canal (regla `lib/optout.ts`), con prioridad sobre guardar respuesta.
- Tablas nuevas: RLS deny-all, acceso por cliente service-role. Sin mirror a Sheets.
- TDD estricto: test que falla → mínima implementación → test pasa → commit. Patrón de test del repo: `vi.resetModules()` en `beforeEach`, `vi.doMock(...)` antes del `await import(...)` dinámico.
- Convención de migración: archivo `supabase/migrations/0049_*.sql` (la última es `0048_perf_indexes.sql`).

---

## File Structure

- **Create** `supabase/migrations/0049_inbound_messages.sql` — tabla cruda de ingesta.
- **Create** `lib/inbound-store.ts` — persistencia de `inbound_messages` (memory + DB), idempotencia.
- **Create** `lib/inbound.ts` — resolver: `normalizePhone`, `detectOptOut`, `resolveContactByPhone`, `ingestInbound`.
- **Create** `tests/inbound-store.test.ts`, `tests/inbound-phone.test.ts`, `tests/inbound-optout.test.ts`, `tests/inbound.test.ts`.
- **Create** `tests/webhook-meta-inbound.test.ts`, `tests/webhook-telnyx-inbound.test.ts`, `tests/webhook-telegram-inbound.test.ts`.
- **Modify** `lib/campaigns.ts` — añadir `latestSurveyTokenForDni(...)`.
- **Modify** `app/api/webhooks/meta/route.ts` — parsear `messages[]`.
- **Modify** `app/api/webhooks/telnyx/route.ts` — rama `message.received`.
- **Modify** `app/api/webhooks/telegram/route.ts` — reemplazar bloque log por `ingestInbound`.
- **Modify** `PLAN.md` — corregir el claim F4 de WhatsApp.

---

## Task 1: Tabla `inbound_messages` + store con idempotencia

**Files:**
- Create: `supabase/migrations/0049_inbound_messages.sql`
- Create: `lib/inbound-store.ts`
- Test: `tests/inbound-store.test.ts`

**Interfaces:**
- Consumes: `dbConfigured`, `getSupabase` (`lib/db/supabase.ts`); `memoryRepo` (`lib/db/memory.ts`).
- Produces:
  - `interface InboundRow { id?: string; project_id: string | null; channel: string; sender_external_id: string; dni: string | null; body: string; provider_message_id: string | null; campaign_id: string | null; respuesta_token: string | null; is_opt_out: boolean; raw: unknown | null; }`
  - `recordInbound(row: InboundRow): Promise<{ inserted: boolean }>`
  - `inboundExists(channel: string, providerMessageId: string): Promise<boolean>`

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0049_inbound_messages.sql`:

```sql
-- Mensajes entrantes de canales conversacionales (WhatsApp/SMS/Telegram).
-- Zona de aterrizaje cruda: SIEMPRE se inserta el entrante (matchee o no).
-- Las respuestas derivadas viven en `respuestas`; esta tabla es la espina
-- para la bandeja unificada y la encuesta conversacional futuras.
create table if not exists inbound_messages (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid,
  channel             text not null,
  sender_external_id  text not null,
  dni                 text,
  body                text not null,
  provider_message_id text,
  envio_id            text,
  campaign_id         text,
  respuesta_token     text,
  is_opt_out          boolean not null default false,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  raw                 jsonb
);

-- Idempotencia ante reintentos del proveedor.
create unique index if not exists inbound_messages_provider_uq
  on inbound_messages (channel, provider_message_id)
  where provider_message_id is not null;

-- Lectura para la bandeja futura (por contacto, recientes primero).
create index if not exists inbound_messages_project_dni_idx
  on inbound_messages (project_id, dni, received_at desc);

-- RLS deny-all: acceso solo por service-role (igual que el resto del modelo).
alter table inbound_messages enable row level security;
```

- [ ] **Step 2: Escribir el test que falla**

Create `tests/inbound-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";

// Sin SUPABASE_* en env → dbConfigured()=false → store en memoria.
beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("inbound_messages");
});

const base = {
  project_id: "proj-1",
  channel: "whatsapp",
  sender_external_id: "5491122223333",
  dni: "30111222",
  body: "hola",
  provider_message_id: "wamid.X",
  campaign_id: null,
  respuesta_token: null,
  is_opt_out: false,
  raw: null,
} as const;

describe("inbound-store (memoria)", () => {
  it("inserta una fila nueva", async () => {
    const { recordInbound } = await import("@/lib/inbound-store");
    const r = await recordInbound({ ...base });
    expect(r.inserted).toBe(true);
  });

  it("es idempotente por (channel, provider_message_id)", async () => {
    const { recordInbound, inboundExists } = await import("@/lib/inbound-store");
    await recordInbound({ ...base });
    expect(await inboundExists("whatsapp", "wamid.X")).toBe(true);
    const dup = await recordInbound({ ...base });
    expect(dup.inserted).toBe(false);
  });

  it("inboundExists devuelve false para id desconocido", async () => {
    const { inboundExists } = await import("@/lib/inbound-store");
    expect(await inboundExists("sms", "nope")).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npm test -- tests/inbound-store.test.ts`
Expected: FAIL — `Cannot find module '@/lib/inbound-store'`.

- [ ] **Step 4: Implementar `lib/inbound-store.ts`**

```ts
// Persistencia de mensajes entrantes (inbound_messages). Memory + DB.
// Idempotencia por (channel, provider_message_id): un reintento del proveedor
// no duplica la fila ni la respuesta derivada.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";

export interface InboundRow {
  id?: string;
  project_id: string | null;
  channel: string;
  sender_external_id: string;
  dni: string | null;
  body: string;
  provider_message_id: string | null;
  campaign_id: string | null;
  respuesta_token: string | null;
  is_opt_out: boolean;
  raw: unknown | null;
}

const mem = () => memoryRepo<InboundRow & { id?: string }>("inbound_messages");

export async function inboundExists(
  channel: string,
  providerMessageId: string,
): Promise<boolean> {
  if (!dbConfigured()) {
    const all = await mem().list();
    return all.some(
      (r) => r.channel === channel && r.provider_message_id === providerMessageId,
    );
  }
  const { data } = await getSupabase()
    .from("inbound_messages")
    .select("id")
    .eq("channel", channel)
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  return Boolean(data);
}

export async function recordInbound(
  row: InboundRow,
): Promise<{ inserted: boolean }> {
  // Idempotencia: si ya existe por (channel, provider_message_id) → no-op.
  if (row.provider_message_id) {
    if (await inboundExists(row.channel, row.provider_message_id)) {
      return { inserted: false };
    }
  }
  if (!dbConfigured()) {
    await mem().upsert({ ...row, id: undefined });
    return { inserted: true };
  }
  const { error } = await getSupabase()
    .from("inbound_messages")
    .insert({ ...row, processed_at: new Date().toISOString() });
  if (error) {
    // 23505 = unique_violation (carrera entre reintentos): tratamos como no-op.
    if ((error as { code?: string }).code === "23505") return { inserted: false };
    throw error;
  }
  return { inserted: true };
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm test -- tests/inbound-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0049_inbound_messages.sql lib/inbound-store.ts tests/inbound-store.test.ts
git commit -m "feat(inbound): tabla inbound_messages + store idempotente"
```

---

## Task 2: `normalizePhone` (helper puro)

**Files:**
- Create: `lib/inbound.ts` (solo `normalizePhone` en este task)
- Test: `tests/inbound-phone.test.ts`

**Interfaces:**
- Produces: `normalizePhone(raw: string | null | undefined): string | null` — devuelve dígitos E.164 sin `+` con prefijo país AR (`54`) forzado si falta; `null` si no hay dígitos válidos.

- [ ] **Step 1: Escribir el test que falla**

Create `tests/inbound-phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/inbound";

describe("normalizePhone", () => {
  it("ya en E.164 con +54", () => {
    expect(normalizePhone("+5491122223333")).toBe("5491122223333");
  });
  it("limpia espacios y guiones", () => {
    expect(normalizePhone("+54 911 2222-3333")).toBe("5491122223333");
  });
  it("agrega prefijo país AR si falta (número local de 10)", () => {
    expect(normalizePhone("1122223333")).toBe("541122223333");
  });
  it("número que ya empieza con 54 no se duplica", () => {
    expect(normalizePhone("541122223333")).toBe("541122223333");
  });
  it("devuelve null si no hay dígitos", () => {
    expect(normalizePhone("---")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/inbound-phone.test.ts`
Expected: FAIL — `Cannot find module '@/lib/inbound'`.

- [ ] **Step 3: Implementar `normalizePhone` en `lib/inbound.ts`**

Create `lib/inbound.ts` con:

```ts
// Resolver de mensajes entrantes (WhatsApp/SMS/Telegram). Ver
// docs/superpowers/specs/2026-06-27-inbound-2vias-design.md.

// Normaliza un teléfono a dígitos E.164 sin `+`, forzando prefijo país AR (54)
// si falta. Sirve para comparar el remitente entrante contra padron.telefono
// (cuyo formato puede variar). Devuelve null si no hay dígitos.
const AR_CC = "54";

export function normalizePhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Si ya trae el código de país AR, se respeta. Si es un número local
  // (sin 54), se antepone. No intenta resolver otros países (MVP AR).
  if (digits.startsWith(AR_CC) && digits.length >= 11) return digits;
  return AR_CC + digits;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/inbound-phone.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/inbound.ts tests/inbound-phone.test.ts
git commit -m "feat(inbound): normalizePhone para match de remitente"
```

---

## Task 3: `detectOptOut` (helper puro)

**Files:**
- Modify: `lib/inbound.ts`
- Test: `tests/inbound-optout.test.ts`

**Interfaces:**
- Produces: `detectOptOut(body: string): string | null` — devuelve la keyword detectada (mayúsculas) o `null`. Keywords: `BAJA`, `STOP`, `CANCELAR`, `BAJA TOTAL`. Match exacto sobre el texto trim+upper (no substring, para no confundir "no me des de baja" con baja).

- [ ] **Step 1: Escribir el test que falla**

Create `tests/inbound-optout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectOptOut } from "@/lib/inbound";

describe("detectOptOut", () => {
  it("detecta keywords exactas (case/space-insensitive)", () => {
    expect(detectOptOut("BAJA")).toBe("BAJA");
    expect(detectOptOut(" stop ")).toBe("STOP");
    expect(detectOptOut("Cancelar")).toBe("CANCELAR");
    expect(detectOptOut("baja total")).toBe("BAJA TOTAL");
  });
  it("no matchea frases que contienen la palabra", () => {
    expect(detectOptOut("no me des de baja por favor")).toBeNull();
    expect(detectOptOut("quiero parar esto")).toBeNull();
  });
  it("texto normal → null", () => {
    expect(detectOptOut("me preocupa la inseguridad")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/inbound-optout.test.ts`
Expected: FAIL — `detectOptOut is not a function`.

- [ ] **Step 3: Implementar `detectOptOut` en `lib/inbound.ts`**

Agregar a `lib/inbound.ts`:

```ts
// Keywords de baja (opt-out). Match EXACTO sobre el mensaje trim+upper para no
// confundir "no me des de baja" con una baja. Configurable acá.
const OPT_OUT_KEYWORDS = ["BAJA TOTAL", "BAJA", "STOP", "CANCELAR"] as const;

export function detectOptOut(body: string): string | null {
  const norm = (body ?? "").trim().toUpperCase();
  for (const kw of OPT_OUT_KEYWORDS) {
    if (norm === kw) return kw;
  }
  return null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/inbound-optout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/inbound.ts tests/inbound-optout.test.ts
git commit -m "feat(inbound): detectOptOut por keyword exacta"
```

---

## Task 4: `latestSurveyTokenForDni` (lectura de envíos)

**Files:**
- Modify: `lib/campaigns.ts` (añadir export al final, antes de cualquier export default si lo hubiera)
- Test: `tests/campaigns-survey-token.test.ts` (Create)

**Interfaces:**
- Consumes: `dbConfigured`, `getSupabase` (ya importados en `campaigns.ts`).
- Produces: `latestSurveyTokenForDni(projectId: string, dni: string, sinceIso: string): Promise<{ token: string; campaignId: string } | null>` — el envío `sent` con token más reciente para ese dni dentro de `[sinceIso, now]`, o `null`.

> Nota de diseño: la tabla `envios` no tiene columna `channel` (el canal vive en la campaña). Para "captura simple" tomamos el último envío con token del contacto dentro de la ventana, sin discriminar canal. Refinamiento futuro: join con `campanas.channel`. Documentado como tradeoff aceptado del MVP.

- [ ] **Step 1: Escribir el test que falla**

Create `tests/campaigns-survey-token.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub mínimo del query-builder de supabase-js encadenable.
function makeSupabaseStub(row: unknown) {
  const qb: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not", "gte", "order", "limit"]) {
    qb[m] = vi.fn(() => qb);
  }
  qb.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return qb;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  vi.resetModules();
});

describe("latestSurveyTokenForDni", () => {
  it("devuelve token + campaignId del envío más reciente", async () => {
    const stub = makeSupabaseStub({ token: "tok-1", campaign_id: "camp-1" });
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => true,
      getSupabase: () => stub,
    }));
    const { latestSurveyTokenForDni } = await import("@/lib/campaigns");
    const r = await latestSurveyTokenForDni("proj-1", "30111222", "2026-06-01T00:00:00Z");
    expect(r).toEqual({ token: "tok-1", campaignId: "camp-1" });
  });

  it("devuelve null si no hay envío con token", async () => {
    const stub = makeSupabaseStub(null);
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => true,
      getSupabase: () => stub,
    }));
    const { latestSurveyTokenForDni } = await import("@/lib/campaigns");
    const r = await latestSurveyTokenForDni("proj-1", "30111222", "2026-06-01T00:00:00Z");
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/campaigns-survey-token.test.ts`
Expected: FAIL — `latestSurveyTokenForDni is not a function`.

- [ ] **Step 3: Implementar en `lib/campaigns.ts`**

Agregar (cerca de `updateEnvioStatus`, que ya usa la tabla `envios`):

```ts
// Token de la encuesta activa más reciente para un contacto, mirando `envios`.
// Lo usa el resolver de entrantes (lib/inbound.ts) para asociar un reply al
// contexto correcto. `envios` no guarda canal → tomamos el último con token
// dentro de la ventana, sin discriminar canal (tradeoff MVP, ver plan Task 4).
export async function latestSurveyTokenForDni(
  projectId: string,
  dni: string,
  sinceIso: string,
): Promise<{ token: string; campaignId: string } | null> {
  if (!dbConfigured()) return null;
  const { data } = await getSupabase()
    .from("envios")
    .select("token, campaign_id, created_at")
    .eq("project_id", projectId)
    .eq("dni", dni)
    .eq("estado", "sent")
    .not("token", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !(data as { token?: string }).token) return null;
  return {
    token: (data as { token: string }).token,
    campaignId: (data as { campaign_id: string }).campaign_id,
  };
}
```

> Verificá que `dbConfigured` y `getSupabase` ya estén importados en `campaigns.ts` (lo están: los usa `updateEnvioStatus`). Si no, agregá `import { dbConfigured, getSupabase } from "@/lib/db/supabase";`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/campaigns-survey-token.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/campaigns.ts tests/campaigns-survey-token.test.ts
git commit -m "feat(inbound): latestSurveyTokenForDni para asociar reply a encuesta"
```

---

## Task 5: `resolveContactByPhone` + `ingestInbound` (orquestación)

**Files:**
- Modify: `lib/inbound.ts`
- Test: `tests/inbound.test.ts` (Create)

**Interfaces:**
- Consumes: `normalizePhone`, `detectOptOut` (Task 2/3); `recordInbound`, `inboundExists` (Task 1); `latestSurveyTokenForDni` (`lib/campaigns.ts`, Task 4); `readPadronFromDb` (`lib/db/padron.ts`); `addResponse` (`lib/survey.ts`); `optOut` (`lib/optout.ts`); `DEFAULT_PROJECT_ID` (`lib/projects.ts`).
- Produces:
  - `resolveContactByPhone(projectId: string, phone: string): Promise<string | null>` — dni o null.
  - `interface InboundInput { channel: "whatsapp" | "sms" | "telegram"; senderExternalId: string; body: string; providerMessageId?: string; projectId?: string; dni?: string; raw?: unknown; }`
  - `interface InboundResult { stored: boolean; dni: string | null; optOut: boolean; responseToken: string | null; }`
  - `ingestInbound(input: InboundInput): Promise<InboundResult>`
  - `WINDOW_HOURS: number` (= 72)

> Nota multi-tenant (YAGNI): hoy el sistema es single-tenant (`lib/db/supabase.ts` lo declara). El proyecto se toma de `input.projectId` (Telegram lo pasa) o `DEFAULT_PROJECT_ID`. El lookup receptor→`conector_config` no se implementa: no hay segundo proyecto que lo necesite. Queda como puerta abierta documentada.

- [ ] **Step 1: Escribir el test que falla**

Create `tests/inbound.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("inbound_messages");
  vi.resetModules();
});

function mockDeps(opts: {
  contacts?: { dni: string; telefono: string }[];
  token?: { token: string; campaignId: string } | null;
  addResponseImpl?: (...a: unknown[]) => unknown;
}) {
  vi.doMock("@/lib/db/padron", () => ({
    readPadronFromDb: vi.fn(async () => opts.contacts ?? []),
  }));
  vi.doMock("@/lib/campaigns", () => ({
    latestSurveyTokenForDni: vi.fn(async () => opts.token ?? null),
  }));
  const addResponse = vi.fn(opts.addResponseImpl ?? (async () => ({ id: "r1" })));
  vi.doMock("@/lib/survey", () => ({ addResponse }));
  const optOut = vi.fn(async () => ({ dni: "x" }));
  vi.doMock("@/lib/optout", () => ({ optOut }));
  return { addResponse, optOut };
}

describe("ingestInbound", () => {
  it("WhatsApp: matchea contacto por teléfono y guarda respuesta", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "+54 911 2222-3333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp",
      senderExternalId: "5491122223333",
      body: "me preocupa la inseguridad",
      providerMessageId: "wamid.1",
    });
    expect(res).toMatchObject({ stored: true, dni: "30111222", optOut: false, responseToken: "tok-1" });
    expect(addResponse).toHaveBeenCalledWith("tok-1", [
      { pregunta: "(vía whatsapp)", respuesta: "me preocupa la inseguridad" },
    ]);
  });

  it("opt-out por keyword: marca baja y NO guarda respuesta", async () => {
    const { addResponse, optOut } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "sms", senderExternalId: "5491122223333", body: "BAJA",
      providerMessageId: "tx-1",
    });
    expect(res.optOut).toBe(true);
    expect(res.responseToken).toBeNull();
    expect(optOut).toHaveBeenCalled();
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("remitente desconocido: guarda crudo con dni null, sin respuesta", async () => {
    const { addResponse } = mockDeps({ contacts: [], token: null });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp", senderExternalId: "5490000000000", body: "hola",
      providerMessageId: "wamid.2",
    });
    expect(res).toMatchObject({ stored: true, dni: null, responseToken: null });
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("sin encuesta activa en ventana: guarda crudo sin respuesta", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: null,
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp", senderExternalId: "5491122223333", body: "hola",
      providerMessageId: "wamid.3",
    });
    expect(res.dni).toBe("30111222");
    expect(res.responseToken).toBeNull();
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("Telegram: usa dni/projectId provistos, no resuelve por teléfono", async () => {
    const { addResponse } = mockDeps({
      contacts: [], token: { token: "tok-9", campaignId: "camp-9" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "telegram", senderExternalId: "987654", body: "ok",
      providerMessageId: "tg-1", dni: "40555666", projectId: "proj-2",
    });
    expect(res.dni).toBe("40555666");
    expect(addResponse).toHaveBeenCalledWith("tok-9", [
      { pregunta: "(vía telegram)", respuesta: "ok" },
    ]);
  });

  it("idempotencia: mismo provider_message_id no duplica ni reprocesa", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const input = {
      channel: "whatsapp" as const, senderExternalId: "5491122223333",
      body: "hola", providerMessageId: "wamid.dup",
    };
    const first = await ingestInbound(input);
    expect(first.stored).toBe(true);
    const second = await ingestInbound(input);
    expect(second.stored).toBe(false);
    expect(addResponse).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/inbound.test.ts`
Expected: FAIL — `ingestInbound is not a function`.

- [ ] **Step 3: Implementar `resolveContactByPhone` + `ingestInbound`**

Agregar a `lib/inbound.ts` (imports al tope del archivo, funciones al final):

```ts
import { readPadronFromDb } from "@/lib/db/padron";
import { latestSurveyTokenForDni } from "@/lib/campaigns";
import { addResponse } from "@/lib/survey";
import { optOut as optOutContact } from "@/lib/optout";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { recordInbound, inboundExists } from "@/lib/inbound-store";

export const WINDOW_HOURS = 72;

// Resuelve dni por teléfono: normaliza ambos lados y compara. Trae el padrón
// del proyecto (inbound de bajo volumen → aceptable). Devuelve null sin match.
export async function resolveContactByPhone(
  projectId: string,
  phone: string,
): Promise<string | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const contacts = await readPadronFromDb(projectId);
  const hit = contacts.find(
    (c) => normalizePhone((c as { telefono?: string }).telefono) === target,
  );
  return hit ? (hit as { dni: string }).dni : null;
}

export interface InboundInput {
  channel: "whatsapp" | "sms" | "telegram";
  senderExternalId: string;
  body: string;
  providerMessageId?: string;
  projectId?: string;
  dni?: string;
  raw?: unknown;
}

export interface InboundResult {
  stored: boolean;
  dni: string | null;
  optOut: boolean;
  responseToken: string | null;
}

export async function ingestInbound(
  input: InboundInput,
): Promise<InboundResult> {
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  const body = (input.body ?? "").trim();

  // Idempotencia: reintento del proveedor → no reprocesar.
  if (
    input.providerMessageId &&
    (await inboundExists(input.channel, input.providerMessageId))
  ) {
    return { stored: false, dni: input.dni ?? null, optOut: false, responseToken: null };
  }

  // Identidad: Telegram trae dni resuelto; teléfono se resuelve por padrón.
  let dni = input.dni ?? null;
  if (!dni && input.channel !== "telegram") {
    dni = await resolveContactByPhone(projectId, input.senderExternalId);
  }

  // Opt-out: prioridad sobre guardar respuesta.
  const keyword = detectOptOut(body);
  let optedOut = false;
  if (keyword && dni) {
    await optOutContact(projectId, dni, `${input.channel} ${keyword.toLowerCase()}`);
    optedOut = true;
  }

  // Contexto + respuesta derivada.
  let responseToken: string | null = null;
  let campaignId: string | null = null;
  if (dni && !optedOut) {
    const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
    const ref = await latestSurveyTokenForDni(projectId, dni, since);
    if (ref) {
      const saved = await addResponse(ref.token, [
        { pregunta: `(vía ${input.channel})`, respuesta: body },
      ]);
      if (saved) {
        responseToken = ref.token;
        campaignId = ref.campaignId;
      }
    }
  }

  // Persistir crudo SIEMPRE (idempotente).
  const { inserted } = await recordInbound({
    project_id: projectId,
    channel: input.channel,
    sender_external_id: input.senderExternalId,
    dni,
    body,
    provider_message_id: input.providerMessageId ?? null,
    campaign_id: campaignId,
    respuesta_token: responseToken,
    is_opt_out: optedOut,
    raw: input.raw ?? null,
  });

  return { stored: inserted, dni, optOut: optedOut, responseToken };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/inbound.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `lib/inbound.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/inbound.ts tests/inbound.test.ts
git commit -m "feat(inbound): resolver ingestInbound (identidad+contexto+opt-out+persistencia)"
```

---

## Task 6: Cablear webhook WhatsApp (Meta)

**Files:**
- Modify: `app/api/webhooks/meta/route.ts`
- Test: `tests/webhook-meta-inbound.test.ts` (Create)

**Interfaces:**
- Consumes: `ingestInbound` (`lib/inbound.ts`).

- [ ] **Step 1: Escribir el test que falla**

Create `tests/webhook-meta-inbound.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "secret-test-123";
function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

beforeEach(() => {
  process.env.META_WA_APP_SECRET = SECRET;
  vi.resetModules();
});

describe("webhook Meta — inbound messages", () => {
  it("parsea messages[] y llama ingestInbound", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "30111222", optOut: false, responseToken: "tok-1",
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "PN1" },
            messages: [{ id: "wamid.1", from: "5491122223333", type: "text", text: { body: "hola" } }],
          },
        }],
      }],
    });
    const res = await POST(new Request("http://x", {
      method: "POST", headers: { "x-hub-signature-256": sign(body) }, body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "whatsapp", senderExternalId: "5491122223333",
      body: "hola", providerMessageId: "wamid.1",
    }));
  });

  it("ignora messages que no son type=text", async () => {
    const ingestInbound = vi.fn();
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.2", from: "549...", type: "image" }] } }] }],
    });
    const res = await POST(new Request("http://x", {
      method: "POST", headers: { "x-hub-signature-256": sign(body) }, body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/webhook-meta-inbound.test.ts`
Expected: FAIL — `ingestInbound` no es llamado (el handler aún solo procesa statuses).

- [ ] **Step 3: Modificar `app/api/webhooks/meta/route.ts`**

Extender la interfaz y el loop. Cambiar la interfaz `MetaWebhookBody`:

```ts
interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: { id?: string; status?: string }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}
```

Agregar el import al tope:

```ts
import { ingestInbound } from "@/lib/inbound";
```

Dentro del loop `for (const change of entry.changes ?? [])`, después del loop de `statuses`, agregar:

```ts
      for (const m of change.value?.messages ?? []) {
        if (m.type !== "text" || !m.from || !m.text?.body) continue;
        await ingestInbound({
          channel: "whatsapp",
          senderExternalId: m.from,
          body: m.text.body,
          providerMessageId: m.id,
          raw: m,
        });
      }
```

(El `updated` y la respuesta JSON quedan igual; los statuses se siguen procesando.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/webhook-meta-inbound.test.ts tests/webhook-meta.test.ts`
Expected: PASS (los 2 nuevos + los existentes de meta siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/meta/route.ts tests/webhook-meta-inbound.test.ts
git commit -m "feat(inbound): webhook WhatsApp parsea messages[] entrantes"
```

---

## Task 7: Cablear webhook SMS (Telnyx)

**Files:**
- Modify: `app/api/webhooks/telnyx/route.ts`
- Test: `tests/webhook-telnyx-inbound.test.ts` (Create)

**Interfaces:**
- Consumes: `ingestInbound` (`lib/inbound.ts`).

- [ ] **Step 1: Escribir el test que falla**

Create `tests/webhook-telnyx-inbound.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// La firma Ed25519 se mockea: verificamos el ruteo, no la cripto (ya cubierta).
beforeEach(() => {
  process.env.TELNYX_PUBLIC_KEY = "k";
  vi.resetModules();
});

describe("webhook Telnyx — inbound SMS", () => {
  it("rama message.received llama ingestInbound", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "30111222", optOut: false, responseToken: null,
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    vi.doMock("@/lib/crypto", () => ({ verifyTelnyxSignature: () => true }));
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({
      data: {
        event_type: "message.received",
        payload: {
          id: "tx-1",
          from: { phone_number: "+5491122223333" },
          to: [{ phone_number: "+5491100000000" }],
          text: "me preocupa el transporte",
        },
      },
    });
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "telnyx-signature-ed25519": "s", "telnyx-timestamp": "1" },
      body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "sms", senderExternalId: "+5491122223333",
      body: "me preocupa el transporte", providerMessageId: "tx-1",
    }));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/webhook-telnyx-inbound.test.ts`
Expected: FAIL — `ingestInbound` no es llamado.

- [ ] **Step 3: Modificar `app/api/webhooks/telnyx/route.ts`**

Extender la interfaz `TelnyxWebhookBody`:

```ts
interface TelnyxWebhookBody {
  data?: {
    event_type?: string;
    payload?: {
      id?: string;
      to?: { status?: string; phone_number?: string }[];
      from?: { phone_number?: string };
      text?: string;
    };
  };
}
```

Agregar import:

```ts
import { ingestInbound } from "@/lib/inbound";
```

Después del bloque que procesa status (antes del `log.info(... processed ...)`), agregar:

```ts
  if (body.data?.event_type === "message.received" && payload?.from?.phone_number) {
    await ingestInbound({
      channel: "sms",
      senderExternalId: payload.from.phone_number,
      body: payload.text ?? "",
      providerMessageId: payload.id,
      raw: payload,
    });
  }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/webhook-telnyx-inbound.test.ts tests/webhook-telnyx.test.ts`
Expected: PASS (nuevo + existentes verdes).

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/telnyx/route.ts tests/webhook-telnyx-inbound.test.ts
git commit -m "feat(inbound): webhook Telnyx ingiere SMS entrante (message.received)"
```

---

## Task 8: Cablear webhook Telegram

**Files:**
- Modify: `app/api/webhooks/telegram/route.ts`
- Test: `tests/webhook-telegram-inbound.test.ts` (Create)

**Interfaces:**
- Consumes: `ingestInbound` (`lib/inbound.ts`).

- [ ] **Step 1: Escribir el test que falla**

Create `tests/webhook-telegram-inbound.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = "tg-secret";
beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __telegramChats?: Map<string, unknown> };
  g.__telegramChats = new Map([
    ["proj-1:40555666", { dni: "40555666", chat_id: 987654, project_id: "proj-1" }],
  ]);
  vi.resetModules();
});

describe("webhook Telegram — texto libre", () => {
  it("rutea free-text a ingestInbound con dni del chat", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "40555666", optOut: false, responseToken: "tok-1",
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    const { POST } = await import("@/app/api/webhooks/telegram/route");
    const update = {
      message: { message_id: 55, chat: { id: 987654 }, from: { id: 987654 }, text: "me preocupa la salud" },
    };
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET, "content-type": "application/json" },
      body: JSON.stringify(update),
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "telegram", senderExternalId: "987654",
      body: "me preocupa la salud", providerMessageId: "55",
      dni: "40555666", projectId: "proj-1",
    }));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/webhook-telegram-inbound.test.ts`
Expected: FAIL — `ingestInbound` no es llamado (hoy solo loguea).

- [ ] **Step 3: Modificar `app/api/webhooks/telegram/route.ts`**

Agregar import:

```ts
import { ingestInbound } from "@/lib/inbound";
```

Reemplazar el bloque "Texto libre → guardar..." (líneas ~96-109, desde `const chat = await findChatByChatId(chatId);` hasta el `return ... "message_logged" ...`) por:

```ts
  // Texto libre → resolver vía la columna de ingesta. El chat ya trae dni+proyecto.
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    return NextResponse.json({ ok: true, action: "ignored_no_chat" });
  }
  const result = await ingestInbound({
    channel: "telegram",
    senderExternalId: String(chatId),
    body: text,
    providerMessageId: String(msg.message_id),
    dni: chat.dni,
    projectId: chat.project_id,
    raw: msg,
  });
  log.info("webhook.telegram.message_ingested", {
    dni: chat.dni,
    stored: result.stored,
    response: Boolean(result.responseToken),
  });
  return NextResponse.json({ ok: true, action: "message_ingested" });
```

(El bloque `/start` y `/baja` quedan **sin cambios**. El helper `findChatByChatId` y `void getChatByDni` quedan igual.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/webhook-telegram-inbound.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/telegram/route.ts tests/webhook-telegram-inbound.test.ts
git commit -m "feat(inbound): webhook Telegram persiste replies vía ingestInbound"
```

---

## Task 9: Corregir doc PLAN.md + verificación final

**Files:**
- Modify: `PLAN.md:33`

- [ ] **Step 1: Corregir el claim F4 de WhatsApp en `PLAN.md`**

Buscar la fila F4 (línea ~33):

```
| **F4** | WhatsApp service-initiated con webhooks (recepción de respuestas y estados). | `meta-wa-cloud` |
```

Reemplazar por (refleja que la recepción de respuestas se cierra en este trabajo, vía la columna de ingesta, también para SMS/Telegram):

```
| **F4** | WhatsApp service-initiated con webhooks (estados de entrega). La recepción de respuestas entrantes (WhatsApp/SMS/Telegram) se cierra con la columna de ingesta `inbound_messages` (ver docs/superpowers/specs/2026-06-27-inbound-2vias-design.md). | `meta-wa-cloud` |
```

Y en "Mejoras incrementales abiertas", quitar/ajustar el bullet de WhatsApp si correspondiera (dejar el de templates pre-aprobados, que sigue pendiente).

- [ ] **Step 2: Correr TODA la suite**

Run: `npm test`
Expected: PASS — toda la suite verde (los tests nuevos + los existentes intactos).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): corrige F4 — recepción de respuestas vía inbound_messages"
```

---

## Notas de despliegue (post-merge, fuera del plan de código)

- Aplicar la migración `0049` en Supabase (`supabase db push` o vía MCP `apply_migration`).
- **WhatsApp:** suscribir el campo `messages` en la config del webhook de Meta (hoy solo llega `message_status`/`statuses`). Sin esto el handler nunca recibe entrantes.
- **Telnyx:** confirmar que el Messaging Profile tenga el webhook apuntando a `/api/webhooks/telnyx` con eventos inbound habilitados.
- **Telegram:** ya recibe updates de texto; no requiere cambio de config.

## Self-Review

- **Cobertura del spec:**
  - §Modelo de datos → Task 1 (migración + store, idempotencia, índices, RLS). ✅
  - §Resolver (identidad teléfono/telegram, contexto por último envío, opt-out, persistencia) → Tasks 2,3,4,5. ✅
  - §Cableado webhooks (WA/SMS/Telegram) → Tasks 6,7,8. ✅
  - §Superficie (reusa `addResponse`) → cubierto en Task 5 (deriva `respuestas`). ✅
  - §Bordes (idempotencia, desconocido, fuera de ventana, opt-out, firmas intactas) → Tasks 1,5,6,7,8 (tests específicos). ✅
  - §Testing → cada task TDD. ✅
  - Corrección doc-vs-código (PLAN.md F4) → Task 9. ✅
  - Desviaciones documentadas vs spec: (a) `findLastOutbound` ignora canal porque `envios` no tiene columna `channel` (Task 4 nota); (b) proyecto multi-tenant = `projectId`/`DEFAULT_PROJECT_ID`, lookup receptor→`conector_config` diferido por YAGNI single-tenant (Task 5 nota). Ambas explícitas.
- **Placeholders:** ninguno — todo paso con código/comando real.
- **Consistencia de tipos:** `ingestInbound(InboundInput): Promise<InboundResult>`, `recordInbound(InboundRow): Promise<{inserted}>`, `inboundExists(channel, id)`, `latestSurveyTokenForDni(projectId, dni, sinceIso): {token, campaignId}|null`, `normalizePhone`, `detectOptOut`, `resolveContactByPhone` — nombres usados de forma idéntica entre tasks que los producen y consumen.
