# Plan 01 — P0 Production Blockers (Webhook HMAC + Auth gate + Send queue)

> Cierra los 3 P0 restantes de `docs/STABILIZATION.md`: webhook Meta sin firma,
> dashboard sin auth obligatoria en prod, envíos síncronos que se cortan por
> timeout. Cada fase es independiente y ejecutable en una sesión nueva.

## Phase 0 — Allowed APIs & Anti-patterns (Discovery consolidada)

### Stack confirmado

- **Next.js 16.2.6 App Router** + Turbopack. `next.config.ts` solo fija
  `turbopack.root`. No middleware existe.
- **NextAuth v5 (Auth.js)** — `lib/auth.ts` exporta `{ handlers, auth,
  signIn, signOut }` + `authConfigured: boolean`. Provider Google + allowlist
  por email (`ALLOWED_EMAILS`).
- **Supabase** service-role (`lib/db/supabase.ts`). Single-tenant, RLS deny-all.
- **Cron Vercel** ya configurado: `vercel.json` declara `/api/cron/sheets-sync
  * * * * *`. Auth pattern en `app/api/cron/sheets-sync/route.ts:7-15` (Bearer
  `${CRON_SECRET}` + fallback bloqueante en prod si falta secret).
- **Repository pattern** — `lib/db/types.ts:1-6` define la interfaz; impls en
  `lib/db/repo.ts` (Supabase) y `lib/db/memory.ts` (fallback).
- **Mirror write-behind** — `lib/db/mirror.ts:4-32` enqueue en
  `sheets_sync_queue` después de upsert/remove. **Template a copiar** para el
  nuevo `envio_queue`.
- **Crypto existente** — `lib/crypto.ts` solo AES-GCM (`encryptJson`,
  `decryptJson`) usando `CONFIG_MASTER_KEY`. No hay HMAC ni `timingSafeEqual`.

### APIs permitidos

| Necesidad | API | Fuente |
|---|---|---|
| HMAC-SHA256 | `import { createHmac, timingSafeEqual } from "node:crypto"` | Node stdlib |
| Raw body en route handler | `const raw = Buffer.from(await req.arrayBuffer())` | Web Fetch API |
| Hex compare timing-safe | `timingSafeEqual(Buffer.from(a,"hex"), Buffer.from(b,"hex"))` (mismo length) | Node stdlib |
| Service-role insert/select | `getSupabase().from(table).insert(...)` / `.select(...).eq(...)` | `@supabase/supabase-js` |
| Server action redirect con error | `redirect(\`/campanas?error=...\`)` desde `next/navigation` | Ya usado en `actions.ts:38-44` |
| Cron secret pattern | Bearer `${process.env.CRON_SECRET}` + fallback prod-block | `app/api/cron/sheets-sync/route.ts:7-15` |

### Anti-patterns prohibidos

- ❌ `req.json()` en webhook Meta — destruye raw bytes necesarios para HMAC.
  Usar `req.arrayBuffer()` + `JSON.parse(raw.toString("utf8"))`.
- ❌ `===` para comparar tokens o firmas. Siempre `timingSafeEqual`.
- ❌ Throw en webhook si firma inválida → siempre `return 403` para no leakear
  detalle del error.
- ❌ Tocar el dashboard layout con `if (NODE_ENV === "production")` ramificado
  — preferir guard centralizado en `lib/auth.ts` que el layout invoca.
- ❌ Insertar middleware que rompa rutas públicas (`/encuesta/[token]`,
  `/api/webhooks/*`, `/api/auth/*`, `/api/cron/*`). Si se usa middleware,
  matcher con `excludeFiles` explícito.
- ❌ Procesar la cola de envíos en `Promise.all` sin batch limit — revienta
  rate-limit del provider y consume cuota free. Sí: bucle serial dentro del
  batch, con `BATCH = 20` (igual que sheets-sync usa 50).
- ❌ Llamar `connector.send()` desde server action — debe ir solo al cron.

---

## Phase 1 — P0.2 Webhook Meta HMAC

### Objetivo

`app/api/webhooks/meta/route.ts` valida firma `x-hub-signature-256`
(HMAC-SHA256 de raw body con `META_WA_APP_SECRET`) antes de procesar. GET verify
usa `timingSafeEqual` para el token.

