# Anuncios Meta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver mis anuncios de Meta Ads con preview real + rendimiento (lectura + pausar/activar) en Difusión, y previsualizar/crear las propuestas del Estudio como anuncios Meta reales (PAUSED).

**Architecture:** Capa fina mock-first sobre la Marketing API en `lib/meta-ads.ts` (separada de `lib/meta.ts`, que ya hace publicación orgánica). Galería y previews se renderizan server-side embebiendo el iframe propio de Meta; mutaciones por server actions. Token siempre server-only.

**Tech Stack:** Next.js (App Router, server components + server actions), TypeScript, Vitest, Tailwind. Graph API v21.0.

**Spec:** `docs/superpowers/specs/2026-06-11-anuncios-meta-design.md`

**Desviación respecto del spec:** para imágenes se usa `link_data.picture` (URL pública — la imagen generada en el Estudio ya es pública) en vez de `uploadAdImage→image_hash`. Solo el video requiere subida a `/advideos` (no acepta URL en `video_data`). Resultado: no hace falta `uploadAdImage`.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/meta-ads.ts` | Crear | Gestión de ads vía Marketing API, mock-first: listar, medir, preview, estado, campañas/conjuntos, subir video, armar creative, crear ad. |
| `lib/meta.ts` | Modificar | Extender la rama `ad` de `getInsights` (CPC, CPM, CPA, conversiones, frecuencia). |
| `tests/meta-ads.test.ts` | Crear | Unit tests de la lógica pura + modo mock. |
| `app/(dashboard)/publicaciones/actions.ts` | Modificar | Server actions: estado de ad, listar campañas/conjuntos, preview/crear desde propuesta. |
| `components/publicaciones/mis-anuncios.tsx` | Crear | Galería client: filtros (querystring) + AdCard + toggle estado. |
| `app/(dashboard)/difusion/page.tsx` | Modificar | Sección "Mis anuncios" (server fetch + filtros). |
| `components/publicaciones/ad-studio.tsx` | Modificar | Panel "Anuncio Meta": preview (todos los placements) + crear ad PAUSED. |

Convenciones del repo: helpers Graph propios en cada módulo (los de `meta.ts` no se exportan); patrón mock-first idéntico a `mockInsights` (sin token/cuenta → datos determinísticos); strings de UI en español rioplatense; estética por `DESIGN.md`.

Comando de tests: `npx vitest run <ruta>`.

---

## Task 1: Catálogo de formatos, tipos y helpers Graph

**Files:**
- Create: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { AD_FORMATS, type AdFormat } from "@/lib/meta-ads";

beforeAll(() => {
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.META_PAGE_ID;
});

describe("AD_FORMATS", () => {
  it("incluye los placements clave y no tiene duplicados", () => {
    expect(AD_FORMATS).toContain("MOBILE_FEED_STANDARD");
    expect(AD_FORMATS).toContain("INSTAGRAM_STORY");
    expect(AD_FORMATS).toContain("INSTAGRAM_REELS");
    expect(new Set(AD_FORMATS).size).toBe(AD_FORMATS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — `Cannot find module '@/lib/meta-ads'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts
// Gestión de anuncios de la cuenta propia vía Meta Marketing API. Server-only.
// Mock-first: sin META_ACCESS_TOKEN/META_AD_ACCOUNT_ID devuelve datos
// determinísticos (mismo patrón que lib/meta.ts) para correr sin credenciales.
import { getMetaConfig, type Metric } from "@/lib/meta";

const GRAPH = "https://graph.facebook.com/v21.0";

export type DatePreset = "today" | "yesterday" | "last_7d" | "last_30d" | "maximum";
export type AdStatusFilter = "all" | "active" | "paused";

// Catálogo completo de ad_format soportados por generatepreviews/previews.
// "Todos los placements" del Estudio = este set.
export const AD_FORMATS = [
  "DESKTOP_FEED_STANDARD",
  "MOBILE_FEED_STANDARD",
  "INSTAGRAM_STANDARD",
  "INSTAGRAM_STORY",
  "INSTAGRAM_REELS",
  "FACEBOOK_STORY",
  "FACEBOOK_REELS",
  "MARKETPLACE_MOBILE",
  "RIGHT_COLUMN_STANDARD",
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export type AdsMode = "mock" | "live";

export interface PreviewFrame {
  format: AdFormat;
  html: string;
}

function withAct(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Sufijo determinístico para ids mock (sin Date.now, igual que lib/meta.ts).
function idStamp(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const data = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Graph HTTP ${res.status}`);
  return data;
}

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Graph HTTP ${res.status}`);
  return data;
}

// Reexport para consumidores que solo arman la grilla de KPIs.
export type { Metric };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): catálogo de formatos, tipos y helpers Graph"
```

---

## Task 2: `computeAdMetrics` — KPIs derivados (CPC, CPM, CPA, conversiones)

**Files:**
- Modify: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar import y bloque
import { AD_FORMATS, computeAdMetrics, type InsightsRow } from "@/lib/meta-ads";

describe("computeAdMetrics", () => {
  const row: InsightsRow = {
    impressions: "10000",
    reach: "7000",
    frequency: "1.43",
    clicks: "200",
    ctr: "2",
    spend: "50",
    cpc: "0.25",
    cpm: "5",
    actions: [
      { action_type: "link_click", value: "200" },
      { action_type: "landing_page_view", value: "120" },
    ],
  };

  it("expone alcance/frecuencia/clics/CTR/gasto/CPC/CPM y calcula CPA+conversiones", () => {
    const m = computeAdMetrics(row, "link_click");
    const get = (label: string) => m.find((x) => x.label.startsWith(label))?.value;
    expect(get("Impresiones")).toBe(10000);
    expect(get("Alcance")).toBe(7000);
    expect(get("Frecuencia")).toBe(1.43);
    expect(get("Clics")).toBe(200);
    expect(get("CTR")).toBe(2);
    expect(get("Gasto")).toBe(50);
    expect(get("CPC")).toBe(0.25);
    expect(get("CPM")).toBe(5);
    expect(get("Conversiones")).toBe(200);
    expect(get("CPA")).toBeCloseTo(0.25, 5); // 50 / 200
  });

  it("CPA = 0 si no hay conversiones del resultado elegido", () => {
    const m = computeAdMetrics({ ...row, actions: [] }, "link_click");
    expect(m.find((x) => x.label.startsWith("CPA"))?.value).toBe(0);
    expect(m.find((x) => x.label.startsWith("Conversiones"))?.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — `computeAdMetrics` / `InsightsRow` no existen.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts — agregar
export interface InsightsAction {
  action_type: string;
  value: string;
}
export interface InsightsRow {
  ad_id?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  ctr?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  actions?: InsightsAction[];
}

// Resultado por defecto a contar como "conversión". link_click es el universal
// para objetivos de tráfico/encuesta (la org hace relevamiento, no compras).
export const DEFAULT_RESULT_ACTION = "link_click";

function actionValue(row: InsightsRow, type: string): number {
  return num(row.actions?.find((a) => a.action_type === type)?.value);
}

// Traduce una fila de insights (level=ad) a la grilla de KPIs de la card.
// CPA y conversiones se derivan del action_type elegido (no vienen directos).
export function computeAdMetrics(row: InsightsRow, resultAction = DEFAULT_RESULT_ACTION): Metric[] {
  const spend = num(row.spend);
  const conversions = actionValue(row, resultAction);
  const cpa = conversions > 0 ? spend / conversions : 0;
  return [
    { label: "Impresiones", value: num(row.impressions) },
    { label: "Alcance", value: num(row.reach) },
    { label: "Frecuencia", value: num(row.frequency) },
    { label: "Clics", value: num(row.clicks) },
    { label: "CTR (%)", value: num(row.ctr) },
    { label: "Gasto (USD)", value: spend },
    { label: "CPC (USD)", value: num(row.cpc) },
    { label: "CPM (USD)", value: num(row.cpm) },
    { label: "Conversiones", value: conversions },
    { label: "CPA (USD)", value: Math.round(cpa * 100) / 100 },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): computeAdMetrics (CPC/CPM/CPA/conversiones desde actions)"
```

