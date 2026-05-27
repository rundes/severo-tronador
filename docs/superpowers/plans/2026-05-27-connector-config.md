# Connector Configuration UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar cada conector desde el panel `/conectores` (modal con campos del `configSchema` + cómo obtenerlos), persistiendo credenciales encriptadas en Supabase, con prioridad UI-sobre-env, test de conexión, y activar/desactivar.

**Architecture:** Un resolver `getConnectorConfig(id)` fusiona la config de `conector_config` (desencriptada) sobre los defaults de env (UI gana). Los conectores leen credenciales de ahí en vez de `process.env`. La UI (modal client + server actions) gestiona la config; los secrets se encriptan con `lib/crypto.ts` y nunca vuelven al cliente.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase (`conector_config`, PK `connector_id`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-connector-config-design.md`

---

## File structure

| Archivo | Responsabilidad |
|---|---|
| `lib/connectors/config.ts` | resolver + save/delete/enabled/fieldStatus |
| `lib/connectors/*.ts` (7) | leer credenciales vía `getConnectorConfig` |
| `components/connectors/config-modal.tsx` | modal client de configuración |
| `components/connectors/connector-card.tsx` | botón "Configurar" |
| `app/(dashboard)/conectores/page.tsx` | pasar fieldStatus + quitar "+ Agregar" |
| `app/(dashboard)/conectores/actions.ts` | guardar/probar/toggle/borrar |
| `lib/campaigns.ts` | gate `isEnabled` antes de enviar |
| `tests/connectors/config.test.ts` | tests del resolver |

---

## Task 1: `lib/connectors/config.ts` — resolver + persistencia

**Files:**
- Create: `lib/connectors/config.ts`
- Test: `tests/connectors/config.test.ts`

- [ ] **Step 1: Test (memory fallback — sin Supabase devuelve env-only; configFieldStatus no filtra secretos)**

Create `tests/connectors/config.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { getConnectorConfig, configFieldStatus } from "@/lib/connectors/config";

afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM; });

describe("connector config (sin Supabase)", () => {
  it("getConnectorConfig devuelve defaults de env", async () => {
    process.env.RESEND_API_KEY = "re_env";
    const cfg = await getConnectorConfig("resend");
    expect(cfg.RESEND_API_KEY).toBe("re_env");
  });

  it("configFieldStatus marca source env/none sin exponer valores", async () => {
    process.env.RESEND_API_KEY = "re_secreto";
    const fields = await configFieldStatus("resend");
    const apiKey = fields.find((f) => f.key === "RESEND_API_KEY")!;
    expect(apiKey.hasValue).toBe(true);
    expect(apiKey.source).toBe("env");
    // el status NO incluye el valor
    expect(JSON.stringify(fields)).not.toContain("re_secreto");
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- tests/connectors/config.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/connectors/config.ts`**

```ts
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { getConnector } from "./registry";
import type { ConfigField } from "./types";

export type ConnectorConfigValues = Record<string, string>;

function schemaFields(connectorId: string): ConfigField[] {
  return getConnector(connectorId)?.configSchema ?? [];
}
function isSecret(connectorId: string, key: string): boolean {
  return schemaFields(connectorId).some((f) => f.key === key && f.type === "secret");
}
function envDefaults(connectorId: string): ConnectorConfigValues {
  const out: ConnectorConfigValues = {};
  for (const f of schemaFields(connectorId)) {
    const v = process.env[f.key];
    if (v) out[f.key] = v;
  }
  return out;
}

interface ConfigRow { connector_id: string; config: Record<string, string> | null; enabled: boolean | null; }

async function getRow(connectorId: string): Promise<ConfigRow | null> {
  if (!dbConfigured()) return null;
  const { data } = await getSupabase()
    .from("conector_config").select("*").eq("connector_id", connectorId).maybeSingle();
  return (data as ConfigRow) ?? null;
}

async function storedConfig(connectorId: string): Promise<ConnectorConfigValues> {
  const row = await getRow(connectorId);
  if (!row?.config) return {};
  const out: ConnectorConfigValues = {};
  for (const [k, v] of Object.entries(row.config)) {
    if (v == null || v === "") continue;
    out[k] = isSecret(connectorId, k) ? await decryptJson<string>(v) : v;
  }
  return out;
}

// Config efectiva: UI (Supabase, desencriptada) sobre defaults de env.
export async function getConnectorConfig(connectorId: string): Promise<ConnectorConfigValues> {
  return { ...envDefaults(connectorId), ...(await storedConfig(connectorId)) };
}

export async function saveConnectorConfig(connectorId: string, values: ConnectorConfigValues): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase/CONFIG_MASTER_KEY no configurado: no se puede guardar la config");
  const row = await getRow(connectorId);
  const config: Record<string, string> = { ...(row?.config ?? {}) };
  for (const f of schemaFields(connectorId)) {
    const v = values[f.key];
    if (v === undefined) continue;                       // no enviado → no tocar
    if (f.type === "secret" && v === "") continue;        // secret vacío → conservar
    if (v === "") { delete config[f.key]; continue; }     // no-secret vacío → limpiar
    config[f.key] = f.type === "secret" ? await encryptJson(v) : v;
  }
  const payload: Record<string, unknown> = { connector_id: connectorId, config, updated_at: new Date().toISOString() };
  if (!row) payload.enabled = true;                       // primera vez → activo
  const { error } = await getSupabase().from("conector_config").upsert(payload, { onConflict: "connector_id" });
  if (error) throw error;
}

export async function deleteConnectorConfig(connectorId: string): Promise<void> {
  if (!dbConfigured()) return;
  await getSupabase().from("conector_config").delete().eq("connector_id", connectorId);
}

export async function setEnabled(connectorId: string, enabled: boolean): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  await getSupabase().from("conector_config").upsert(
    { connector_id: connectorId, enabled, updated_at: new Date().toISOString() },
    { onConflict: "connector_id" },
  );
}

export async function isEnabled(connectorId: string): Promise<boolean> {
  const row = await getRow(connectorId);
  if (!row) return true;            // sin fila → retrocompat (activo si hay creds)
  return row.enabled !== false;
}

export interface FieldStatus {
  key: string; label: string; type: string; help?: string;
  required: boolean; placeholder?: string; hasValue: boolean; source: "ui" | "env" | "none";
}

export async function configFieldStatus(connectorId: string): Promise<FieldStatus[]> {
  const stored = (await getRow(connectorId))?.config ?? {};
  const env = envDefaults(connectorId);
  return schemaFields(connectorId).map((f) => {
    const inUi = stored[f.key] != null && stored[f.key] !== "";
    const inEnv = env[f.key] != null;
    return {
      key: f.key, label: f.label, type: f.type, help: f.help,
      required: f.required, placeholder: f.placeholder,
      hasValue: inUi || inEnv, source: inUi ? "ui" : inEnv ? "env" : "none",
    };
  });
}
```

- [ ] **Step 4: Run → PASS** (`npm test -- tests/connectors/config.test.ts`) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add lib/connectors/config.ts tests/connectors/config.test.ts
git commit -m "feat(connectors): resolver de config UI-sobre-env + persistencia encriptada"
```

---

## Task 2: Conectores leen credenciales vía `getConnectorConfig`

**Files (modify):** `lib/connectors/{resend,meta-wa-cloud,telnyx-sms,telnyx-voice,claude-api,x-api,google-sheets}.ts`

> Patrón general: dentro de cada método async, reemplazar lecturas de
> `process.env.X` por `const cfg = await getConnectorConfig(ID); ... cfg.X`. Las
> funciones módulo-level `hasKey()`/`hasCreds()`/`hasRealCreds()` pasan a recibir
> `cfg` (o se inlinean). Importar `import { getConnectorConfig } from "./config";`.
> Los defaults de env se preservan (los devuelve el resolver), así el modo mock
> sigue igual. El build (`tsc`) es el gate. Hacer un conector por step + commit.

- [ ] **Step 1 — resend** (`lib/connectors/resend.ts`):
  Quitar `function hasKey()`. En `test()`, `getStatus()` ya usan quota (no env). En `send()`: al inicio `const cfg = await getConnectorConfig(ID);` y reemplazar `process.env.RESEND_API_KEY`→`cfg.RESEND_API_KEY`, `process.env.RESEND_FROM`→`cfg.RESEND_FROM`. La rama mock se decide por `if (!cfg.RESEND_API_KEY)`. En `test()`: `const cfg = await getConnectorConfig(ID); return cfg.RESEND_API_KEY ? {ok,message:"API key presente…"} : {ok,message:"Modo mock…"}`. Build + commit `refactor(resend): credenciales vía getConnectorConfig`.

- [ ] **Step 2 — meta-wa-cloud**: reemplazar `hasCreds()` y los `process.env.META_WA_*` en `test()` y `send()` por `cfg.META_WA_PHONE_NUMBER_ID`/`cfg.META_WA_ACCESS_TOKEN`. Build + commit.

- [ ] **Step 3 — telnyx-sms**: `hasCreds()` y `send()` → `cfg.TELNYX_API_KEY`, `cfg.TELNYX_MESSAGING_PROFILE_ID`. `monthlyCap()` lee `cfg.TELNYX_SMS_MONTHLY_CAP` (pasar cfg o leer dentro de los métodos async que ya tienen cfg; si `getQuota`/`estimateQuotaImpact` necesitan el cap, hacer `const cfg = await getConnectorConfig(ID)` ahí y `Number(cfg.TELNYX_SMS_MONTHLY_CAP) || 2000`). Build + commit.

- [ ] **Step 4 — telnyx-voice**: ídem con `cfg.TELNYX_API_KEY`, `cfg.TELNYX_VOICE_CONNECTION_ID`, `cfg.TELNYX_VOICE_FROM`, `cfg.TELNYX_VOICE_MONTHLY_CAP`. Build + commit.

- [ ] **Step 5 — claude-api**: `hasKey()` → `cfg.ANTHROPIC_API_KEY` dentro de `test()` (y donde corresponda). El coding/sentiment sigue mock; solo el mensaje de `test()` cambia según `cfg.ANTHROPIC_API_KEY`. Build + commit.

- [ ] **Step 6 — x-api**: en `test()` reemplazar `process.env.X_API_BEARER_TOKEN` por `cfg.X_API_BEARER_TOKEN`. Build + commit.

- [ ] **Step 7 — google-sheets**: `hasRealCreds()` y `getSheetsClient()` leen de cfg: `cfg.GOOGLE_SERVICE_ACCOUNT_KEY`, `cfg.GOOGLE_SHEETS_SHEET_ID`. Como `getSheetsClient()` es sync hoy, pasarle el cfg ya resuelto desde el método async que lo llama (`test`, `readPadron`). Build + commit `refactor(google-sheets): credenciales vía getConnectorConfig`.

> Cada step: editar el conector, `npm run build` (debe compilar), commit. Al final, `npm test` (todo verde).

---

## Task 3: Modal de configuración (client) + botón "Configurar"

**Files:**
- Create: `components/connectors/config-modal.tsx`
- Modify: `components/connectors/connector-card.tsx`
- Create: `lib/connectors/setup-links.ts`

- [ ] **Step 1: Mapa de anchors a la guía**

Create `lib/connectors/setup-links.ts`:
```ts
// Ancla de cada conector en la guía publicada (GitHub Pages).
const BASE = "https://rundes.github.io/severo-tronador/INTEGRATIONS.html";
const ANCHOR: Record<string, string> = {
  "google-oauth": "#1-google-oauth-auth",
  "google-sheets": "#2-google-sheets-datos",
  resend: "#3-resend-email",
  "meta-wa-cloud": "#4-meta-cloud-api-whatsapp",
  "telnyx-sms": "#5-telnyx-sms",
  "telnyx-voice": "#6-telnyx-voz--ivr",
  "claude-api": "#7-claude-api-análisis",
  gdelt: "#8-gdelt-listening",
  "x-api": "#9-x-api-listening",
  "reddit-api": "#10-reddit-api-listening",
};
export function setupLink(connectorId: string): string {
  return BASE + (ANCHOR[connectorId] ?? "");
}
```

- [ ] **Step 2: Modal client**

Create `components/connectors/config-modal.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import type { FieldStatus } from "@/lib/connectors/config";

interface Props {
  connectorId: string;
  name: string;
  fields: FieldStatus[];
  enabled: boolean;
  setupUrl: string;
  onClose: () => void;
  guardar: (fd: FormData) => Promise<void>;
  probar: (fd: FormData) => Promise<{ ok: boolean; message: string }>;
  toggle: (enabled: boolean) => Promise<void>;
  borrar: () => Promise<void>;
}

const input = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function ConfigModal(p: Props) {
  const [pending, start] = useTransition();
  const [test, setTest] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={p.onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{p.name}</h2>
          <button onClick={p.onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
        </div>
        <a href={p.setupUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-600 underline">
          Cómo obtener estas credenciales →
        </a>

        <form
          className="mt-4 space-y-3"
          action={(fd) => start(async () => { await p.guardar(fd); p.onClose(); })}
        >
          {p.fields.map((f) => (
            <label key={f.key} className="block text-xs text-zinc-500">
              {f.label} {f.required && <span className="text-red-500">*</span>}
              <input
                name={f.key}
                type={f.type === "secret" ? "password" : f.type === "textarea" ? "text" : "text"}
                placeholder={f.hasValue && f.type === "secret" ? "configurado ••••" : f.placeholder ?? ""}
                className={input}
              />
              {f.help && <span className="mt-0.5 block text-[11px] text-zinc-400">{f.help}</span>}
              <span className="text-[11px] text-zinc-400">
                fuente actual: {f.source === "ui" ? "guardada" : f.source === "env" ? "variable de entorno" : "sin configurar"}
              </span>
            </label>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              Guardar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                const form = (e.currentTarget.closest("form") as HTMLFormElement);
                start(async () => setTest((await p.probar(new FormData(form))).message));
              }}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Probar conexión
            </button>
            <button type="button" disabled={pending} onClick={() => start(async () => { await p.toggle(!p.enabled); p.onClose(); })} className="text-sm text-zinc-600">
              {p.enabled ? "Desactivar" : "Activar"}
            </button>
            <button type="button" disabled={pending} onClick={() => start(async () => { await p.borrar(); p.onClose(); })} className="ml-auto text-xs text-red-600 underline">
              Borrar config
            </button>
          </div>
          {test && <p className="text-xs text-zinc-500">{test}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Botón "Configurar" en la card**

Modify `components/connectors/connector-card.tsx`: convertir en client (`"use client"`) o extraer un sub-botón client. Agregar un botón "Configurar" que, al click, muestra `<ConfigModal>` con los props (los handlers `guardar/probar/toggle/borrar` se pasan desde la page como server actions bindeadas por `connectorId`; ver Task 4). Estado local `const [open,setOpen]=useState(false)`.

- [ ] **Step 4: Build**

Run: `npm run build` → compila (la page todavía no pasa los handlers; si hay error de props, completar en Task 4). Commit:
```bash
git add components/connectors/config-modal.tsx components/connectors/connector-card.tsx lib/connectors/setup-links.ts
git commit -m "feat(ui): modal de configuración de conectores + link a la guía"
```

---

## Task 4: Server actions + wiring en `/conectores`

**Files:**
- Create: `app/(dashboard)/conectores/actions.ts`
- Modify: `app/(dashboard)/conectores/page.tsx`

- [ ] **Step 1: Server actions**

Create `app/(dashboard)/conectores/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { getConnector } from "@/lib/connectors/registry";
import {
  saveConnectorConfig, deleteConnectorConfig, setEnabled, getConnectorConfig,
  type ConnectorConfigValues,
} from "@/lib/connectors/config";

function valuesFromForm(connectorId: string, fd: FormData): ConnectorConfigValues {
  const schema = getConnector(connectorId)?.configSchema ?? [];
  const out: ConnectorConfigValues = {};
  for (const f of schema) {
    const v = fd.get(f.key);
    if (typeof v === "string") out[f.key] = v.trim();
  }
  return out;
}

export async function guardarConfig(connectorId: string, fd: FormData) {
  if (!getConnector(connectorId)) return;
  await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  revalidatePath("/conectores");
}

export async function probarConexion(connectorId: string, fd: FormData): Promise<{ ok: boolean; message: string }> {
  const connector = getConnector(connectorId);
  if (!connector) return { ok: false, message: "Conector desconocido" };
  // Guardar primero (así test() usa la config nueva), luego test.
  await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  const res = await connector.test(await getConnectorConfig(connectorId));
  revalidatePath("/conectores");
  return { ok: res.ok, message: res.message };
}

export async function toggleConector(connectorId: string, enabled: boolean) {
  if (!getConnector(connectorId)) return;
  await setEnabled(connectorId, enabled);
  revalidatePath("/conectores");
}

export async function borrarConfig(connectorId: string) {
  if (!getConnector(connectorId)) return;
  await deleteConnectorConfig(connectorId);
  revalidatePath("/conectores");
}
```

- [ ] **Step 2: Wire en la page**

Modify `app/(dashboard)/conectores/page.tsx`:
- Importar `configFieldStatus`, `isEnabled` y las actions.
- Para cada conector, computar `fields = await configFieldStatus(c.id)`, `enabled = await isEnabled(c.id)`, `setupUrl = setupLink(c.id)`.
- Pasar a la card (que renderiza el botón + modal) los handlers bindeados:
  `guardar={guardarConfig.bind(null, c.id)}`, `probar={probarConexion.bind(null, c.id)}`, `toggle={(e)=>toggleConector(c.id, e)}`, `borrar={borrarConfig.bind(null, c.id)}`.
  (Pasar server actions a client components como props está soportado.)
- Eliminar el botón "+ Agregar conector" global.

- [ ] **Step 3: Build + smoke**

Run: `npm run build` → compila, ruta `/conectores`. `npm run dev`, abrir `/conectores`, click "Configurar" en un conector → el modal abre, muestra campos + link, "Probar conexión" responde (en mock, sin Supabase, "Guardar" mostrará el error de Supabase no configurado — esperado).

- [ ] **Step 4: Commit**
```bash
git add "app/(dashboard)/conectores/actions.ts" "app/(dashboard)/conectores/page.tsx"
git commit -m "feat(ui): server actions de config + wiring en /conectores"
```

---

## Task 5: Gate `isEnabled` en la cola de campañas

**Files:**
- Modify: `lib/campaigns.ts`
- Test: `tests/campaigns-enabled.test.ts`

- [ ] **Step 1: Test (sin Supabase, isEnabled→true: no cambia el comportamiento actual)**

Create `tests/campaigns-enabled.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { executeCampaign } from "@/lib/campaigns";

describe("campañas respetan conector activo", () => {
  it("sin Supabase (conector activo por default) envía normal", async () => {
    const res = await executeCampaign({
      nombre: "T", channel: "email", templateId: "tpl-invitacion",
      segmentFilter: { healthMin: 80 }, preguntas: ["p"],
    });
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run → PASS (ya pasa; documenta el comportamiento). Luego implementar el gate.**

- [ ] **Step 3: En `executeCampaign`**, tras resolver el conector y antes del chequeo de cuota:
```ts
import { isEnabled } from "@/lib/connectors/config";
// ...
if (!(await isEnabled(connector.id))) {
  return { ok: false, reason: "no_connector" };
}
```
(Reusar `reason: "no_connector"` evita ampliar el tipo `ExecuteResult`; el form de nueva campaña ya muestra ese error. Alternativamente, agregar `"disabled"` al union y un mensaje propio — elegir lo mínimo.)

- [ ] **Step 4: Run → PASS** (`npm test`) y `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add lib/campaigns.ts tests/campaigns-enabled.test.ts
git commit -m "feat(campaigns): no enviar por un conector desactivado"
```

---

## Task 6: Docs + verificación

**Files:** `docs/INTEGRATIONS.md`, `docs/STABILIZATION.md`

- [ ] **Step 1:** En `docs/INTEGRATIONS.md`, al inicio, una nota: "Cada conector se puede configurar **desde el panel** (`/conectores → Configurar`) además de por env var; lo guardado en el panel tiene prioridad. Esta guía describe de dónde sacar cada credencial."

- [ ] **Step 2:** En `docs/STABILIZATION.md`, marcar el ítem 18 (encriptación de credenciales) como aplicado: la config de conectores ya se persiste encriptada vía esta feature.

- [ ] **Step 3:** `npm test` (todo verde) + `npm run build` (verde). Smoke `/conectores`: botón "Configurar" abre modal; sin "+ Agregar" global.

- [ ] **Step 4: Commit**
```bash
git add docs/INTEGRATIONS.md docs/STABILIZATION.md
git commit -m "docs: configuración de conectores desde el panel"
```

---

## Cambio de interfaz necesario: `Connector.test(config?)`

El `test()` de la interfaz `Connector` hoy es `test(config?: Config): Promise<TestResult>` (ya acepta un `config` opcional). En **Task 2** los conectores deben usar **la config resuelta** dentro de `test()`. Para que `probarConexion` pruebe con los valores recién tipeados, `test()` debe poder recibir un override. Mantener la firma `test(config?: Config)`: si llega `config`, usarlo; si no, `await getConnectorConfig(ID)`. Implementar este patrón en cada `test()` durante Task 2. (`Config` = `Record<string,string>`, ya exportado en `types.ts`.)

---

## Self-review (cobertura del spec)

- Resolver UI-sobre-env → Task 1 (`getConnectorConfig`) ✓
- Guardar encriptado / borrar / enabled / fieldStatus → Task 1 ✓
- Conectores leen vía resolver (env como fallback, mock intacto) → Task 2 ✓
- Modal: campos + help + link a la guía, secrets enmascarados → Task 3 ✓
- Server actions guardar/probar/toggle/borrar, validan connectorId, no devuelven secrets → Task 4 ✓
- Quitar "+ Agregar" global → Task 4 ✓
- `enabled` respetado en envíos (retrocompat) → Task 5 ✓
- Seguridad (encriptado, nunca al cliente) → Tasks 1, 4 ✓
- Docs → Task 6 ✓

**Ajuste de tipo:** `probarConexion` pasa la config al `connector.test(config)`; requiere el patrón `test(config?)` (sección arriba). Sin Supabase, `saveConnectorConfig`/`probarConexion` lanzan/avisan — la UI lo muestra (esperado).