### Cambios

#### 1.1 — Agregar `META_WA_APP_SECRET` al env

**File:** `.env.example` (línea 31, después de `META_WA_VERIFY_TOKEN=`)

Agregar:
```
META_WA_APP_SECRET=
```

**File:** `docs/INTEGRATIONS.md` — sección Meta WhatsApp: documentar dónde
obtener el App Secret (Meta App Dashboard → Settings → Basic → App Secret) y
que es **requerido** para producción.

#### 1.2 — Helper de verificación HMAC en `lib/crypto.ts`

Agregar al final de `lib/crypto.ts`:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica HMAC-SHA256 hex de `body` contra `header` (formato "sha256=<hex>").
 * Constant-time. Devuelve false si secret/header faltan o length difiere.
 */
export function verifyHmacSha256(
  body: Buffer | string,
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!header || !secret) return false;
  const [scheme, hex] = header.split("=");
  if (scheme !== "sha256" || !hex) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(hex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Compara dos strings en tiempo constante. Devuelve false si lengths difieren. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

#### 1.3 — Reescribir `app/api/webhooks/meta/route.ts`

Reemplazar archivo completo (preservando STATUS_MAP / MetaWebhookBody / lógica
de update):

```typescript
// Webhook de Meta (WhatsApp Cloud API).
// GET  — verificación del webhook (hub.challenge) con el verify token.
// POST — actualizaciones de estado de mensajes (sent/delivered/read/failed).
// Seguridad: GET compara verify_token con timingSafeEqual.
// POST valida x-hub-signature-256 (HMAC-SHA256 del raw body con APP_SECRET).
import { NextResponse } from "next/server";
import { updateEnvioStatus, type Envio } from "@/lib/campaigns";
import { constantTimeEqual, verifyHmacSha256 } from "@/lib/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WA_VERIFY_TOKEN;

  if (mode !== "subscribe" || !token || !expected) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!constantTimeEqual(token, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge ?? "", { status: 200 });
}

const STATUS_MAP: Record<string, NonNullable<Envio["delivery"]>> = {
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  const secret = process.env.META_WA_APP_SECRET;

  if (!verifyHmacSha256(raw, signature, secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  let updated = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const mapped = s.status ? STATUS_MAP[s.status] : undefined;
        if (s.id && mapped && (await updateEnvioStatus(s.id, mapped))) updated++;
      }
    }
  }
  return NextResponse.json({ ok: true, updated });
}
```

#### 1.4 — Tests Vitest

**File nuevo:** `tests/webhook-meta.test.ts`

Casos:
1. GET: verify token correcto → 200 + challenge devuelto
2. GET: verify token incorrecto → 403
3. GET: verify token missing → 403
4. POST: sin header firma → 403
5. POST: firma inválida (otro secret) → 403
6. POST: firma válida + body válido → 200 + procesa statuses
7. POST: firma válida + body JSON corrupto → 400
8. POST: APP_SECRET no configurado → 403 (no leak)

Patrón:
```typescript
import { POST, GET } from "@/app/api/webhooks/meta/route";
import { createHmac } from "node:crypto";

function sign(body: string, secret: string) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

it("POST acepta firma válida", async () => {
  process.env.META_WA_APP_SECRET = "secret123";
  const body = JSON.stringify({ entry: [] });
  const res = await POST(
    new Request("http://x", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, "secret123") },
      body,
    }),
  );
  expect(res.status).toBe(200);
});
```

### Verificación Phase 1

```bash
# 1. Type-check
npx tsc --noEmit

# 2. Tests
npm run test -- tests/webhook-meta.test.ts

# 3. Grep checks
grep -rn "req.json()" app/api/webhooks/meta/  # debe estar vacío
grep -n "timingSafeEqual\|verifyHmacSha256" app/api/webhooks/meta/route.ts  # debe matchear

# 4. Smoke en local con curl (CRON server up)
SECRET=test123 BODY='{"entry":[]}' SIG=$(node -e "console.log('sha256='+require('crypto').createHmac('sha256','test123').update('$BODY').digest('hex'))")
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/meta \
  -H "x-hub-signature-256: $SIG" -d "$BODY"  # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/meta \
  -H "x-hub-signature-256: sha256=00" -d "$BODY"  # 403
```

### Anti-pattern guards Phase 1

- ❌ No reintroducir `req.json()` — siempre `arrayBuffer()` para firma.
- ❌ No comparar `signature === expected` con `===` — `timingSafeEqual`.
- ❌ Si falta `META_WA_APP_SECRET`, **rechazar 403** (no permitir bypass en
  desarrollo — usar valor mock en `.env.local`).

---

## Phase 2 — P0.3 Auth obligatoria en producción

### Objetivo

En `NODE_ENV=production`, si `authConfigured === false`, el proceso aborta el
arranque (build + runtime). Dashboard nunca es accesible sin OAuth en prod.

### Cambios

#### 2.1 — Guard centralizado en `lib/auth.ts`

Agregar al final del archivo:

```typescript
/**
 * Verifica que en producción la auth esté configurada. Lanza si no.
 * Llamar al inicio de cualquier código de servidor de prod.
 */
export function assertAuthConfiguredInProd(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (authConfigured) return;
  throw new Error(
    "AUTH_NOT_CONFIGURED: NODE_ENV=production requiere " +
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y NEXTAUTH_SECRET.",
  );
}

/**
 * Verifica que la allowlist esté seteada en prod. Vacío = cualquier Google
 * account (riesgo). Solo warning en stderr, no aborta.
 */
export function assertAllowlistConfiguredInProd(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!authConfigured) return;
  if (allowedEmails.length === 0) {
    console.warn(
      "[auth] ALLOWED_EMAILS vacío en producción: cualquier cuenta Google " +
        "podrá ingresar.",
    );
  }
}
```

Nota: `allowedEmails` ya es `const` en módulo (línea 7-10). Moverlo a `export
const allowedEmails` o pasar como arg al helper si lint lo prohíbe.

#### 2.2 — Invocar guard en boot

**File nuevo:** `instrumentation.ts` (root del proyecto, junto a
`next.config.ts`)

```typescript
// Hook de Next.js que corre una vez al inicio del server (build + runtime).
// Aborta el boot en prod si la auth no está configurada.
export async function register() {
  const { assertAuthConfiguredInProd, assertAllowlistConfiguredInProd } =
    await import("@/lib/auth");
  assertAuthConfiguredInProd();
  assertAllowlistConfiguredInProd();
}
```

Next.js detecta `instrumentation.ts` automáticamente y lo ejecuta una vez por
worker. No requiere config adicional en `next.config.ts`.

#### 2.3 — Hardening del dashboard layout

**File:** `app/(dashboard)/layout.tsx:25-28`

Reemplazar:
```typescript
if (authConfigured) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
}
```

Por:
```typescript
// En prod la auth es obligatoria (instrumentation aborta si no). En dev,
// si no hay OAuth configurado, se permite acceso para iterar mock.
if (authConfigured) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
} else if (process.env.NODE_ENV === "production") {
  // Defensa en profundidad: si instrumentation falló, igual bloqueamos.
  throw new Error("Auth no configurada en producción");
}
```

#### 2.4 — Middleware para rutas protegidas

**File nuevo:** `middleware.ts` (root)

```typescript
import { auth } from "@/lib/auth";
import { authConfigured } from "@/lib/auth";
import { NextResponse } from "next/server";

export default async function middleware(req: Request) {
  if (!authConfigured) {
    // Dev sin OAuth: pasar.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    // Prod sin auth: bloquear (instrumentation debería haber abortado el boot).
    return new NextResponse("Auth no configurada", { status: 503 });
  }
  const session = await auth();
  if (!session) {
    const url = new URL("/api/auth/signin", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Matchea TODO menos rutas públicas (auth/cron/webhooks/survey responder).
  matcher: [
    "/((?!api/auth|api/cron|api/webhooks|encuesta|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

Nota: el `matcher` excluye rutas públicas. `encuesta/[token]` debe quedar
accesible sin auth para que los destinatarios respondan encuestas.

#### 2.5 — Tests

**File nuevo:** `tests/auth-guard.test.ts`

Casos:
1. `assertAuthConfiguredInProd()` en dev → no lanza
2. `assertAuthConfiguredInProd()` en prod sin env vars → lanza con mensaje
3. `assertAuthConfiguredInProd()` en prod con env vars completas → no lanza
4. `assertAllowlistConfiguredInProd()` en prod sin allowlist → warning (mock
   console.warn)
5. `constantTimeEqual` mismo string → true; lengths distintos → false

### Verificación Phase 2

```bash
# 1. Tests
npm run test -- tests/auth-guard.test.ts

# 2. Build en prod simulado SIN env vars → debe fallar
NODE_ENV=production npm run build  # esperar error AUTH_NOT_CONFIGURED

# 3. Build en prod CON env vars stub → debe pasar
NEXTAUTH_SECRET=x GOOGLE_OAUTH_CLIENT_ID=x GOOGLE_OAUTH_CLIENT_SECRET=x \
  NODE_ENV=production npm run build

# 4. Dev sin env vars → seguir funcionando
unset NEXTAUTH_SECRET; npm run dev  # localhost:3000/conectores accesible

# 5. Smoke: GET /padron sin sesión con auth configurada → 307 a /api/auth/signin
```

### Anti-pattern guards Phase 2

- ❌ No checks de `NODE_ENV` dispersos por la app — solo en `lib/auth.ts`,
  `instrumentation.ts`, `middleware.ts`, `layout.tsx`.
- ❌ No bloquear rutas públicas en el middleware (matcher tiene exclusiones).
- ❌ No olvidar exportar `matcher` — sin él el middleware corre en assets.

---

## Phase 3 — P0.4 Cron queue de envíos

### Objetivo

`executeCampaign()` no llama `connector.send()` directamente. Inserta filas
en `envio_queue` y devuelve inmediato. Un nuevo cron
`/api/cron/send-queue` (cada minuto) consume batches respetando rate-limit por
conector.

### Cambios

#### 3.1 — Migración Supabase

**File nuevo:** `supabase/migrations/0003_envio_queue.sql`

```sql
-- Cola de envíos pendientes. Sigue el patrón de sheets_sync_queue.
-- Cada fila representa UN envío individual (no batch). El cron lo despacha
-- al conector correspondiente y marca done/failed.
create table if not exists envio_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  channel text not null,         -- email | whatsapp | sms | voice
  connector_id text not null,    -- resend | meta-wa-cloud | telnyx-sms | telnyx-voice
  contact jsonb not null,        -- snapshot Contact (dni, nombre, email, telefono, ...)
  template jsonb not null,       -- { asunto, cuerpo } interpolado
  token text not null,           -- survey token, referencia a survey_tokens
  status text not null default 'pending',  -- pending | done | failed
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  scheduled_at timestamptz default now(),  -- para futuro: scheduling
  processed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.envio_queue enable row level security;

create index if not exists idx_envio_queue_status_sched
  on envio_queue(status, scheduled_at) where status = 'pending';
create index if not exists idx_envio_queue_campaign on envio_queue(campaign_id);
```

Aplicar vía `mcp__supabase__apply_migration` con name `envio_queue`.

#### 3.2 — Refactor `lib/campaigns.ts` `executeCampaign`

**File:** `lib/campaigns.ts:254-378` (rango aprox según report del investigator)

Reemplazar el bucle síncrono `for (const m of sendable) { await
connector.send(...) }` (líneas ~310-332) por:

```typescript
// Encolar en lugar de enviar inline. El cron /api/cron/send-queue procesará.
const queueRows = await Promise.all(
  sendable.map(async (m) => {
    const token = await createToken(campaignId, m.contact.dni);
    return {
      campaign_id: campaignId,
      channel: connector.channel,
      connector_id: connector.id,
      contact: m.contact,
      template: {
        asunto: template.asunto
          ? interpolate(template.asunto, m.contact)
          : null,
        cuerpo: buildBody(template.cuerpo, m.contact, `${baseUrl()}/encuesta/${token}`),
      },
      token,
    };
  }),
);

if (dbConfigured() && queueRows.length > 0) {
  const db = getSupabase();
  // Batches de 500 para no superar el límite de Supabase REST.
  for (let i = 0; i < queueRows.length; i += 500) {
    const batch = queueRows.slice(i, i + 500);
    const { error } = await db.from("envio_queue").insert(batch);
    if (error) throw new Error(`enqueue falló: ${error.message}`);
  }
}

// Métricas iniciales: la campaña queda en estado 'encolada' con N pendientes.
const metrics = {
  enqueued: queueRows.length,
  excluded_optout: optoutExcluded,
  excluded_cooldown: cooldownExcluded,
};
```

Persistir `campanas` con `estado='encolada'` (no `'enviada'`). El cron actualiza
el estado a `'enviando'` mientras hay pendientes y a `'enviada'` cuando
`pending == 0`.

#### 3.3 — Nuevo cron handler

**File nuevo:** `app/api/cron/send-queue/route.ts`

```typescript
import { NextResponse } from "next/server";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { connectors } from "@/lib/connectors/registry";
import type { OutreachConnector } from "@/lib/connectors/types";
import { incrementUsage, getUsage } from "@/lib/quota";

const BATCH = 20;

interface QueueRow {
  id: string;
  campaign_id: string;
  channel: string;
  connector_id: string;
  contact: { dni: string; nombre?: string; email?: string; telefono?: string };
  template: { asunto: string | null; cuerpo: string };
  token: string;
  attempts: number;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (auth !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  const db = getSupabase();
  const { data: rows } = await db.from("envio_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at")
    .limit(BATCH);

  let done = 0, failed = 0;
  for (const row of (rows ?? []) as QueueRow[]) {
    const connector = connectors.find(
      (c) => c.id === row.connector_id,
    ) as OutreachConnector | undefined;
    if (!connector) {
      await db.from("envio_queue").update({
        status: "failed",
        last_error: `connector ${row.connector_id} no registrado`,
        processed_at: new Date().toISOString(),
      }).eq("id", row.id);
      failed++; continue;
    }

    // Re-check quota antes de enviar.
    const quota = await connector.getQuota();
    if (quota.used >= quota.limit) {
      // Re-schedule 1 min adelante.
      await db.from("envio_queue").update({
        scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: "quota_blocked",
      }).eq("id", row.id);
      continue;
    }

    try {
      const result = await connector.send(
        { subject: row.template.asunto ?? undefined, body: row.template.cuerpo },
        row.contact,
      );
      await db.from("envio_queue").update({
        status: result.ok ? "done" : "failed",
        attempts: row.attempts + 1,
        provider_message_id: result.providerMessageId ?? null,
        last_error: result.ok ? null : (result.reason ?? "unknown"),
        processed_at: new Date().toISOString(),
      }).eq("id", row.id);
      // Insertar registro en `envios` para que el dashboard de campaña lo vea.
      await db.from("envios").insert({
        campaign_id: row.campaign_id,
        dni: row.contact.dni,
        nombre: row.contact.nombre,
        destino: row.contact.email ?? row.contact.telefono,
        estado: result.ok ? "enviado" : "fallido",
        reason: result.reason ?? null,
        provider_message_id: result.providerMessageId ?? null,
        token: row.token,
      });
      result.ok ? done++ : failed++;
    } catch (e) {
      const msg = (e as Error).message;
      const newAttempts = row.attempts + 1;
      // 3 intentos antes de marcar failed permanente.
      await db.from("envio_queue").update({
        status: newAttempts >= 3 ? "failed" : "pending",
        attempts: newAttempts,
        last_error: msg,
        scheduled_at: newAttempts >= 3
          ? null
          : new Date(Date.now() + Math.pow(2, newAttempts) * 60_000).toISOString(),
      }).eq("id", row.id);
      failed++;
    }
  }
  return NextResponse.json({ done, failed, batch: rows?.length ?? 0 });
}
```

#### 3.4 — Registrar cron en `vercel.json`

**File:** `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/sheets-sync", "schedule": "* * * * *" },
    { "path": "/api/cron/send-queue", "schedule": "* * * * *" }
  ]
}
```

#### 3.5 — UI: estado "encolada" en `/campanas`

**File:** revisar `app/(dashboard)/campanas/page.tsx` y componente que muestra
estado. Agregar handling de `estado='encolada'` y `'enviando'` con contador de
pendientes (query `count(*) where campaign_id=X and status='pending'`).

#### 3.6 — Tests

**File nuevo:** `tests/send-queue.test.ts`

Casos:
1. `executeCampaign` con 100 contactos → inserta 100 filas en `envio_queue`,
   no llama `connector.send` (mock + verify call count = 0).
2. Cron GET sin secret en prod → 403.
3. Cron GET con secret válido → procesa hasta BATCH filas, marca done.
4. Cron con connector caído (throw) → attempts++, status pending, scheduled_at
   diferido.
5. Cron con quota llena → re-schedule +60s, no decrement attempts.
6. Cron con connector_id inexistente → status failed sin reintento.

### Verificación Phase 3

```bash
# 1. Migración aplicada
# (usar mcp__supabase__list_tables para verificar envio_queue)

