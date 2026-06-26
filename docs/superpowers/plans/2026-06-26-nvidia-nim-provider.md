# NVIDIA NIM Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NVIDIA NIM the primary AI text provider (OpenAI-compatible, 121 models) with Claude/Gemini/SiliconFlow as fallback, plus a tiered (fast/deep) model picker curated by capability.

**Architecture:** New OpenAI-compatible client (`lib/nvidia.ts`) + static capability classifier (`lib/ai/nvidia-models.ts`) + central text dispatcher (`lib/ai/generate.ts`, order NVIDIA→Gemini→Claude→SiliconFlow→heuristic) + an `analysis` connector (`lib/connectors/nvidia.ts`). Single-pick call sites route through the dispatcher; the ad-studio fan-out (`lib/ad-proposals.ts`) gains NVIDIA models alongside the others. Image/video untouched.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Vitest, fetch (no SDKs), Supabase (optional; in-memory fallback).

## Global Constraints

- **Test runner:** `npm test` (`vitest run`); single file `npx vitest run <path>`.
- **Import alias:** `@/` → repo root (e.g. `@/lib/nvidia`).
- **No SDKs:** all provider calls are direct `fetch`, matching `lib/anthropic.ts` / `lib/siliconflow.ts`.
- **Config resolution:** read keys via `getConnectorConfig(id)` (env default ∪ stored). Never read `process.env` directly in call sites.
- **Token quota:** track via `incrementUsage(connectorId, tokens, projectId)` from `@/lib/quota`; unit `tokens`, per `project_id`. Check before, increment after.
- **Privacy (AI-STRATEGY.md §4):** raw padrón (DNI, nombre, teléfono, email, dirección) never sent to any third-party API. NVIDIA is a third party — same rule.
- **Never breaks:** with no provider keys, text features degrade to local heuristic, never throw.
- **NVIDIA endpoint:** `process.env.NVIDIA_BASE || "https://integrate.api.nvidia.com/v1"`; auth `Authorization: Bearer <key>`.
- **Default models (verified present in /v1/models):** fast `meta/llama-3.3-70b-instruct`; deep `nvidia/llama-3.1-nemotron-ultra-253b-v1`.
- **Commit style:** Conventional Commits in Spanish, scope `ia`/`conectores`, end body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/nvidia-nim-provider` (already created, holds the design spec).

---

### Task 1: NVIDIA OpenAI-compatible client

**Files:**
- Create: `lib/nvidia.ts`
- Test: `tests/nvidia.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `nvidiaChat({ apiKey: string; model: string; system?: string; prompt: string; maxTokens?: number }): Promise<{ text: string; inputTokens: number; outputTokens: number }>`
  - `listNvidiaModels(apiKey: string): Promise<string[]>` (cached ~6h in module-level `Map`)
  - `const NVIDIA_BASE: string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/nvidia.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nvidiaChat, listNvidiaModels } from "@/lib/nvidia";

beforeEach(() => { vi.restoreAllMocks(); });

describe("nvidiaChat", () => {
  it("parsea choices[0].message.content y usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  hola  " } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await nvidiaChat({ apiKey: "k", model: "meta/llama-3.3-70b-instruct", prompt: "hi" });
    expect(r.text).toBe("hola");
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/chat/completions");
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });

  it("lanza con el mensaje del error de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad model" } }), { status: 400 }),
    ));
    await expect(
      nvidiaChat({ apiKey: "k", model: "x", prompt: "hi" }),
    ).rejects.toThrow("bad model");
  });
});

describe("listNvidiaModels", () => {
  it("devuelve los ids de data[]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "a/b" }, { id: "c/d" }] }), { status: 200 }),
    ));
    expect(await listNvidiaModels("k")).toEqual(["a/b", "c/d"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nvidia.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nvidia'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/nvidia.ts
// Cliente de NVIDIA NIM (API OpenAI-compatible, integrate.api.nvidia.com).
// Server-only. Fetch directo, sin SDK. Misma forma que siliconflowChat.
export const NVIDIA_BASE = (
  process.env.NVIDIA_BASE || "https://integrate.api.nvidia.com/v1"
).replace(/\/$/, "");

async function nvError(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string; error?: { message?: string } };
    return b.error?.message ?? b.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function nvidiaChat({
  apiKey, model, system, prompt, maxTokens = 2048,
}: {
  apiKey: string; model: string; system?: string; prompt: string; maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(await nvError(res));
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (data.choices?.[0]?.message?.content ?? "").trim(),
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

const g = globalThis as unknown as { __nvModels?: { at: number; ids: string[] } };
const MODELS_TTL_MS = 6 * 60 * 60 * 1000;

export async function listNvidiaModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (g.__nvModels && now - g.__nvModels.at < MODELS_TTL_MS) return g.__nvModels.ids;
  const res = await fetch(`${NVIDIA_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(await nvError(res));
  const data = (await res.json()) as { data?: { id: string }[] };
  const ids = (data.data ?? []).map((m) => m.id);
  g.__nvModels = { at: now, ids };
  return ids;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/nvidia.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/nvidia.ts tests/nvidia.test.ts
git commit -m "feat(ia): cliente NVIDIA NIM (OpenAI-compatible) + listado de modelos"
```

---

### Task 2: Capability classifier + curated model list

**Files:**
- Create: `lib/ai/nvidia-models.ts`
- Test: `tests/nvidia-models.test.ts`

**Interfaces:**
- Consumes: `listNvidiaModels` from `@/lib/nvidia`.
- Produces:
  - `type ModelCapability = "text" | "code" | "vision" | "embedding" | "rerank" | "safety" | "translate" | "other"`
  - `interface NvidiaModel { id: string; capability: ModelCapability; label: string }`
  - `classify(id: string): ModelCapability`
  - `const PICKER_CAPS: ModelCapability[]` (= `["text", "code", "vision"]`)
  - `curatedModels(apiKey: string): Promise<NvidiaModel[]>` (only `PICKER_CAPS`, sorted)

- [ ] **Step 1: Write the failing test**

```ts
// tests/nvidia-models.test.ts
import { describe, it, expect, vi } from "vitest";
import { classify, curatedModels } from "@/lib/ai/nvidia-models";

describe("classify", () => {
  it("clasifica por patrones de id", () => {
    expect(classify("meta/llama-3.3-70b-instruct")).toBe("text");
    expect(classify("nvidia/nv-embedqa-e5-v5")).toBe("embedding");
    expect(classify("baai/bge-m3")).toBe("embedding");
    expect(classify("meta/llama-3.2-90b-vision-instruct")).toBe("vision");
    expect(classify("nvidia/vila")).toBe("vision");
    expect(classify("mistralai/codestral-22b-instruct-v0.1")).toBe("code");
    expect(classify("bigcode/starcoder2-15b")).toBe("code");
    expect(classify("meta/llama-guard-4-12b")).toBe("safety");
    expect(classify("nvidia/nemotron-4-340b-reward")).toBe("safety");
    expect(classify("nvidia/riva-translate-4b-instruct")).toBe("translate");
    expect(classify("totally/unknown-model-xyz")).toBe("other");
  });
});

describe("curatedModels", () => {
  it("solo expone text/code/vision, ordenado", async () => {
    vi.spyOn(await import("@/lib/nvidia"), "listNvidiaModels").mockResolvedValue([
      "meta/llama-3.3-70b-instruct",
      "nvidia/nv-embedqa-e5-v5",       // embedding → oculto
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-guard-4-12b",        // safety → oculto
    ]);
    const out = await curatedModels("k");
    expect(out.map((m) => m.id)).toEqual([
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-3.3-70b-instruct",
    ]);
    expect(out.every((m) => ["text", "code", "vision"].includes(m.capability))).toBe(true);
    expect(out[0].label).toBe("llama-3.2-90b-vision-instruct");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nvidia-models.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/nvidia-models'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/ai/nvidia-models.ts
// Clasificador estático de los modelos de NVIDIA NIM por capacidad. La API no
// tipa los modelos (solo id/owned_by), así que clasificamos por patrón de id.
import { listNvidiaModels } from "@/lib/nvidia";

export type ModelCapability =
  | "text" | "code" | "vision" | "embedding" | "rerank" | "safety" | "translate" | "other";

export interface NvidiaModel { id: string; capability: ModelCapability; label: string; }

export const PICKER_CAPS: ModelCapability[] = ["text", "code", "vision"];

// Orden importa: safety y embedding se chequean antes que text para no
// clasificar "nemoguard...instruct" o "...embed...instruct" como text.
export function classify(id: string): ModelCapability {
  const s = id.toLowerCase();
  if (/guard|content-safety|topic-control|safety|reward|nemoguard|gliner-pii/.test(s)) return "safety";
  if (/embed|bge-|arctic-embed|nvclip/.test(s)) return "embedding";
  if (/rerank|reranker/.test(s)) return "rerank";
  if (/riva-translate/.test(s)) return "translate";
  if (/vision|-vl-|vila|neva|deplot|fuyu|kosmos|paligemma|nemoretriever-parse|nemotron-parse|nemoretriever|cosmos-reason|omni|multimodal/.test(s)) return "vision";
  if (/code|codestral|codegemma|starcoder|granite-\d+b-code|embedcode|dracarys/.test(s)) return "code";
  if (/instruct|chat|nemotron|mistral|mixtral|qwen|gemma|phi-|llama|deepseek|glm|jamba|yi-|solar|palmyra|minimax|kimi|step-|sarvam|zamba|granite|dbrx|seed-oss|stockmark/.test(s)) return "text";
  return "other";
}

export async function curatedModels(apiKey: string): Promise<NvidiaModel[]> {
  const ids = await listNvidiaModels(apiKey);
  return ids
    .map((id) => ({ id, capability: classify(id), label: id.split("/").pop() ?? id }))
    .filter((m) => PICKER_CAPS.includes(m.capability))
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/nvidia-models.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/nvidia-models.ts tests/nvidia-models.test.ts
git commit -m "feat(ia): clasificador de modelos NVIDIA por capacidad + lista curada"
```

---

### Task 3: NVIDIA `analysis` connector + registry

**Files:**
- Create: `lib/connectors/nvidia.ts`
- Modify: `lib/connectors/registry.ts` (import + array entry)
- Test: `tests/nvidia-connector.test.ts`

**Interfaces:**
- Consumes: `nvidiaChat` from `@/lib/nvidia`; `getUsage`/`incrementUsage`/`nextMonthlyReset` from `@/lib/quota`; `getConnectorConfig` from `./config`; `AnalysisConnector` etc. from `./types`.
- Produces: `nvidiaConnector: AnalysisConnector` with `id: "nvidia"`, config keys `NVIDIA_API_KEY`, `NVIDIA_MODEL_FAST`, `NVIDIA_MODEL_DEEP`. Constants `NVIDIA_DEFAULT_FAST = "meta/llama-3.3-70b-instruct"`, `NVIDIA_DEFAULT_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1"`, `NVIDIA_TOKEN_CAP = 5_000_000`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/nvidia-connector.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NVIDIA_API_KEY;
});

describe("nvidiaConnector", () => {
  it("test() sin key → ok con aviso de mock/fallback", async () => {
    const { nvidiaConnector } = await import("@/lib/connectors/nvidia");
    const r = await nvidiaConnector.test({});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/fallback|sin key/i);
  });

  it("test() con key hace un chat mínimo y reporta el modelo", async () => {
    vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat").mockResolvedValue({
      text: "OK", inputTokens: 1, outputTokens: 1,
    });
    const { nvidiaConnector } = await import("@/lib/connectors/nvidia");
    const r = await nvidiaConnector.test({ NVIDIA_API_KEY: "k" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("meta/llama-3.3-70b-instruct");
  });

  it("está registrado con categoría analysis", async () => {
    const { getConnector } = await import("@/lib/connectors/registry");
    const c = getConnector("nvidia");
    expect(c?.category).toBe("analysis");
    expect(c?.vendor).toBe("NVIDIA");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nvidia-connector.test.ts`
Expected: FAIL — `Cannot find module '@/lib/connectors/nvidia'`.

- [ ] **Step 3: Write the connector**

```ts
// lib/connectors/nvidia.ts
// Conector de análisis: NVIDIA NIM (categoría `analysis`). Proveedor primario de
// generación de texto asistida (redacción, NL→segmento, etc.) vía lib/ai/generate.
// Sin NVIDIA_API_KEY, el dispatcher cae a Gemini/Claude/SiliconFlow/heurística.
import type {
  AnalysisConnector, AnalysisResult, AnalysisTask, Config, ConnectorStatus, Quota, TestResult,
} from "./types";
import { getUsage, nextMonthlyReset } from "@/lib/quota";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { getConnectorConfig } from "./config";
import { nvidiaChat } from "@/lib/nvidia";

const ID = "nvidia";
export const NVIDIA_DEFAULT_FAST = "meta/llama-3.3-70b-instruct";
export const NVIDIA_DEFAULT_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
export const NVIDIA_TOKEN_CAP = 5_000_000;

export const nvidiaConnector: AnalysisConnector = {
  id: ID,
  name: "NVIDIA NIM",
  vendor: "NVIDIA",
  category: "analysis",
  description: "Generación de texto asistida (proveedor primario, 121 modelos).",
  docsUrl: "https://docs.api.nvidia.com",
  iconEmoji: "🟩",
  capabilities: [
    { id: "analysis.text_generation", label: "Generación de texto" },
    { id: "analysis.coding_qualitative", label: "Coding inductivo" },
  ],
  configSchema: [
    { key: "NVIDIA_API_KEY", label: "API Key", type: "secret", required: true, placeholder: "nvapi-…" },
    {
      key: "NVIDIA_MODEL_FAST", label: "Modelo rápido", type: "text", required: false,
      placeholder: NVIDIA_DEFAULT_FAST,
      help: "Modelo barato para redacción/segmento. Default: " + NVIDIA_DEFAULT_FAST,
    },
    {
      key: "NVIDIA_MODEL_DEEP", label: "Modelo profundo", type: "text", required: false,
      placeholder: NVIDIA_DEFAULT_DEEP,
      help: "Modelo grande para resúmenes/análisis. Default: " + NVIDIA_DEFAULT_DEEP,
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    if (!cfg.NVIDIA_API_KEY) {
      return { ok: true, message: "Sin key — el asistente usa fallback (Gemini/Claude/heurística)." };
    }
    const model = cfg.NVIDIA_MODEL_FAST || NVIDIA_DEFAULT_FAST;
    try {
      await nvidiaChat({ apiKey: cfg.NVIDIA_API_KEY, model, prompt: "Reply with exactly: OK", maxTokens: 8 });
      return { ok: true, message: `Conecta — modelo ${model}.` };
    } catch (e) {
      return { ok: false, message: `Error: ${(e as Error).message}` };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= NVIDIA_TOKEN_CAP ? "quota_exhausted" : "enabled";
  },

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    return {
      used: await getUsage(ID, projectId),
      limit: NVIDIA_TOKEN_CAP, unit: "tokens", period: "month", resetAt: nextMonthlyReset(),
    };
  },

  // El coding/sentiment real corre por el dispatcher (lib/ai/generate). Acá
  // mantenemos el contrato AnalysisConnector con un passthrough mínimo.
  async analyze(input: string | string[], task: AnalysisTask): Promise<AnalysisResult> {
    return { task, output: Array.isArray(input) ? input : [input] };
  },
};
```

- [ ] **Step 4: Register the connector**

In `lib/connectors/registry.ts`, add the import after the `siliconflowConnector` import (line 22):

```ts
import { nvidiaConnector } from "./nvidia";
```

And add `nvidiaConnector,` to the `connectors` array immediately after `siliconflowConnector,` (line 43).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/nvidia-connector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/nvidia.ts lib/connectors/registry.ts tests/nvidia-connector.test.ts
git commit -m "feat(conectores): conector NVIDIA NIM (analysis) + registro"
```

---

### Task 4: Central text dispatcher `generateAssist`

**Files:**
- Create: `lib/ai/generate.ts`
- Test: `tests/ai-generate.test.ts`

**Interfaces:**
- Consumes: `getConnectorConfig` from `@/lib/connectors/config`; `incrementUsage` from `@/lib/quota`; `nvidiaChat` from `@/lib/nvidia`; `generateGeminiText` from `@/lib/gemini`; `generateText` from `@/lib/anthropic`; `siliconflowChat`/`siliconflowModels` from `@/lib/siliconflow`; `NVIDIA_DEFAULT_FAST`/`NVIDIA_DEFAULT_DEEP` from `@/lib/connectors/nvidia`.
- Produces:
  - `type AssistTier = "fast" | "deep"`
  - `generateAssist({ system?: string; prompt: string; tier?: AssistTier; projectId: string; maxTokens?: number }): Promise<{ text: string; provider: string; model: string }>`
  - Throws only if **every** provider fails AND no `fallback` is provided. With `fallback` text, returns it as `{ provider: "heuristic" }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai-generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (const k of ["NVIDIA_API_KEY", "GOOGLE_AI_API_KEY", "ANTHROPIC_API_KEY", "SILICONFLOW_API_KEY"]) delete process.env[k];
});

describe("generateAssist", () => {
  it("usa NVIDIA primero cuando hay key", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    const nv = vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat")
      .mockResolvedValue({ text: "desde nvidia", inputTokens: 3, outputTokens: 4 });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1" });
    expect(r.provider).toBe("nvidia");
    expect(r.text).toBe("desde nvidia");
    expect(nv).toHaveBeenCalledOnce();
  });

  it("cae a Gemini si NVIDIA no tiene key", async () => {
    process.env.GOOGLE_AI_API_KEY = "gk";
    const gem = vi.spyOn(await import("@/lib/gemini"), "generateGeminiText")
      .mockResolvedValue({ text: "desde gemini" });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1" });
    expect(r.provider).toBe("google-ai");
    expect(gem).toHaveBeenCalledOnce();
  });

  it("tier deep usa NVIDIA_MODEL_DEEP", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    process.env.NVIDIA_MODEL_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
    const nv = vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat")
      .mockResolvedValue({ text: "x", inputTokens: 1, outputTokens: 1 });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", tier: "deep", projectId: "p1" });
    expect(r.model).toBe("nvidia/llama-3.1-nemotron-ultra-253b-v1");
    expect(nv.mock.calls[0][0].model).toBe("nvidia/llama-3.1-nemotron-ultra-253b-v1");
  });

  it("sin ninguna key y con fallback → devuelve heurística", async () => {
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1", fallback: "heur" });
    expect(r.provider).toBe("heuristic");
    expect(r.text).toBe("heur");
  });

  it("sin ninguna key y sin fallback → lanza", async () => {
    const { generateAssist } = await import("@/lib/ai/generate");
    await expect(generateAssist({ prompt: "hola", projectId: "p1" })).rejects.toThrow(/proveedor/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-generate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/generate'`.

- [ ] **Step 3: Write the dispatcher**

```ts
// lib/ai/generate.ts
// Dispatcher único de generación de texto asistida. Orden de proveedor:
// NVIDIA → Gemini → Claude → SiliconFlow → heurística (fallback del caller).
// Centraliza la elección de proveedor/modelo y el tracking de tokens por proyecto.
import { getConnectorConfig } from "@/lib/connectors/config";
import { incrementUsage } from "@/lib/quota";
import { nvidiaChat } from "@/lib/nvidia";
import { generateGeminiText } from "@/lib/gemini";
import { generateText } from "@/lib/anthropic";
import { siliconflowChat, siliconflowModels } from "@/lib/siliconflow";
import { NVIDIA_DEFAULT_FAST, NVIDIA_DEFAULT_DEEP } from "@/lib/connectors/nvidia";

export type AssistTier = "fast" | "deep";

export interface AssistInput {
  system?: string;
  prompt: string;
  tier?: AssistTier;
  projectId: string;
  maxTokens?: number;
  // Texto de respaldo (heurística local del caller) si ningún proveedor responde.
  fallback?: string;
}
export interface AssistResult { text: string; provider: string; model: string; }

const approx = (a: string, b: string) => Math.ceil((a.length + b.length) / 4);

export async function generateAssist(input: AssistInput): Promise<AssistResult> {
  const { system, prompt, tier = "fast", projectId, maxTokens } = input;

  // 1) NVIDIA
  const nv = await getConnectorConfig("nvidia");
  if (nv.NVIDIA_API_KEY) {
    const model =
      tier === "deep"
        ? nv.NVIDIA_MODEL_DEEP || NVIDIA_DEFAULT_DEEP
        : nv.NVIDIA_MODEL_FAST || NVIDIA_DEFAULT_FAST;
    try {
      const r = await nvidiaChat({ apiKey: nv.NVIDIA_API_KEY, model, system, prompt, maxTokens });
      if (r.text) {
        await incrementUsage("nvidia", r.inputTokens + r.outputTokens || approx(prompt, r.text), projectId);
        return { text: r.text, provider: "nvidia", model };
      }
    } catch { /* cae al siguiente */ }
  }

  // 2) Gemini
  const g = await getConnectorConfig("google-ai");
  if (g.GOOGLE_AI_API_KEY) {
    try {
      const r = await generateGeminiText({ apiKey: g.GOOGLE_AI_API_KEY, system, prompt, maxTokens });
      if (r.text) {
        await incrementUsage("google-ai", approx(prompt, r.text), projectId);
        return { text: r.text, provider: "google-ai", model: g.GOOGLE_AI_MODEL || "gemini-2.5-flash" };
      }
    } catch { /* cae */ }
  }

  // 3) Claude
  const c = await getConnectorConfig("claude-api");
  if (c.ANTHROPIC_API_KEY) {
    try {
      const model = c.ANTHROPIC_MODEL || "claude-sonnet-4-6";
      const r = await generateText({ apiKey: c.ANTHROPIC_API_KEY, system, prompt, model, maxTokens });
      if (r.text) {
        await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
        return { text: r.text, provider: "claude-api", model };
      }
    } catch { /* cae */ }
  }

  // 4) SiliconFlow
  const sf = await getConnectorConfig("siliconflow");
  if (sf.SILICONFLOW_API_KEY) {
    try {
      const model = siliconflowModels(sf.SILICONFLOW_MODELS)[0];
      const text = await siliconflowChat({ apiKey: sf.SILICONFLOW_API_KEY, model, system, prompt, maxTokens });
      if (text) {
        await incrementUsage("siliconflow", approx(prompt, text), projectId);
        return { text, provider: "siliconflow", model };
      }
    } catch { /* cae */ }
  }

  // 5) Heurística del caller
  if (input.fallback !== undefined) {
    return { text: input.fallback, provider: "heuristic", model: "local" };
  }
  throw new Error("No hay proveedor de IA configurado. Cargá NVIDIA, Gemini o Claude en Conectores.");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ai-generate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/generate.ts tests/ai-generate.test.ts
git commit -m "feat(ia): dispatcher generateAssist (NVIDIA primario, fallback en cadena)"
```

---

### Task 5: Route `segmentos` NL→SegmentQuery through the dispatcher

**Files:**
- Modify: `app/(dashboard)/segmentos/actions.ts` (lines ~20, ~93-129)
- Test: existing suite must still pass.

**Interfaces:**
- Consumes: `generateAssist` from `@/lib/ai/generate`.
- Produces: no new exports; behavior unchanged from the user's view (NL → editable `SegmentQuery`).

- [ ] **Step 1: Replace the Claude-only call**

In `app/(dashboard)/segmentos/actions.ts`:

Remove the import `import { generateText } from "@/lib/anthropic";` (line 20) and the `import { incrementUsage } ...` if it becomes unused. Add:

```ts
import { generateAssist } from "@/lib/ai/generate";
```

Replace the block that reads `claude-api` config and calls `generateText` (lines ~93-129). The current code hard-fails without a Claude key; the new code uses the dispatcher and only fails if **no** provider exists. Replace:

```ts
  const cfg = await getConnectorConfig("claude-api");
  const apiKey = cfg.ANTHROPIC_API_KEY;
  if (!apiKey) fail("Falta la API key de Claude. Cargala en Conectores → Claude API.");
  // …system/prompt building stays…
  let apiErr: string | null = null;
  try {
    const r = await generateText({ apiKey, system, prompt: `Descripción: ${prompt}`, maxTokens: 1024, model: cfg.ANTHROPIC_MODEL });
    text = r.text;
    await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
```

with (keep the same `system`/`prompt` building above; only the provider call changes):

```ts
  // system/prompt building stays exactly as before
  let apiErr: string | null = null;
  let text = "";
  try {
    const r = await generateAssist({ system, prompt: `Descripción: ${prompt}`, tier: "fast", projectId, maxTokens: 1024 });
    text = r.text;
```

Keep the rest of the `try/catch` (parsing the model output into a `SegmentQuery`, `apiErr` handling) unchanged. If the file previously declared `let text = "";` further up, do not redeclare it — adjust to a single declaration.

- [ ] **Step 2: Typecheck + run the related tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors; existing tests green. If `getConnectorConfig`/`incrementUsage`/`fail` become unused, remove those imports/usages to satisfy eslint.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/segmentos/actions.ts"
git commit -m "refactor(ia): segmentos NL→query usa generateAssist (NVIDIA primario)"
```

---

### Task 6: Route `templates` HTML/redaction assist through the dispatcher

**Files:**
- Modify: `app/(dashboard)/templates/actions.ts` (lines ~14-15, ~66-120)

**Interfaces:**
- Consumes: `generateAssist` from `@/lib/ai/generate`.
- Produces: unchanged behavior; the existing local-heuristic fallback (if any) is passed as `fallback`.

- [ ] **Step 1: Replace the Claude→Gemini chain**

Remove imports `generateText` (line 14) and `generateGeminiText` (line 15). Add:

```ts
import { generateAssist } from "@/lib/ai/generate";
```

Replace the two-key guard and the `usedClaude`/`generateText`/`generateGeminiText` blocks (lines ~66-120) with a single dispatcher call. Keep the `system`/`userPrompt` construction unchanged:

```ts
  // system + userPrompt building stays exactly as before
  let text = "";
  let providerMsg = "";
  try {
    const r = await generateAssist({ system, prompt: userPrompt, tier: "fast", projectId, maxTokens: 4096 });
    text = r.text;
    providerMsg = r.provider === "heuristic" ? "" : `Generado con ${r.provider}.`;
  } catch {
    return {
      ok: false, html: "",
      msg: "Configurá NVIDIA, Gemini o Claude en Conectores para usar el asistente.",
    };
  }
```

Keep the downstream HTML sanitization (`sanitizeEmailHtml`) and return shape unchanged, using `text` and `providerMsg`. Remove the now-unused `incrementUsage`/`getConnectorConfig` imports if nothing else in the file uses them (search the file first).

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/templates/actions.ts"
git commit -m "refactor(ia): asistente de plantillas usa generateAssist"
```

---

### Task 7: Route `publicaciones` text generation through the dispatcher

**Files:**
- Modify: `app/(dashboard)/publicaciones/actions.ts` (imports ~33-35; two text blocks ~98-124 and ~165-176). **Do not touch** the image block (~211-223) — Gemini image stays.

**Interfaces:**
- Consumes: `generateAssist` from `@/lib/ai/generate`.
- Produces: unchanged behavior for the two text actions (generate post text; improve ad text).

- [ ] **Step 1: Replace both Gemini→Claude text chains**

Remove `generateText` import (line 34) and the `generateGeminiText` name from line 33 (keep `generateGeminiImage` — still used by the image action). Add:

```ts
import { generateAssist } from "@/lib/ai/generate";
```

**Block A — generate post text (~98-124).** Replace the `getConnectorConfig("google-ai")`/`getConnectorConfig("claude-api")` + `if (google…) else if (claude…)` chain with:

```ts
  try {
    const r = await generateAssist({ system, prompt: userPrompt, tier: "fast", projectId, maxTokens: 1024 });
    const clean = r.text.replace(/^["“']|["”']$/g, "").trim();
    if (!clean) return { ok: false, text: "", msg: "No se obtuvo texto. Probá reformular." };
    return { ok: true, text: clean, msg: r.provider === "heuristic" ? "" : `Generado con ${r.provider}.` };
  } catch (e) {
    return { ok: false, text: "", msg: `Error al generar: ${(e as Error).message}` };
  }
```

**Block B — improve ad text (~163-176).** Replace its Gemini→Claude chain the same way, writing the model output into the existing `raw` variable:

```ts
  let raw = "";
  try {
    const r = await generateAssist({ system, prompt: userPrompt, tier: "fast", projectId, maxTokens: 1200 });
    raw = r.text;
  } catch (e) {
    return { ok: false, msg: `Error al mejorar: ${(e as Error).message}` };
  }
  // downstream parsing of `raw` stays unchanged
```

Leave the image-generation action and its `getConnectorConfig("google-ai")` untouched.

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/publicaciones/actions.ts"
git commit -m "refactor(ia): generación de texto de publicaciones usa generateAssist"
```

---

### Task 8: Add NVIDIA models to the ad-studio fan-out

**Files:**
- Modify: `lib/ad-proposals.ts` (imports ~5-8; `ModelRef` provider union; `modelRefs()` ~117-134; `callModel()` ~136-144)
- Test: `tests/ad-proposals.test.ts` (extend)

**Interfaces:**
- Consumes: `nvidiaChat` from `@/lib/nvidia`; `curatedModels` from `@/lib/ai/nvidia-models`; `NVIDIA_DEFAULT_FAST`/`NVIDIA_DEFAULT_DEEP` from `@/lib/connectors/nvidia`.
- Produces: NVIDIA entries in the existing `ModelRef[]` fan-out (one per configured/default NVIDIA model). `callModel` handles `provider === "nvidia"`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ad-proposals.test.ts`:

```ts
import { vi } from "vitest";

describe("ad-proposals + NVIDIA", () => {
  it("incluye los modelos NVIDIA configurados en el fan-out", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    process.env.NVIDIA_MODEL_FAST = "meta/llama-3.3-70b-instruct";
    process.env.NVIDIA_MODEL_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
    const { availableModels } = await import("@/lib/ad-proposals");
    const labels = await availableModels();
    expect(labels.some((l) => /llama-3.3-70b|nemotron-ultra/.test(JSON.stringify(l)))).toBe(true);
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_MODEL_FAST;
    delete process.env.NVIDIA_MODEL_DEEP;
  });
});
```

(Confirm the exact shape returned by `availableModels()` while implementing — assert on the model name field it actually returns.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ad-proposals.test.ts`
Expected: FAIL — no NVIDIA model in the list.

- [ ] **Step 3: Extend the fan-out**

In `lib/ad-proposals.ts`:

Add imports:

```ts
import { nvidiaChat } from "@/lib/nvidia";
import { NVIDIA_DEFAULT_FAST, NVIDIA_DEFAULT_DEEP } from "@/lib/connectors/nvidia";
```

Extend the `ModelRef` provider union to include `"nvidia"`.

In `modelRefs()`, **before** the SiliconFlow block (so NVIDIA leads the fan-out), add:

```ts
  const nv = await getConnectorConfig("nvidia");
  if (nv.NVIDIA_API_KEY) {
    const models = [
      nv.NVIDIA_MODEL_FAST || NVIDIA_DEFAULT_FAST,
      nv.NVIDIA_MODEL_DEEP || NVIDIA_DEFAULT_DEEP,
    ].filter((m, i, a) => a.indexOf(m) === i); // dedupe si fast === deep
    for (const m of models) {
      out.push({ provider: "nvidia", modelName: m, label: m.split("/").pop() ?? m, key: nv.NVIDIA_API_KEY });
    }
  }
```

In `callModel()`, add a branch:

```ts
  if (ref.provider === "nvidia") {
    return (await nvidiaChat({ apiKey: ref.key, model: ref.modelName, system, prompt, maxTokens: 2048 })).text;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ad-proposals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ad-proposals.ts tests/ad-proposals.test.ts
git commit -m "feat(ia): el estudio de avisos incluye modelos NVIDIA en el fan-out"
```

---

### Task 9: Tiered model picker UI (select fields in the config modal)

**Files:**
- Modify: `lib/connectors/types.ts` (`ConfigFieldType` + `ConfigField.options`)
- Modify: `lib/connectors/config.ts` (`FieldStatus` carries `options`; `configFieldStatus` passes them through)
- Modify: `lib/connectors/nvidia.ts` (mark the two model fields `type: "select"`)
- Modify: `app/(dashboard)/conectores/page.tsx` (populate NVIDIA select options from `curatedModels`)
- Modify: `components/connectors/config-modal.tsx` (render `<select>` for `select` fields)
- Test: manual (UI) — covered by typecheck + a unit on the options helper.

**Interfaces:**
- Consumes: `curatedModels` from `@/lib/ai/nvidia-models`; `getConnectorConfig` from `@/lib/connectors/config`.
- Produces: `ConfigField.options?: { value: string; label: string }[]`; `FieldStatus.options?`. Select fields render a dropdown that still submits via the same `name={f.key}` form field.

- [ ] **Step 1: Extend the field types**

In `lib/connectors/types.ts`:

```ts
export type ConfigFieldType = "text" | "secret" | "email" | "url" | "textarea" | "select";
```

Add to `ConfigField`:

```ts
  // Opciones para type:"select". Pueden venir estáticas o inyectarse en runtime
  // (ej. modelos NVIDIA traídos de /v1/models en la página de Conectores).
  options?: { value: string; label: string }[];
```

In `lib/connectors/config.ts`, add `options?: { value: string; label: string }[];` to the `FieldStatus` interface, and in `configFieldStatus` include `options: f.options` in the returned object.

- [ ] **Step 2: Mark NVIDIA model fields as select**

In `lib/connectors/nvidia.ts`, change `NVIDIA_MODEL_FAST` and `NVIDIA_MODEL_DEEP` field `type` from `"text"` to `"select"`. Leave `placeholder`/`help` as is (options get injected at render time; when empty, the modal falls back to free text — see Step 4).

- [ ] **Step 3: Render select in the modal**

In `components/connectors/config-modal.tsx`, replace the single `<input>` inside the `p.fields.map` with a conditional. When `f.type === "select"` **and** `f.options?.length`, render a `<select>`; otherwise the existing `<input>`:

```tsx
              {f.type === "select" && f.options && f.options.length > 0 ? (
                <select name={f.key} defaultValue="" className={input}>
                  <option value="">{f.hasValue ? "(configurado — sin cambios)" : "— elegí un modelo —"}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.key}
                  type={f.type === "secret" ? "password" : "text"}
                  placeholder={f.hasValue && f.type === "secret" ? "configurado ••••" : (f.placeholder ?? "")}
                  className={input}
                />
              )}
```

The empty-value option submits `""`, which `saveConnectorConfig` treats as "no change for secrets / clear for others" — for these optional text-like selects an empty submit leaves the stored value (the page re-injects current value as `hasValue`). Keep behavior simple: empty = keep default.

- [ ] **Step 4: Inject NVIDIA options in the Conectores page**

In `app/(dashboard)/conectores/page.tsx`, where each connector's `fields` are resolved via `configFieldStatus(connector.id)`, add a post-step for the NVIDIA connector that fills `options` on the two model fields from `curatedModels`:

```ts
import { curatedModels } from "@/lib/ai/nvidia-models";
import { getConnectorConfig } from "@/lib/connectors/config";

// after: const fields = await configFieldStatus(connector.id);
if (connector.id === "nvidia") {
  const cfg = await getConnectorConfig("nvidia");
  if (cfg.NVIDIA_API_KEY) {
    try {
      const models = await curatedModels(cfg.NVIDIA_API_KEY);
      const opts = models.map((m) => ({ value: m.id, label: `${m.label} (${m.capability})` }));
      for (const f of fields) {
        if (f.key === "NVIDIA_MODEL_FAST" || f.key === "NVIDIA_MODEL_DEEP") f.options = opts;
      }
    } catch { /* sin red / key inválida → el modal cae a input de texto */ }
  }
}
```

(Adapt to the page's actual variable name for the resolved fields array.)

- [ ] **Step 5: Typecheck + tests + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS — types clean, tests green, Next build succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/connectors/types.ts lib/connectors/config.ts lib/connectors/nvidia.ts "app/(dashboard)/conectores/page.tsx" components/connectors/config-modal.tsx
git commit -m "feat(conectores): selector tiered de modelos NVIDIA (rápido/profundo) en el modal"
```

---

### Task 10: Docs + env example

**Files:**
- Modify: `.env.example` (add `NVIDIA_API_KEY`, optional `NVIDIA_BASE`, `NVIDIA_MODEL_FAST`, `NVIDIA_MODEL_DEEP`)
- Modify: `AI-STRATEGY.md` (§3 Proveedores table: NVIDIA NIM as primary)
- Modify: `PROVIDERS.md` (note NVIDIA as the primary `analysis` provider)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add env keys**

Append to `.env.example` (no real values):

```
# NVIDIA NIM (proveedor primario de IA, OpenAI-compatible)
NVIDIA_API_KEY=
# NVIDIA_BASE=https://integrate.api.nvidia.com/v1
# NVIDIA_MODEL_FAST=meta/llama-3.3-70b-instruct
# NVIDIA_MODEL_DEEP=nvidia/llama-3.1-nemotron-ultra-253b-v1
```

- [ ] **Step 2: Update AI-STRATEGY.md §3 Proveedores**

Add a row at the top of the Proveedores table marking **NVIDIA NIM** as the default text provider (fast/deep tiers), with Claude/Gemini/SiliconFlow as fallback, and note the privacy rule is unchanged (third party → anonymization applies).

- [ ] **Step 3: Update PROVIDERS.md**

In the implemented-connectors note near the top, add NVIDIA NIM as the primary `analysis` provider (generación de texto), fallback chain documented.

- [ ] **Step 4: Commit**

```bash
git add .env.example AI-STRATEGY.md PROVIDERS.md
git commit -m "docs(ia): documenta NVIDIA NIM como proveedor primario + env example"
```

---

## Self-Review

**Spec coverage:**
- §3.1 client → Task 1 ✓
- §3.2 classifier/curated → Task 2 ✓
- §3.3 dispatcher → Task 4 ✓ (single-pick sites: Tasks 5-7)
- §3.4 connector → Task 3 ✓
- §3.5 tiered picker UI → Task 9 ✓
- §3.6 refactor call sites → Tasks 5-8 (ad-proposals kept as fan-out per its real semantics — a deliberate refinement of the spec's "all 4 through dispatcher"; the unified piece is the shared `lib/nvidia.ts` client) ✓
- §4 privacy → Task 10 docs; no PII path added (dispatcher only forwards caller-supplied prompts) ✓
- §5 out of scope (image/video, playground, deletions) → respected; `media-gen.ts` and image block untouched ✓
- §6 key handling → env + per-project config; Task 10 env example ✓
- §7 defaults → constants in Task 3, used in Task 4/8 ✓
- §8 testing → unit tests in Tasks 1-4, 8 ✓

**Type consistency:** `generateAssist` signature, `NvidiaModel`, `classify`, `curatedModels`, `nvidiaChat`, `NVIDIA_DEFAULT_FAST/DEEP`, `ConfigField.options`/`FieldStatus.options` used identically across tasks ✓

**Placeholder scan:** call-site line numbers are approximate (the executor confirms by reading the file); every code step shows complete code. No TBD/TODO ✓

## Notes for the executor

- Call-site line numbers drift; locate by the shown surrounding code, not the line number.
- After each refactor task, remove imports that became unused (eslint will flag them) — `getConnectorConfig`, `incrementUsage`, `generateText`, `generateGeminiText` where no longer referenced.
- The leaked NVIDIA key in the chat transcript must be **rotated** before this ships; load the new key via env or Conectores only.