---

## Task 3: `buildCreativeSpec` — object_story_spec (imagen vía picture, video vía video_id)

**Files:**
- Modify: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar
import { buildCreativeSpec, type ProposalMedia } from "@/lib/meta-ads";

describe("buildCreativeSpec", () => {
  const base = { pageId: "PAGE", link: "https://ej.com", cta: "LEARN_MORE", message: "Sumate" };

  it("imagen → link_data con picture (URL) y call_to_action", () => {
    const media: ProposalMedia = { imageUrl: "https://cdn/x.png" };
    const spec = buildCreativeSpec(media, base);
    expect(spec.page_id).toBe("PAGE");
    expect(spec.link_data?.picture).toBe("https://cdn/x.png");
    expect(spec.link_data?.link).toBe("https://ej.com");
    expect(spec.link_data?.message).toBe("Sumate");
    expect(spec.link_data?.call_to_action).toEqual({ type: "LEARN_MORE", value: { link: "https://ej.com" } });
    expect(spec.video_data).toBeUndefined();
  });

  it("video → video_data con video_id (prioriza video sobre imagen)", () => {
    const media: ProposalMedia = { imageUrl: "https://cdn/x.png", videoId: "VID123" };
    const spec = buildCreativeSpec(media, base);
    expect(spec.video_data?.video_id).toBe("VID123");
    expect(spec.video_data?.call_to_action?.type).toBe("LEARN_MORE");
    expect(spec.link_data).toBeUndefined();
  });

  it("lanza si no hay ni imagen ni video", () => {
    expect(() => buildCreativeSpec({}, base)).toThrow(/imagen o video/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — `buildCreativeSpec` / `ProposalMedia` no existen.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts — agregar
export interface ProposalMedia {
  imageUrl?: string;
  videoUrl?: string;
  videoId?: string; // resultado de uploadAdVideo (requerido para usar video)
}

export interface CreativeSpec {
  page_id: string;
  link_data?: {
    message?: string;
    link: string;
    picture?: string;
    call_to_action?: { type: string; value: { link: string } };
  };
  video_data?: {
    message?: string;
    video_id: string;
    image_url?: string;
    call_to_action?: { type: string; value: { link: string } };
  };
}

export interface CreativeContext {
  pageId: string;
  link: string;
  cta: string; // CALL_TO_ACTION type, ej "LEARN_MORE"
  message?: string;
}

// Arma el object_story_spec. Si hay videoId usa video_data; si no, imagen por
// URL pública (link_data.picture) — evita subir la imagen a /adimages.
export function buildCreativeSpec(media: ProposalMedia, ctx: CreativeContext): CreativeSpec {
  const cta = { type: ctx.cta, value: { link: ctx.link } };
  if (media.videoId) {
    return {
      page_id: ctx.pageId,
      video_data: {
        message: ctx.message,
        video_id: media.videoId,
        ...(media.imageUrl ? { image_url: media.imageUrl } : {}),
        call_to_action: cta,
      },
    };
  }
  if (media.imageUrl) {
    return {
      page_id: ctx.pageId,
      link_data: { message: ctx.message, link: ctx.link, picture: media.imageUrl, call_to_action: cta },
    };
  }
  throw new Error("La propuesta necesita una imagen o video para armar el anuncio.");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): buildCreativeSpec (object_story_spec imagen/video)"
```

---

## Task 4: `listMyAds` — listado + insights, mock-first

**Files:**
- Modify: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar
import { listMyAds } from "@/lib/meta-ads";

describe("listMyAds (mock, sin credenciales)", () => {
  it("devuelve filas determinísticas con todos los KPIs y mode mock", async () => {
    const a = await listMyAds({ datePreset: "last_7d", status: "all" });
    const b = await listMyAds({ datePreset: "last_7d", status: "all" });
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b); // determinístico
    expect(a[0].mode).toBe("mock");
    const labels = a[0].metrics.map((m) => m.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Impresiones", "CPC (USD)", "CPM (USD)", "CPA (USD)", "Conversiones", "Frecuencia"]),
    );
  });

  it("filtra por estado", async () => {
    const activos = await listMyAds({ datePreset: "last_7d", status: "active" });
    expect(activos.every((r) => r.status === "ACTIVE")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — `listMyAds` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts — agregar
export interface AdRow {
  id: string;
  name: string;
  status: string; // configured status (ACTIVE | PAUSED | ...)
  effectiveStatus: string; // effective_status de Meta
  campaign?: string;
  adset?: string;
  metrics: Metric[];
  mode: AdsMode;
}

interface AdNode {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset?: { name?: string; campaign?: { name?: string } };
}

function matchesStatus(status: string, filter: AdStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "ACTIVE";
  return status !== "ACTIVE";
}

// 3 filas mock determinísticas (1 pausada) con KPIs reales calculados.
function mockAds(status: AdStatusFilter): AdRow[] {
  const defs = [
    { id: "mock-ad-1", name: "Encuesta seguridad · video", status: "ACTIVE" },
    { id: "mock-ad-2", name: "Encuesta servicios · imagen", status: "ACTIVE" },
    { id: "mock-ad-3", name: "Invitación general", status: "PAUSED" },
  ];
  return defs
    .filter((d) => matchesStatus(d.status, status))
    .map((d) => {
      const seed = Math.abs([...d.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
      const imp = 2000 + (seed % 8000);
      const clicks = Math.round(imp * 0.03);
      const spend = Math.round(clicks * 0.2 * 100) / 100;
      const row: InsightsRow = {
        impressions: String(imp),
        reach: String(Math.round(imp * 0.7)),
        frequency: String(Math.round((imp / (imp * 0.7)) * 100) / 100),
        clicks: String(clicks),
        ctr: String(Math.round((clicks / imp) * 1000) / 10),
        spend: String(spend),
        cpc: String(clicks ? Math.round((spend / clicks) * 100) / 100 : 0),
        cpm: String(Math.round((spend / imp) * 1000 * 100) / 100),
        actions: [{ action_type: "link_click", value: String(clicks) }],
      };
      return {
        id: d.id,
        name: d.name,
        status: d.status,
        effectiveStatus: d.status,
        campaign: "Campaña (mock)",
        adset: "Conjunto (mock)",
        metrics: computeAdMetrics(row),
        mode: "mock" as const,
      };
    });
}

export async function listMyAds(opts: { datePreset?: DatePreset; status?: AdStatusFilter } = {}): Promise<AdRow[]> {
  const datePreset = opts.datePreset ?? "last_7d";
  const status = opts.status ?? "all";
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return mockAds(status);
  const acct = withAct(adAccountId);
  try {
    const adsData = await graphGet(`${acct}/ads`, {
      fields: "id,name,status,effective_status,adset{name,campaign{name}}",
      limit: "200",
      access_token: token,
    });
    const insData = await graphGet(`${acct}/insights`, {
      level: "ad",
      date_preset: datePreset,
      fields: "ad_id,impressions,reach,frequency,clicks,ctr,spend,cpc,cpm,actions",
      limit: "500",
      access_token: token,
    });
    const byAd = new Map<string, InsightsRow>();
    for (const r of (insData.data as InsightsRow[] | undefined) ?? []) {
      if (r.ad_id) byAd.set(r.ad_id, r);
    }
    const out: AdRow[] = [];
    for (const a of (adsData.data as AdNode[] | undefined) ?? []) {
      const st = a.status ?? "PAUSED";
      if (!matchesStatus(st, status)) continue;
      const id = a.id ?? "";
      out.push({
        id,
        name: a.name ?? id,
        status: st,
        effectiveStatus: a.effective_status ?? st,
        campaign: a.adset?.campaign?.name,
        adset: a.adset?.name,
        metrics: computeAdMetrics(byAd.get(id) ?? {}),
        mode: "live",
      });
    }
    return out;
  } catch {
    return mockAds(status);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): listMyAds (ads + insights level=ad), mock-first"
```

---

## Task 5: `setAdStatus`, `getAdPreview`, `listCampaigns`, `listAdsets` — mock-first

**Files:**
- Modify: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar
import { setAdStatus, getAdPreview, listCampaigns, listAdsets } from "@/lib/meta-ads";

describe("acciones de lectura/estado (mock)", () => {
  it("setAdStatus devuelve ok + mock", async () => {
    const r = await setAdStatus("mock-ad-1", "PAUSED");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.status).toBe("PAUSED");
  });

  it("getAdPreview devuelve un frame por formato pedido", async () => {
    const frames = await getAdPreview("mock-ad-1", ["MOBILE_FEED_STANDARD", "INSTAGRAM_STORY"]);
    expect(frames.map((f) => f.format)).toEqual(["MOBILE_FEED_STANDARD", "INSTAGRAM_STORY"]);
    expect(frames[0].html).toContain("Conectá Meta"); // placeholder honesto en mock
  });

  it("listCampaigns / listAdsets devuelven opciones mock", async () => {
    const camps = await listCampaigns();
    expect(camps[0].id).toBeTruthy();
    const adsets = await listAdsets(camps[0].id);
    expect(adsets[0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts — agregar
export interface StatusResult {
  ok: boolean;
  mode: AdsMode;
  status: "ACTIVE" | "PAUSED";
  error?: string;
}
export interface NamedRef {
  id: string;
  name: string;
}

const MOCK_PREVIEW_HTML =
  '<div style="font-family:system-ui;padding:16px;color:#71717a;font-size:13px;border:1px dashed #d4d4d8;border-radius:8px">Conectá Meta (Conectores → Meta) para ver el preview real del anuncio.</div>';

export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<StatusResult> {
  const { token } = await getMetaConfig();
  if (!token || !adId) return { ok: true, mode: "mock", status };
  try {
    await graphPost(adId, { status, access_token: token });
    return { ok: true, mode: "live", status };
  } catch (e) {
    return { ok: false, mode: "live", status, error: (e as Error).message };
  }
}

export async function getAdPreview(adId: string, formats: AdFormat[]): Promise<PreviewFrame[]> {
  const { token } = await getMetaConfig();
  if (!token || !adId) return formats.map((format) => ({ format, html: MOCK_PREVIEW_HTML }));
  const out: PreviewFrame[] = [];
  for (const format of formats) {
    try {
      const data = await graphGet(`${adId}/previews`, { ad_format: format, access_token: token });
      const body = ((data.data as { body?: string }[] | undefined)?.[0]?.body) ?? "";
      out.push({ format, html: body || MOCK_PREVIEW_HTML });
    } catch {
      out.push({ format, html: MOCK_PREVIEW_HTML });
    }
  }
  return out;
}

export async function listCampaigns(): Promise<NamedRef[]> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return [{ id: "mock-camp-1", name: "Campaña (mock)" }];
  try {
    const data = await graphGet(`${withAct(adAccountId)}/campaigns`, {
      fields: "id,name,status",
      limit: "100",
      access_token: token,
    });
    return ((data.data as NamedRef[] | undefined) ?? []).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
  }
}

export async function listAdsets(campaignId: string): Promise<NamedRef[]> {
  const { token } = await getMetaConfig();
  if (!token || !campaignId) return [{ id: "mock-adset-1", name: "Conjunto (mock)" }];
  try {
    const data = await graphGet(`${campaignId}/adsets`, {
      fields: "id,name,status",
      limit: "100",
      access_token: token,
    });
    return ((data.data as NamedRef[] | undefined) ?? []).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): setAdStatus, getAdPreview, listCampaigns/listAdsets (mock-first)"
```

---

## Task 6: `uploadAdVideo`, `previewProposal`, `createCampaign`, `createAdset`, `createAdFromProposal` — mock-first

**Files:**
- Modify: `lib/meta-ads.ts`
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar
import {
  uploadAdVideo,
  previewProposal,
  createCampaign,
  createAdset,
  createAdFromProposal,
} from "@/lib/meta-ads";

describe("creación / preview de propuesta (mock)", () => {
  const spec = buildCreativeSpec({ imageUrl: "https://cdn/x.png" }, {
    pageId: "PAGE", link: "https://ej.com", cta: "LEARN_MORE", message: "Sumate",
  });

  it("uploadAdVideo devuelve videoId mock", async () => {
    const r = await uploadAdVideo("https://cdn/v.mp4");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.videoId).toBeTruthy();
  });

  it("previewProposal devuelve un frame por formato (placeholder en mock)", async () => {
    const frames = await previewProposal(spec, ["MOBILE_FEED_STANDARD"]);
    expect(frames[0].format).toBe("MOBILE_FEED_STANDARD");
    expect(frames[0].html).toContain("Conectá Meta");
  });

  it("createCampaign / createAdset / createAdFromProposal devuelven ids mock", async () => {
    const c = await createCampaign({ name: "C", objective: "OUTCOME_TRAFFIC" });
    expect(c.id).toBeTruthy();
    const a = await createAdset({ campaignId: c.id, name: "A", dailyBudgetUsd: 5, days: 7, countries: ["AR"], nowMs: 0 });
    expect(a.id).toBeTruthy();
    const ad = await createAdFromProposal({ adsetId: a.id, spec, name: "Ad" });
    expect(ad.ok).toBe(true);
    expect(ad.id).toBeTruthy();
    expect(ad.mode).toBe("mock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/meta-ads.ts — agregar
export interface VideoUploadResult {
  ok: boolean;
  mode: AdsMode;
  videoId?: string;
  error?: string;
}
export interface CreateAdResult {
  ok: boolean;
  mode: AdsMode;
  id?: string;
  error?: string;
}

// Sube un video por URL a /advideos. No esperamos el procesamiento completo:
// para preview/creación PAUSED, Meta acepta el video_id apenas creado.
export async function uploadAdVideo(url: string): Promise<VideoUploadResult> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId || !url) return { ok: true, mode: "mock", videoId: `mock-vid-${idStamp(url)}` };
  try {
    const data = await graphPost(`${withAct(adAccountId)}/advideos`, { file_url: url, access_token: token });
    return { ok: true, mode: "live", videoId: String(data.id ?? "") };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}

export async function previewProposal(spec: CreativeSpec, formats: AdFormat[]): Promise<PreviewFrame[]> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return formats.map((format) => ({ format, html: MOCK_PREVIEW_HTML }));
  const creative = JSON.stringify({ object_story_spec: spec });
  const out: PreviewFrame[] = [];
  for (const format of formats) {
    try {
      const data = await graphGet(`${withAct(adAccountId)}/generatepreviews`, {
        creative,
        ad_format: format,
        access_token: token,
      });
      const body = ((data.data as { body?: string }[] | undefined)?.[0]?.body) ?? "";
      out.push({ format, html: body || MOCK_PREVIEW_HTML });
    } catch {
      out.push({ format, html: MOCK_PREVIEW_HTML });
    }
  }
  return out;
}

export async function createCampaign(input: { name: string; objective: string }): Promise<{ id: string }> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { id: `mock-camp-${idStamp(input.name)}` };
  const data = await graphPost(`${withAct(adAccountId)}/campaigns`, {
    name: input.name,
    objective: input.objective,
    status: "PAUSED",
    special_ad_categories: "[]",
    access_token: token,
  });
  return { id: String(data.id ?? "") };
}

export async function createAdset(input: {
  campaignId: string;
  name: string;
  dailyBudgetUsd: number;
  days: number;
  countries: string[];
  nowMs: number;
}): Promise<{ id: string }> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { id: `mock-adset-${idStamp(input.name)}` };
  const endTime = Math.floor((input.nowMs + input.days * 86_400_000) / 1000);
  const data = await graphPost(`${withAct(adAccountId)}/adsets`, {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: String(Math.round(input.dailyBudgetUsd * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting: JSON.stringify({ geo_locations: { countries: input.countries } }),
    end_time: String(endTime),
    status: "PAUSED",
    access_token: token,
  });
  return { id: String(data.id ?? "") };
}

// Crea el adcreative + ad en estado PAUSED dentro del conjunto elegido.
export async function createAdFromProposal(input: {
  adsetId: string;
  spec: CreativeSpec;
  name: string;
}): Promise<CreateAdResult> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { ok: true, mode: "mock", id: `mock-ad-${idStamp(input.name)}` };
  const acct = withAct(adAccountId);
  try {
    const creative = await graphPost(`${acct}/adcreatives`, {
      name: `${input.name} · creative`,
      object_story_spec: JSON.stringify(input.spec),
      access_token: token,
    });
    const ad = await graphPost(`${acct}/ads`, {
      name: input.name,
      adset_id: input.adsetId,
      creative: JSON.stringify({ creative_id: String(creative.id) }),
      status: "PAUSED",
      access_token: token,
    });
    return { ok: true, mode: "live", id: String(ad.id ?? "") };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/meta-ads.ts tests/meta-ads.test.ts
git commit -m "feat(meta-ads): uploadAdVideo, previewProposal y creación de ad PAUSED (mock-first)"
```

---

## Task 7: Extender la rama `ad` de `getInsights` (CPC/CPM/CPA/frecuencia)

Mantiene consistente el reporte puntual existente de Difusión con la galería. Reusa `computeAdMetrics`.

**Files:**
- Modify: `lib/meta.ts:198-218` (rama `kind === "ad"`) y `lib/meta.ts:251-262` (mock de ad)
- Test: `tests/meta-ads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-ads.test.ts — agregar
import { getInsights } from "@/lib/meta";

describe("getInsights ad (mock) — KPIs ampliados", () => {
  it("incluye CPC/CPM/CPA/Frecuencia además de los básicos", async () => {
    const r = await getInsights("ad", "algun-ad");
    expect(r.ok).toBe(true);
    const labels = r.metrics.map((m) => m.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Impresiones", "Clics", "CPC (USD)", "CPM (USD)", "CPA (USD)", "Frecuencia"]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/meta-ads.test.ts`
Expected: FAIL — el mock de ad actual no trae CPC/CPM/CPA/Frecuencia.

- [ ] **Step 3: Write minimal implementation**

En `lib/meta.ts`, importar el helper y reusarlo. Agregar arriba (debajo de los imports):

```ts
import { computeAdMetrics, type InsightsRow } from "@/lib/meta-ads";
```

Reemplazar la rama `if (kind === "ad")` dentro de `getInsights` (actual `lib/meta.ts:198-218`) por:

```ts
    if (kind === "ad") {
      const res = await fetch(
        `${GRAPH}/${id}/insights?fields=impressions,reach,frequency,clicks,ctr,spend,cpc,cpm,actions&access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as {
        data?: InsightsRow[];
        error?: { message?: string };
      };
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      return { ok: true, mode: "live", metrics: computeAdMetrics(data.data?.[0] ?? {}) };
    }
```

Reemplazar la rama `if (kind === "ad")` dentro de `mockInsights` (actual `lib/meta.ts:251-262`) por:

```ts
  if (kind === "ad") {
    const spend = Math.round(clicks * 0.12 * 100) / 100;
    const row: InsightsRow = {
      impressions: String(imp),
      reach: String(reach),
      frequency: String(Math.round((imp / reach) * 100) / 100),
      clicks: String(clicks),
      ctr: String(Math.round((clicks / imp) * 1000) / 10),
      spend: String(spend),
      cpc: String(clicks ? Math.round((spend / clicks) * 100) / 100 : 0),
      cpm: String(Math.round((spend / imp) * 1000 * 100) / 100),
      actions: [{ action_type: "link_click", value: String(clicks) }],
    };
    return { ok: true, mode: "mock", metrics: computeAdMetrics(row) };
  }
```

> Nota: `import type` evita ciclos en runtime; `computeAdMetrics` es un valor, pero `meta-ads.ts` solo importa *tipos* de `meta.ts` salvo `getMetaConfig` (función). El ciclo `meta ↔ meta-ads` es seguro porque ambos lados resuelven en runtime async; si ESLint marca el ciclo, mover `computeAdMetrics`/`InsightsRow` no es necesario (Next/SWC lo maneja). Verificar con el build en el Step 4.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/meta-ads.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipo. Si `tsc` marca ciclo de tipos, no es bloqueante (son solo tipos); si el build de Next falla por ciclo de runtime, extraer `computeAdMetrics`+`InsightsRow` a `lib/meta-insights.ts` e importarlo desde ambos.

- [ ] **Step 5: Commit**

```bash
git add lib/meta.ts tests/meta-ads.test.ts
git commit -m "feat(meta): getInsights ad reusa computeAdMetrics (CPC/CPM/CPA/frecuencia)"
```

---

## Task 8: Server actions de anuncios

**Files:**
- Modify: `app/(dashboard)/publicaciones/actions.ts` (agregar al final)

No hay tests unitarios (requieren auth/DB); se verifican en las tareas de UI. Mantener el patrón `requireMember("editor")` + `logAudit`.

- [ ] **Step 1: Agregar imports y actions**

Al bloque de imports de `lib/meta-ads`:

```ts
import {
  listMyAds,
  setAdStatus,
  listCampaigns,
  listAdsets,
  uploadAdVideo,
  buildCreativeSpec,
  previewProposal,
  createCampaign,
  createAdset,
  createAdFromProposal,
  AD_FORMATS,
  type AdRow,
  type DatePreset,
  type AdStatusFilter,
  type ProposalMedia,
  type PreviewFrame,
} from "@/lib/meta-ads";
import { getMetaConfig } from "@/lib/meta";
import type { Proposal } from "@/lib/ad-proposals";
```

Al final del archivo:

```ts
// ── Anuncios Meta (galería + estudio) ───────────────────────────────────

// Lista mis ads para la galería de Difusión (lectura).
export async function listarMisAnuncios(
  datePreset: DatePreset,
  status: AdStatusFilter,
): Promise<AdRow[]> {
  await requireMember("editor");
  return listMyAds({ datePreset, status });
}

// Pausa/activa un ad. Activar puede empezar a gastar (confirmación en UI).
export async function cambiarEstadoAd(
  adId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<{ ok: boolean; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  if (!adId) return { ok: false, msg: "Falta el ad." };
  const r = await setAdStatus(adId, status);
  if (!r.ok) return { ok: false, msg: r.error ?? "No se pudo cambiar el estado." };
  await logAudit({
    action: "ad.status",
    projectId,
    actor: await actorEmail(),
    entity_type: "ad",
    entity_id: adId,
    details: { status, mode: r.mode },
  });
  revalidatePath("/difusion");
  return { ok: true, msg: status === "ACTIVE" ? "Anuncio activado." : "Anuncio pausado." };
}

export async function listarCampaigns(): Promise<{ id: string; name: string }[]> {
  await requireMember("editor");
  return listCampaigns();
}

export async function listarAdsets(campaignId: string): Promise<{ id: string; name: string }[]> {
  await requireMember("editor");
  if (!campaignId) return [];
  return listAdsets(campaignId);
}

// Sube el video (si hay) y arma el media para spec.
async function resolveMedia(media: ProposalMedia): Promise<{ media: ProposalMedia; error?: string }> {
  if (media.videoUrl && !media.videoId) {
    const up = await uploadAdVideo(media.videoUrl);
    if (!up.ok) return { media, error: up.error ?? "No se pudo subir el video." };
    return { media: { ...media, videoId: up.videoId } };
  }
  return { media };
}

function proposalMessage(p: Proposal): string {
  const fb = p.platforms?.facebook as Record<string, string | string[]> | undefined;
  const pick = (v?: string | string[]) => (Array.isArray(v) ? v.join("\n") : v ?? "");
  return pick(fb?.post) || pick(fb?.headline) || p.angle || "";
}

// Previsualiza una propuesta como anuncio Meta en los formatos pedidos.
export async function previsualizarPropuestaAd(
  proposal: Proposal,
  media: ProposalMedia,
  link: string,
  cta: string,
): Promise<{ ok: boolean; previews: PreviewFrame[]; msg: string }> {
  await requireMember("editor");
  const { pageId } = await getMetaConfig();
  if (!pageId) return { ok: false, previews: [], msg: "Falta la Página de Meta (Conectores → Meta)." };
  if (!/^https?:\/\//i.test(link)) return { ok: false, previews: [], msg: "Poné un link de destino válido." };
  const resolved = await resolveMedia(media);
  if (resolved.error) return { ok: false, previews: [], msg: resolved.error };
  try {
    const spec = buildCreativeSpec(resolved.media, { pageId, link, cta, message: proposalMessage(proposal) });
    const previews = await previewProposal(spec, [...AD_FORMATS]);
    return { ok: true, previews, msg: "Preview generado." };
  } catch (e) {
    return { ok: false, previews: [], msg: (e as Error).message };
  }
}

export interface CrearAnuncioInput {
  proposal: Proposal;
  media: ProposalMedia;
  link: string;
  cta: string;
  // Conjunto existente, o datos para crear campaña+conjunto nuevos.
  adsetId?: string;
  nuevo?: { campaignName: string; objective: string; adsetName: string; dailyBudgetUsd: number; days: number; pais: string };
}

// Crea el anuncio PAUSED desde una propuesta (elige o crea campaña/conjunto).
export async function crearAnuncioDesdePropuesta(
  input: CrearAnuncioInput,
): Promise<{ ok: boolean; id?: string; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  const { pageId } = await getMetaConfig();
  if (!pageId) return { ok: false, msg: "Falta la Página de Meta (Conectores → Meta)." };
  if (!/^https?:\/\//i.test(input.link)) return { ok: false, msg: "Link de destino inválido." };

  let adsetId = input.adsetId;
  if (!adsetId) {
    if (!input.nuevo) return { ok: false, msg: "Elegí un conjunto o creá uno nuevo." };
    const camp = await createCampaign({ name: input.nuevo.campaignName, objective: input.nuevo.objective });
    const adset = await createAdset({
      campaignId: camp.id,
      name: input.nuevo.adsetName,
      dailyBudgetUsd: input.nuevo.dailyBudgetUsd,
      days: input.nuevo.days,
      countries: [input.nuevo.pais.toUpperCase().slice(0, 2) || "AR"],
      nowMs: Date.now(),
    });
    adsetId = adset.id;
  }

  const resolved = await resolveMedia(input.media);
  if (resolved.error) return { ok: false, msg: resolved.error };

  try {
    const spec = buildCreativeSpec(resolved.media, {
      pageId,
      link: input.link,
      cta: input.cta,
      message: proposalMessage(input.proposal),
    });
    const r = await createAdFromProposal({ adsetId, spec, name: `Estudio · ${input.proposal.label}` });
    if (!r.ok) return { ok: false, msg: r.error ?? "No se pudo crear el anuncio." };
    await logAudit({
      action: "ad.create",
      projectId,
      actor: await actorEmail(),
      entity_type: "ad",
      entity_id: r.id,
      details: { from: "studio", mode: r.mode, adsetId },
    });
    return { ok: true, id: r.id, msg: `Anuncio creado en PAUSADO${r.mode === "mock" ? " (mock)" : ""}. Activalo en Difusión o en el Administrador de Meta.` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/publicaciones/actions.ts
git commit -m "feat(ads): server actions de galería, estado y crear/preview desde propuesta"
```

---

## Task 9: Componente `MisAnuncios` (galería client)

**Files:**
- Create: `components/publicaciones/mis-anuncios.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// components/publicaciones/mis-anuncios.tsx
"use client";

import { useState, useTransition } from "react";
import type { AdRow } from "@/lib/meta-ads";
import { buttonClass } from "@/components/ui/button";

type EstadoAction = (adId: string, status: "ACTIVE" | "PAUSED") => Promise<{ ok: boolean; msg: string }>;

// `previews` mapea adId → HTML del iframe (placement Feed). Vacío en mock/sin token.
export function MisAnuncios({
  ads,
  previews,
  estadoAction,
}: {
  ads: AdRow[];
  previews: Record<string, string>;
  estadoAction: EstadoAction;
}) {
  if (!ads.length) {
    return <p className="text-sm text-zinc-500">No hay anuncios para este período/estado.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} previewHtml={previews[ad.id]} estadoAction={estadoAction} />
      ))}
    </div>
  );
}

function AdCard({
  ad,
  previewHtml,
  estadoAction,
}: {
  ad: AdRow;
  previewHtml?: string;
  estadoAction: EstadoAction;
}) {
  const [status, setStatus] = useState(ad.status);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const active = status === "ACTIVE";

  function toggle() {
    const next = active ? "PAUSED" : "ACTIVE";
    if (next === "ACTIVE" && !confirm("Activar el anuncio puede empezar a gastar presupuesto. ¿Seguro?")) return;
    start(async () => {
      const r = await estadoAction(ad.id, next);
      setMsg(r.msg);
      if (r.ok) setStatus(next);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 shadow-[var(--shadow-rest)] dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{ad.name}</div>
          <div className="truncate text-xs text-zinc-500">
            {ad.campaign ?? "—"} · {ad.adset ?? "—"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              active
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {active ? "Activo" : "Pausado"}
          </span>
          <button type="button" onClick={toggle} disabled={pending} className={buttonClass("secondary", "sm")}>
            {pending ? "…" : active ? "Pausar" : "Activar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-zinc-100 dark:border-zinc-800">
          {previewHtml ? (
            <iframe
              title={`preview-${ad.id}`}
              sandbox="allow-scripts allow-same-origin allow-popups"
              srcDoc={previewHtml}
              className="h-[420px] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center p-4 text-center text-xs text-zinc-400">
              Conectá Meta (Conectores → Meta) para ver el preview real.
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 self-start">
          {ad.metrics.map((m) => (
            <div key={m.label} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {m.value.toLocaleString("es-AR")}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      {ad.mode === "mock" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">Datos de ejemplo (modo mock, sin credenciales de Meta).</p>
      )}
      {msg && <p className="text-[11px] text-zinc-500">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/publicaciones/mis-anuncios.tsx
git commit -m "feat(difusion): componente MisAnuncios (AdCard preview + KPIs + toggle estado)"
```

---

## Task 10: Sección "Mis anuncios" en Difusión

**Files:**
- Modify: `app/(dashboard)/difusion/page.tsx`

- [ ] **Step 1: Agregar imports**

```ts
import { listMyAds, getAdPreview, type DatePreset, type AdStatusFilter } from "@/lib/meta-ads";
import { MisAnuncios } from "@/components/publicaciones/mis-anuncios";
import { cambiarEstadoAd } from "../publicaciones/actions";
```

- [ ] **Step 2: Cargar datos en el server component**

Dentro de `DifusionPage`, después de `const insights = ...` (≈línea 58):

```ts
  const datePreset: DatePreset = (["today", "yesterday", "last_7d", "last_30d", "maximum"] as const).includes(
    params.periodo as DatePreset,
  )
    ? (params.periodo as DatePreset)
    : "last_7d";
  const adStatus: AdStatusFilter = (["all", "active", "paused"] as const).includes(params.estado as AdStatusFilter)
    ? (params.estado as AdStatusFilter)
    : "all";
  const misAds = await listMyAds({ datePreset, status: adStatus });
  // Preview placement fijo (Feed) para la galería; un frame por ad.
  const adPreviews: Record<string, string> = {};
  await Promise.all(
    misAds.map(async (ad) => {
      const frames = await getAdPreview(ad.id, ["MOBILE_FEED_STANDARD"]);
      adPreviews[ad.id] = frames[0]?.html ?? "";
    }),
  );
```

- [ ] **Step 3: Agregar la sección al JSX**

Antes del cierre `</div>` del contenedor principal (después de la sección "Reporte de rendimiento", ≈línea 206):

```tsx
      {/* ── Mis anuncios ──────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">🗂️ Mis anuncios</h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Período
              <select name="periodo" defaultValue={datePreset} className={inputCls}>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="last_7d">Últimos 7 días</option>
                <option value="last_30d">Últimos 30 días</option>
                <option value="maximum">Histórico</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Estado
              <select name="estado" defaultValue={adStatus} className={inputCls}>
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="paused">Pausados</option>
              </select>
            </label>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Filtrar
            </button>
          </form>
        </div>
        {!adsReady && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Falta la cuenta publicitaria en el conector Meta — se muestran datos de ejemplo.
          </p>
        )}
        <MisAnuncios ads={misAds} previews={adPreviews} estadoAction={cambiarEstadoAd} />
      </section>
```

- [ ] **Step 4: Verificación manual**

Run: `npx tsc --noEmit && npm run dev`
Abrir `/difusion`. Esperado (sin credenciales Meta): aparecen 3 cards mock con KPIs, badge Activo/Pausado, botón Pausar/Activar (toggle local + mensaje), placeholder de preview. Filtros período/estado recargan la lista (estado=active deja solo activos).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/difusion/page.tsx
git commit -m "feat(difusion): sección Mis anuncios (galería + filtros período/estado)"
```

---

## Task 11: Panel "Anuncio Meta" en el Estudio — preview

**Files:**
- Modify: `components/publicaciones/ad-studio.tsx` (paso 3) y `app/(dashboard)/publicaciones/page.tsx` (pasar las nuevas actions)

- [ ] **Step 1: Tipos de las nuevas actions en `ad-studio.tsx`**

Bajo los `type ...Action` existentes (≈línea 30):

```ts
import type { PreviewFrame, ProposalMedia } from "@/lib/meta-ads";

type PreviewAdAction = (
  proposal: Proposal,
  media: ProposalMedia,
  link: string,
  cta: string,
) => Promise<{ ok: boolean; previews: PreviewFrame[]; msg: string }>;
type CrearAdAction = (input: {
  proposal: Proposal;
  media: ProposalMedia;
  link: string;
  cta: string;
  adsetId?: string;
  nuevo?: { campaignName: string; objective: string; adsetName: string; dailyBudgetUsd: number; days: number; pais: string };
}) => Promise<{ ok: boolean; id?: string; msg: string }>;
type ListRefAction = () => Promise<{ id: string; name: string }[]>;
type ListAdsetsAction = (campaignId: string) => Promise<{ id: string; name: string }[]>;
```

Agregar a las props de `AdStudio` (interfaz del componente, ≈línea 86): `previewAdAction`, `crearAdAction`, `listCampaignsAction`, `listAdsetsAction` con esos tipos, y recibirlas en el destructuring.

- [ ] **Step 2: Estado del panel de anuncio (dentro de `AdStudio`)**

Junto a los otros `useState` (≈línea 199):

```ts
  const [adState, setAdState] = useState<Record<string, {
    link?: string;
    cta?: string;
    previews?: PreviewFrame[];
    fmtIdx?: number;
    busy?: boolean;
    msg?: string;
  }>>({});
  function patchAd(id: string, patch: Partial<(typeof adState)[string]>) {
    setAdState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }
  const CTAS = ["LEARN_MORE", "SIGN_UP", "GET_OFFER", "CONTACT_US", "WATCH_MORE"];

  function previsualizarAd(p: Proposal) {
    const st = adState[p.id] ?? {};
    const link = (st.link ?? "").trim();
    if (!/^https?:\/\//i.test(link)) {
      patchAd(p.id, { msg: "Poné un link de destino válido (https://…)." });
      return;
    }
    const media: ProposalMedia = { imageUrl: media[p.id]?.imageUrl, videoUrl: media[p.id]?.videoUrl };
    patchAd(p.id, { busy: true, msg: "" });
    start(async () => {
      const r = await previewAdAction(p, media, link, st.cta ?? "LEARN_MORE");
      patchAd(p.id, { busy: false, msg: r.msg, ...(r.ok ? { previews: r.previews, fmtIdx: 0 } : {}) });
    });
  }
```

> ⚠️ Nombre: la variable de estado de medios ya se llama `media` (≈línea 202). Renombrar el local de arriba a `adMedia` para no chocar: `const adMedia: ProposalMedia = { imageUrl: media[p.id]?.imageUrl, videoUrl: media[p.id]?.videoUrl };` y pasar `adMedia`.

- [ ] **Step 3: UI del panel en el paso 3**

Dentro del `.map(selectedProposals)` del paso 3, después del bloque de Medios (después de `</div>` que cierra la grilla imagen/video, ≈línea 610), agregar:

```tsx
                {/* Anuncio Meta: preview en todos los placements */}
                <details className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
                  <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    📣 Anuncio Meta (preview)
                  </summary>
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={adState[p.id]?.link ?? ""}
                        onChange={(e) => patchAd(p.id, { link: e.target.value })}
                        placeholder="Link de destino (https://…)"
                        className={`${inputCls} flex-1`}
                      />
                      <select
                        value={adState[p.id]?.cta ?? "LEARN_MORE"}
                        onChange={(e) => patchAd(p.id, { cta: e.target.value })}
                        className={inputCls}
                      >
                        {CTAS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => previsualizarAd(p)}
                        disabled={pending || (!media[p.id]?.imageUrl && !media[p.id]?.videoUrl)}
                        className={buttonClass("secondary", "sm")}
                      >
                        {adState[p.id]?.busy ? "Generando…" : "Previsualizar anuncio"}
                      </button>
                    </div>
                    {!media[p.id]?.imageUrl && !media[p.id]?.videoUrl && (
                      <p className="text-[11px] text-zinc-400">Generá una imagen o video arriba para previsualizar el anuncio.</p>
                    )}
                    {adState[p.id]?.previews?.length ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {adState[p.id]!.previews!.map((f, i) => (
                            <button
                              key={f.format}
                              type="button"
                              onClick={() => patchAd(p.id, { fmtIdx: i })}
                              className={`rounded border px-2 py-0.5 text-[10px] ${
                                (adState[p.id]?.fmtIdx ?? 0) === i
                                  ? "border-[oklch(52%_0.13_255)] text-zinc-900 dark:text-zinc-100"
                                  : "border-zinc-200 text-zinc-500 dark:border-zinc-700"
                              }`}
                            >
                              {f.format}
                            </button>
                          ))}
                        </div>
                        <iframe
                          title={`adpreview-${p.id}`}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                          srcDoc={adState[p.id]!.previews![adState[p.id]?.fmtIdx ?? 0]?.html ?? ""}
                          className="h-[480px] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
                        />
                      </div>
                    ) : null}
                    {adState[p.id]?.msg && <p className="text-[11px] text-zinc-400">{adState[p.id]!.msg}</p>}
                  </div>
                </details>
```

- [ ] **Step 4: Cablear las actions en `page.tsx`**

En `app/(dashboard)/publicaciones/page.tsx`, importar y pasar:

```ts
import {
  // …existentes…
  previsualizarPropuestaAd,
  crearAnuncioDesdePropuesta,
  listarCampaigns,
  listarAdsets,
} from "./actions";
```

Y en `<AdStudio … />` agregar props:

```tsx
        previewAdAction={previsualizarPropuestaAd}
        crearAdAction={crearAnuncioDesdePropuesta}
        listCampaignsAction={listarCampaigns}
        listAdsetsAction={listarAdsets}
```

- [ ] **Step 5: Verificación manual**

Run: `npx tsc --noEmit && npm run dev`
Abrir `/publicaciones` → generar propuestas → seleccionar → paso "Afinar" → en una propuesta generar imagen → abrir "📣 Anuncio Meta (preview)" → poner link `https://example.com` → Previsualizar. Esperado (mock): aparecen botones de formato (todos los AD_FORMATS) y el iframe con el placeholder "Conectá Meta…".

- [ ] **Step 6: Commit**

```bash
git add components/publicaciones/ad-studio.tsx app/(dashboard)/publicaciones/page.tsx
git commit -m "feat(estudio): panel Anuncio Meta con preview en todos los placements"
```

---

## Task 12: Crear ad PAUSED desde la propuesta (elegir o crear campaña/conjunto)

**Files:**
- Modify: `components/publicaciones/ad-studio.tsx`

- [ ] **Step 1: Estado de creación + carga de campañas/conjuntos**

Junto al estado del panel (Task 11 Step 2), agregar:

```ts
  const [crearState, setCrearState] = useState<Record<string, {
    campaigns?: { id: string; name: string }[];
    adsets?: { id: string; name: string }[];
    campaignId?: string;
    adsetId?: string;
    modoNuevo?: boolean;
    campaignName?: string;
    adsetName?: string;
    presupuesto?: number;
    dias?: number;
    pais?: string;
    busy?: boolean;
    msg?: string;
    adId?: string;
  }>>({});
  function patchCrear(id: string, patch: Partial<(typeof crearState)[string]>) {
    setCrearState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function cargarCampaigns(p: Proposal) {
    start(async () => {
      const campaigns = await listCampaignsAction();
      patchCrear(p.id, { campaigns });
    });
  }
  function cargarAdsets(p: Proposal, campaignId: string) {
    patchCrear(p.id, { campaignId, adsetId: undefined });
    start(async () => {
      const adsets = await listAdsetsAction(campaignId);
      patchCrear(p.id, { adsets });
    });
  }

  function crearAd(p: Proposal) {
    const st = crearState[p.id] ?? {};
    const ad = adState[p.id] ?? {};
    const link = (ad.link ?? "").trim();
    if (!/^https?:\/\//i.test(link)) {
      patchCrear(p.id, { msg: "Poné el link de destino en el preview de arriba." });
      return;
    }
    const adMedia: ProposalMedia = { imageUrl: media[p.id]?.imageUrl, videoUrl: media[p.id]?.videoUrl };
    if (!adMedia.imageUrl && !adMedia.videoUrl) {
      patchCrear(p.id, { msg: "Generá una imagen o video primero." });
      return;
    }
    patchCrear(p.id, { busy: true, msg: "" });
    start(async () => {
      const r = await crearAdAction({
        proposal: p,
        media: adMedia,
        link,
        cta: ad.cta ?? "LEARN_MORE",
        ...(st.modoNuevo || !st.adsetId
          ? {
              nuevo: {
                campaignName: st.campaignName?.trim() || `Estudio · ${p.label}`,
                objective: "OUTCOME_TRAFFIC",
                adsetName: st.adsetName?.trim() || `Estudio · ${p.label} · conjunto`,
                dailyBudgetUsd: st.presupuesto ?? 5,
                days: st.dias ?? 7,
                pais: st.pais ?? "AR",
              },
            }
          : { adsetId: st.adsetId }),
      });
      patchCrear(p.id, { busy: false, msg: r.msg, ...(r.ok ? { adId: r.id } : {}) });
    });
  }
```

- [ ] **Step 2: UI dentro del `<details>` del panel Anuncio Meta**

Después del bloque de preview (Task 11 Step 3, antes de cerrar el `<div className="space-y-2 pt-2">`), agregar:

```tsx
                    {/* Crear el anuncio (PAUSED) */}
                    <div className="space-y-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Crear anuncio (pausado)</span>
                        <button
                          type="button"
                          onClick={() => {
                            patchCrear(p.id, { modoNuevo: !crearState[p.id]?.modoNuevo });
                            if (!crearState[p.id]?.campaigns) cargarCampaigns(p);
                          }}
                          className="text-[11px] text-zinc-500 underline-offset-2 hover:underline"
                        >
                          {crearState[p.id]?.modoNuevo ? "Usar existente" : "Crear campaña/conjunto nuevos"}
                        </button>
                      </div>

                      {crearState[p.id]?.modoNuevo ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input className={inputCls} placeholder="Nombre campaña" value={crearState[p.id]?.campaignName ?? ""} onChange={(e) => patchCrear(p.id, { campaignName: e.target.value })} />
                          <input className={inputCls} placeholder="Nombre conjunto" value={crearState[p.id]?.adsetName ?? ""} onChange={(e) => patchCrear(p.id, { adsetName: e.target.value })} />
                          <input className={inputCls} type="number" min={1} placeholder="USD/día" value={crearState[p.id]?.presupuesto ?? 5} onChange={(e) => patchCrear(p.id, { presupuesto: Number(e.target.value) })} />
                          <input className={inputCls} type="number" min={1} placeholder="Días" value={crearState[p.id]?.dias ?? 7} onChange={(e) => patchCrear(p.id, { dias: Number(e.target.value) })} />
                          <input className={`${inputCls} uppercase`} maxLength={2} placeholder="País" value={crearState[p.id]?.pais ?? "AR"} onChange={(e) => patchCrear(p.id, { pais: e.target.value })} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <select
                            className={inputCls}
                            value={crearState[p.id]?.campaignId ?? ""}
                            onFocus={() => { if (!crearState[p.id]?.campaigns) cargarCampaigns(p); }}
                            onChange={(e) => cargarAdsets(p, e.target.value)}
                          >
                            <option value="">— Campaña —</option>
                            {crearState[p.id]?.campaigns?.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <select
                            className={inputCls}
                            value={crearState[p.id]?.adsetId ?? ""}
                            onChange={(e) => patchCrear(p.id, { adsetId: e.target.value })}
                            disabled={!crearState[p.id]?.adsets?.length}
                          >
                            <option value="">— Conjunto —</option>
                            {crearState[p.id]?.adsets?.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button type="button" onClick={() => crearAd(p)} disabled={pending || crearState[p.id]?.busy} className={buttonClass("primary", "sm")}>
                        {crearState[p.id]?.busy ? "Creando…" : "Crear anuncio (pausado)"}
                      </button>
                      {crearState[p.id]?.adId && (
                        <a href="/difusion" className="text-[11px] text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline">
                          Ver en Difusión → ({crearState[p.id]!.adId})
                        </a>
                      )}
                      {crearState[p.id]?.msg && <p className="text-[11px] text-zinc-400">{crearState[p.id]!.msg}</p>}
                    </div>
```

- [ ] **Step 3: Verificación manual**

Run: `npx tsc --noEmit && npm run dev`
En `/publicaciones`, propuesta con imagen + link cargado: abrir "Crear anuncio (pausado)". Esperado (mock): "Usar existente" carga campaña/conjunto mock seleccionables; "Crear campaña/conjunto nuevos" muestra los inputs. Click "Crear anuncio" → mensaje "Anuncio creado en PAUSADO (mock)…" + link a Difusión.

- [ ] **Step 4: Suite completa + lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: tests PASS, sin errores de tipo ni lint.

- [ ] **Step 5: Commit**

```bash
git add components/publicaciones/ad-studio.tsx
git commit -m "feat(estudio): crear anuncio PAUSED desde propuesta (elegir o crear campaña/conjunto)"
```

---

## Self-review checklist (hecho al escribir el plan)

- **Cobertura del spec:** galería con preview real + KPIs (Tasks 4,9,10) · lectura + pausar/activar (Tasks 5,8,9) · métricas alcance/frecuencia/clics/CTR/gasto/CPC/CPM/CPA/conversiones (Task 2) · preview de propuesta en todos los placements (Tasks 6,11) · crear ad PAUSED elegir/crear campaña-conjunto (Tasks 6,8,12) · una sola cuenta (usa `META_AD_ACCOUNT_ID`) · mock-first (todas) · token server-only + sandbox + confirmación al activar (Tasks 8,9) · ubicación galería en Difusión / crear en Estudio (Tasks 10,11,12). ✅
- **Sin placeholders:** todos los steps traen código real.
- **Consistencia de tipos:** `AdRow`, `PreviewFrame`, `ProposalMedia`, `CreativeSpec`, `InsightsRow`, `computeAdMetrics`, `AD_FORMATS` se definen en Tasks 1-6 y se consumen igual en 7-12. Choque de nombre `media` vs media local resuelto explícitamente (Task 11 Step 2, usar `adMedia`).
- **Desviación documentada:** imagen por `picture` URL (sin `uploadAdImage`); video por `uploadAdVideo`.