# 2. Tests
npm run test -- tests/send-queue.test.ts

# 3. Smoke local
# Crear campaña vía UI → /campanas/nueva
# Verificar: SELECT COUNT(*) FROM envio_queue WHERE status='pending'  -- = N
# Verificar: SELECT COUNT(*) FROM envios WHERE campaign_id=X  -- = 0 (aún)
# Disparar cron manual:
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-queue
# Verificar: SELECT COUNT(*) FROM envios WHERE campaign_id=X  -- > 0

# 4. Grep anti-patterns
grep -n "connector.send" lib/campaigns.ts  # NO debe matchear (movido al cron)
grep -n "connector.send" app/api/cron/send-queue/route.ts  # SÍ matchea
```

### Anti-pattern guards Phase 3

- ❌ No await `connector.send` desde server action (`actions.ts` solo
  `executeCampaign`).
- ❌ No insertar `envios` desde `executeCampaign` — solo el cron lo hace al
  procesar.
- ❌ No usar `Promise.all` para enviar el batch — bucle serial respeta rate
  limit del provider.
- ❌ No reintentar indefinidamente — cap a 3 intentos con backoff exponencial
  (1, 2, 4 min).
- ❌ No olvidar el índice parcial `where status='pending'` — sin él el query
  scan completo crece con cada done.

---

## Phase 4 — Verificación final

### 1. Suite completa

```bash
npx tsc --noEmit
npx eslint
npm run test
```

### 2. Build prod

```bash
NEXTAUTH_SECRET=x GOOGLE_OAUTH_CLIENT_ID=x GOOGLE_OAUTH_CLIENT_SECRET=x \
  ALLOWED_EMAILS=test@example.com \
  META_WA_APP_SECRET=stub META_WA_VERIFY_TOKEN=stub \
  SUPABASE_URL=https://x SUPABASE_SERVICE_ROLE_KEY=x \
  CRON_SECRET=x CONFIG_MASTER_KEY=$(openssl rand -base64 32) \
  NODE_ENV=production npm run build
```

Esperado: pasa sin errores.

```bash
NODE_ENV=production npm run build
```

Esperado: falla con `AUTH_NOT_CONFIGURED`.

### 3. Manual smoke

- [ ] `/conectores` accesible en dev sin OAuth (mock).
- [ ] Crear campaña pequeña (5 contactos): aparece en `/campanas` con
      estado "encolada".
- [ ] Trigger cron `/api/cron/send-queue` manualmente: filas pasan a `done`,
      aparecen en `envios`.
- [ ] POST a `/api/webhooks/meta` sin firma → 403.
- [ ] POST con firma válida → 200 y delivery actualizado.

### 4. Update STABILIZATION.md

Marcar P0.2, P0.3, P0.4 como ✅ resueltos. Mover P1 (tests) al tope.

### 5. Commits

```
feat(security): HMAC-SHA256 en webhook Meta + timing-safe verify token
feat(auth): bloquear arranque en prod si OAuth no configurado
feat(campaigns): mover envíos a cola async procesada por Vercel Cron
```

---

## Anti-patterns globales (revisar al final)

- ❌ `process.env.X === "valor"` sin defaults seguros
- ❌ `req.json()` en webhooks con HMAC (siempre raw body)
- ❌ `Promise.all` sobre sends a providers (rompe rate limit)
- ❌ Comparar tokens/firmas con `===`
- ❌ Endpoints cron sin Bearer + sin fallback prod-block
- ❌ Dashboard sin gate de auth en prod
