# Colecta profunda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cuenta del plan deje en la DB su perfil (seguidores), sus piezas nuevas con métricas, sus comentarios (`kind: "comment"`) y sus historias, colectados por navegación + parseo; que todo error de la corrida sea visible en el panel de Escenario; y que el informe reciba densidad y muestra de comentarios reales.

**Architecture:** Toda la lógica de parseo sale de `content.js` y vive en módulos puros ESM de `infra/escucha-extension/core/` (`parse.js`, `ig.js`, `xdom.js`, `fbdom.js`, `ttdom.js`), testeados con vitest (los que reciben un `Document` se testean con `new JSDOM(html).window.document`). `content.js` sigue siendo un content script clásico y carga esos módulos con `import(chrome.runtime.getURL(...))` (requiere `web_accessible_resources` en el manifest). `sw.js` orquesta por cuenta: perfil → piezas → comentarios (IG: hasta 6 piezas; X: las 2 piezas con más respuestas) y cierra la corrida con `POST /api/extension/signal` `{kind:"run-summary"}`. Server: `plan` manda `since` por cuenta (`lib/extension-since.ts`), `items` acepta `replyCount`, `signal` guarda la corrida en `conector_config` `extension-run:<pid>` (`lib/extension-run.ts`) y el bloque Redes la muestra. `lib/monitor-metrics.ts` asocia comentarios por `parent_url` y expone `comentarios`, `comentaristas`, `densidad` y muestra anonimizada; `lib/daily-report.ts` la vuelca al prompt.

**Tech Stack:** Chrome MV3 (JS vanilla; `core/*` son módulos ESM), Next.js 16 route handlers, zod v4, Supabase, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-26-colecta-profunda-design.md`

---

## Convenciones

- Tests: `npx vitest run <archivo>`; suite: `npx vitest run`; tipos: `npx tsc --noEmit`; lint: `npx eslint <archivos>`; JS de la extensión: `node --check <archivo>` (los `core/*.js` son ESM: `node --check` los acepta con extensión `.mjs` o vía `node --input-type=module`; para `.js` de la extensión usar `node --check` sólo en `content.js`/`sw.js`, y para `core/*.js` alcanza con que el test de vitest los importe).
- vitest incluye `tests/**/*.test.ts` con `environment: "node"`; los `.js` de `infra/escucha-extension/core/` se importan por ruta relativa (`../infra/escucha-extension/core/parse.js`) — ya funciona en `tests/extension-nav.test.ts`.
- **DOM en tests:** no se cambia el environment de vitest. Los módulos que reciben un `Document` se testean con `import { JSDOM } from "jsdom"` y `new JSDOM(html).window.document`, dentro del environment `node`. Por eso los parsers de DOM usan **`textContent` y `getAttribute`, nunca `innerText`** (jsdom no implementa `innerText`).
- **Commits SIEMPRE con pathspec**: `git add -- <archivos> && git commit -m "…" -- <archivos>`; trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8` (se pasan con un segundo `-m`).
- Persistencia sin DDL: filas sintéticas de `conector_config` vía `upsertConectorConfig` (`lib/db/conector-config.ts`). Auth de extensión: `verifyExtensionToken`.
- Métricas aceptadas por `/api/extension/items`: `followers, likeCount, commentCount, viewCount, repostCount, replyCount (nuevo), takenAt, expiringAt`. Cualquier otra clave se descarta silenciosamente (zod no-strict): no inventar claves nuevas sin tocar el schema.

## Paralelismo

- **Task 1** (`core/parse.js`) primero: la importan 3 y 4.
- **Tasks 2, 3, 4** en paralelo una vez que existe `core/parse.js` (Task 2 no depende de parse, puede arrancar junto con la 1).
- **Task 5** (`content.js` + manifest) después de 1–4.
- **Task 6** (`sw.js` + panel) después de 5.
- **Tasks 7 y 8** (server) son independientes de 5 y 6 y pueden correr en paralelo entre sí y con ellas.
- **Task 9** (deploy + smoke) al final, con todo mergeado.

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `infra/escucha-extension/core/parse.js` | crear | `parseCount`, `countBefore`, `parseXGroupLabel`, `parseIgHeader`, `parseIgOg` |
| `infra/escucha-extension/core/ig.js` | crear | `userIdFromFeed`, `userIdFromScripts`, `itemsFromFeed`, `commentsFromJson`, `nextMinId`, `storiesFromReels` |
| `infra/escucha-extension/core/xdom.js` | crear | `parseXProfile`, `parseXTimeline`, `parseXReplies` |
| `infra/escucha-extension/core/fbdom.js` | crear | `parseFbProfile`, `parseFbTimeline` |
| `infra/escucha-extension/core/ttdom.js` | crear | `parseTikTokProfile`, `parseTikTokTimeline` |
| `infra/escucha-extension/content.js` | reescribir | handlers `ig-collect`, `ig-comments`, `dom-profile`, `dom-replies`, `ig-search`, `dom-collect` |
| `infra/escucha-extension/manifest.json` | modificar | `web_accessible_resources` con `core/*.js` |
| `infra/escucha-extension/sw.js` | modificar | flujo por cuenta, errores estructurados, `run-summary` |
| `infra/escucha-extension/panel.html`, `panel.js` | modificar | contador de errores |
| `app/api/extension/plan/route.ts` | modificar | `since` por cuenta |
| `app/api/extension/items/route.ts` | modificar | `metrics.replyCount` |
| `app/api/extension/signal/route.ts` | modificar | `kind: "run-summary"` |
| `lib/extension-since.ts` | crear | `sinceByAccount`, `defaultSince` |
| `lib/extension-run.ts` | crear | `saveExtensionRun`, `readExtensionRun` |
| `components/escucha/bloque-redes.tsx` | modificar | "Última corrida de la extensión" |
| `components/escucha/escenario-tab.tsx`, `app/(dashboard)/escucha/page.tsx` | modificar | pasar `extensionRun` |
| `lib/monitor-metrics.ts` | modificar | `comentarios`, `comentaristas`, densidad por `parent_url`, muestra anonimizada |
| `lib/daily-report.ts` | modificar | `metricsLine`, `commentsSection` |
| tests | crear/ampliar | `extension-parse`, `extension-ig`, `extension-xdom`, `extension-dom-fb-tt`, `extension-plan-route`, `extension-items-route`, `extension-signal-route`, `monitor-metrics`, `daily-report-metrics` |

---

### Task 1: `core/parse.js` (números localizados y etiquetas) + tests

**Files:** Create `infra/escucha-extension/core/parse.js`; Test `tests/extension-parse.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/extension-parse.test.ts
import { describe, it, expect } from "vitest";
import { parseCount, countBefore, parseXGroupLabel, parseIgHeader, parseIgOg } from "../infra/escucha-extension/core/parse.js";

describe("parseCount · español", () => {
  it("miles y millones con coma decimal", () => {
    expect(parseCount("38,2 mil")).toBe(38200);
    expect(parseCount("3,4 mil")).toBe(3400);
    expect(parseCount("1,2 M")).toBe(1200000);
    expect(parseCount("1,2 millones")).toBe(1200000);
    expect(parseCount("1,2 millón")).toBe(1200000);
  });
  it("punto como separador de miles", () => {
    expect(parseCount("1.806")).toBe(1806);
    expect(parseCount("1.234.567")).toBe(1234567);
  });
  it("enteros pelados", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("0")).toBe(0);
  });
});

describe("parseCount · inglés", () => {
  it("K y M pegados al número", () => {
    expect(parseCount("136K")).toBe(136000);
    expect(parseCount("3.4K")).toBe(3400);
    expect(parseCount("1.2M")).toBe(1200000);
  });
  it("coma como separador de miles", () => {
    expect(parseCount("1,806")).toBe(1806);
  });
  it("notación mixta: el último separador es el decimal", () => {
    expect(parseCount("1.234,5 mil")).toBe(1234500);
    expect(parseCount("1,234.5K")).toBe(1234500);
  });
});

describe("parseCount · robustez", () => {
  it("null cuando no hay número", () => {
    for (const bad of ["", "   ", "sin datos", null, undefined, {}]) {
      expect(parseCount(bad)).toBeNull();
    }
  });
  it("no confunde palabras que empiezan con m/k con magnitudes", () => {
    expect(parseCount("12 mensajes")).toBe(12);
    expect(parseCount("12 milanesas")).toBe(12);
    expect(parseCount("7 comentarios")).toBe(7);
  });
  it("acepta números ya numéricos", () => {
    expect(parseCount(1806)).toBe(1806);
  });
});

describe("countBefore", () => {
  it("toma el número que precede a la unidad, no el primero del texto", () => {
    expect(countBefore("136K seguidores, 216 seguidos, 16K publicaciones", "publicaciones|posts")).toBe(16000);
    expect(countBefore("136K seguidores, 216 seguidos", "seguidores|followers")).toBe(136000);
  });
  it("null si la unidad no aparece", () => {
    expect(countBefore("216 seguidos", "seguidores|followers")).toBeNull();
  });
});

describe("parseXGroupLabel", () => {
  it("etiqueta en español, con elementos que se ignoran", () => {
    expect(parseXGroupLabel("7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones"))
      .toEqual({ replies: 7, reposts: 6, likes: 23, views: 1828 });
  });
  it("etiqueta en inglés", () => {
    expect(parseXGroupLabel("7 replies, 6 reposts, 23 likes, 1828 views"))
      .toEqual({ replies: 7, reposts: 6, likes: 23, views: 1828 });
  });
  it("etiqueta parcial: sólo las claves presentes", () => {
    expect(parseXGroupLabel("1 respuesta, 2 Me gusta")).toEqual({ replies: 1, likes: 2 });
  });
  it("números localizados dentro de la etiqueta", () => {
    expect(parseXGroupLabel("1.828 reproducciones, 38,2 mil Me gusta")).toEqual({ likes: 38200, views: 1828 });
  });
  it("etiqueta vacía o nula → objeto vacío", () => {
    expect(parseXGroupLabel("")).toEqual({});
    expect(parseXGroupLabel(null)).toEqual({});
  });
});

describe("parseIgHeader / parseIgOg", () => {
  it("seguidores del header", () => {
    expect(parseIgHeader("1.806 publicaciones 136 mil seguidores 216 seguidos")).toBe(136000);
    expect(parseIgHeader("136K followers")).toBe(136000);
    expect(parseIgHeader("sin datos")).toBeNull();
  });
  it("og:description trae seguidores y publicaciones", () => {
    expect(parseIgOg("136K seguidores, 216 seguidos, 16K publicaciones")).toEqual({ followers: 136000, posts: 16000 });
    expect(parseIgOg("")).toEqual({ followers: null, posts: null });
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/extension-parse.test.ts`. Falla con `Failed to load url ../infra/escucha-extension/core/parse.js` (el módulo todavía no existe).

- [ ] **Step 3: Implementar**

```js
// infra/escucha-extension/core/parse.js
// Parseo de números y etiquetas localizadas (es/en) de las redes. Puro: sin
// chrome.*, sin DOM, sin estado. Lo usan content.js (vía import dinámico) y
// los parsers de core/*dom.js.
//
// Casos que tiene que resolver, todos vistos en producción:
//   "38,2 mil" 38200 · "136K" 136000 · "1.806" 1806 · "1,2 M" 1200000 · "12" 12

// Sufijo de magnitud. El lookahead evita que "12 mensajes" se lea como 12 M.
const SUFFIX = "(?:mill?(?:ones|[oó]n)?|mil|k|m|b)(?![a-záéíóúüñ])";
// Un número con separadores de miles/decimales y espacios finos adentro.
const NUMBER = "\\d[\\d.,\\s]*\\d|\\d";
const COUNT = `(${NUMBER})\\s*(${SUFFIX})?`;

// "1.806" 1806 · "38,2" 38.2 · "1.234,5" 1234.5 · "1,234.5" 1234.5
function numberFromLocalized(raw) {
  const s = String(raw).replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sepAt = Math.max(lastDot, lastComma);
  if (sepAt < 0) return Number(s);
  const sep = s[sepAt];
  // Notación mixta: el ÚLTIMO separador es el decimal, el otro es de miles.
  if (lastDot >= 0 && lastComma >= 0) {
    const thousands = sep === "." ? "," : ".";
    return Number(s.split(thousands).join("").replace(sep, "."));
  }
  const groups = s.split(sep).length - 1;
  const decimals = s.length - sepAt - 1;
  // Un solo tipo de separador: es de miles si se repite o agrupa 3 dígitos.
  if (groups > 1 || decimals === 3) return Number(s.split(sep).join(""));
  return Number(s.replace(sep, "."));
}

export function parseCount(input) {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  const m = String(input == null ? "" : input).match(new RegExp(COUNT, "i"));
  if (!m) return null;
  const base = numberFromLocalized(m[1]);
  if (base === null || !Number.isFinite(base)) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (!suffix) return Math.round(base);
  if (suffix === "mil" || suffix === "k") return Math.round(base * 1000);
  if (suffix === "b") return Math.round(base * 1e9);
  return Math.round(base * 1e6); // m, mill, millón, millones
}

// El número que precede a una unidad ("136K seguidores"): no el primero del
// texto, el que está pegado a la palabra. `unit` es una alternancia de regex.
export function countBefore(text, unit) {
  const m = String(text == null ? "" : text).match(new RegExp(`${COUNT}\\s*(?:${unit})`, "i"));
  if (!m) return null;
  return parseCount(`${m[1]} ${m[2] || ""}`);
}

// aria-label del [role="group"] de un tweet:
// "7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones"
const X_UNITS = {
  replies: "respuestas?|replies|reply",
  reposts: "reposts?|retweets?|republicaciones?",
  likes: "me gusta|likes?",
  views: "reproducciones|visualizaciones|views?",
};

export function parseXGroupLabel(label) {
  const out = {};
  for (const key of Object.keys(X_UNITS)) {
    const n = countBefore(label, X_UNITS[key]);
    if (n != null) out[key] = n;
  }
  return out;
}

const FOLLOWERS = "seguidores|followers";

// Header del perfil de IG: "1.806 publicaciones 136 mil seguidores 216 seguidos".
export function parseIgHeader(text) {
  return countBefore(text, FOLLOWERS);
}

// meta[property="og:description"]: "136K seguidores, 216 seguidos, 16K publicaciones".
export function parseIgOg(desc) {
  return {
    followers: countBefore(desc, FOLLOWERS),
    posts: countBefore(desc, "publicaciones|posts"),
  };
}
```

- [ ] **Step 4: Correr y ver pasar** — `npx vitest run tests/extension-parse.test.ts` (todos los casos en verde) y `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -- infra/escucha-extension/core/parse.js tests/extension-parse.test.ts && git commit -m "feat(extension): parseo de números y etiquetas localizadas (es/en)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/core/parse.js tests/extension-parse.test.ts
```

---

### Task 2: `core/ig.js` (feed, comentarios, historias) + tests

**Files:** Create `infra/escucha-extension/core/ig.js`; Test `tests/extension-ig.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/extension-ig.test.ts
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { userIdFromFeed, userIdFromScripts, mediaUrl, itemsFromFeed, commentsFromJson, nextMinId, storiesFromReels } from "../infra/escucha-extension/core/ig.js";

const at = (iso: string) => Math.floor(+new Date(iso) / 1000);

const feed = {
  items: [
    // Fijado: es el más viejo pero viene primero. NO se filtra por posición.
    { pk: "111", code: "AAA", media_type: 1, taken_at: at("2026-08-10T12:00:00.000Z"), like_count: 10, comment_count: 2, caption: { text: "fijado" }, user: { pk: 9001 } },
    { pk: "222", code: "BBB", media_type: 8, taken_at: at("2026-08-25T12:00:00.000Z"), like_count: 306, comment_count: 41, caption: { text: "carrusel del domingo" }, user: { pk: 9001 } },
    { pk: "333", code: "CCC", media_type: 2, taken_at: at("2026-08-26T09:00:00.000Z"), like_count: 88, comment_count: 7, play_count: 5400, caption: null, user: { pk: 9001 } },
  ],
};

describe("ig · feed", () => {
  it("userId sale del primer item con user.pk", () => {
    expect(userIdFromFeed(feed)).toBe("9001");
    expect(userIdFromFeed({ items: [] })).toBeNull();
    expect(userIdFromFeed(null)).toBeNull();
  });

  it("filtra por taken_at, nunca por posición, y mapea kind y métricas", () => {
    const { items, pieces } = itemsFromFeed(feed, "ferrooficial", 136000, "2026-08-20T00:00:00.000Z");
    expect(items.map((i) => i.url)).toEqual([
      "https://www.instagram.com/p/BBB/",
      "https://www.instagram.com/p/CCC/",
    ]);
    expect(items[0]).toEqual({
      site: "instagram",
      kind: "post",
      text: "carrusel del domingo",
      url: "https://www.instagram.com/p/BBB/",
      author: "ferrooficial",
      publishedAt: "2026-08-25T12:00:00.000Z",
      metrics: {
        followers: 136000,
        likeCount: 306,
        commentCount: 41,
        viewCount: undefined,
        takenAt: "2026-08-25T12:00:00.000Z",
      },
    });
    expect(items[1].kind).toBe("reel");
    expect(items[1].metrics.viewCount).toBe(5400);
    expect(items[1].text).toBe("(publicación sin texto)");
    expect(pieces).toEqual([
      { pk: "222", url: "https://www.instagram.com/p/BBB/", commentCount: 41 },
      { pk: "333", url: "https://www.instagram.com/p/CCC/", commentCount: 7 },
    ]);
  });

  it("sin since devuelve todo; pieza sin taken_at se guarda con publishedAt undefined", () => {
    const json = { items: [{ pk: "1", code: "X", media_type: 1, caption: { text: "sin fecha" }, user: { pk: 1 } }] };
    const { items } = itemsFromFeed(json, "h", undefined, "2026-08-20T00:00:00.000Z");
    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBeUndefined();
    expect(items[0].metrics.followers).toBeUndefined();
  });

  it("json roto → listas vacías", () => {
    for (const bad of [null, undefined, {}, { items: null }, { items: [null] }]) {
      expect(itemsFromFeed(bad, "h", 1, undefined)).toEqual({ items: [], pieces: [] });
    }
  });

  it("mediaUrl cae a /media/<pk>/ sin code", () => {
    expect(mediaUrl("123", "ABC")).toBe("https://www.instagram.com/p/ABC/");
    expect(mediaUrl("123", null)).toBe("https://www.instagram.com/media/123/");
  });
});

describe("ig · comentarios", () => {
  const json = {
    comments: [
      { pk: "c1", text: "vamos ferro  ", created_at: at("2026-08-25T13:00:00.000Z"), comment_like_count: 4, user: { username: "hincha1" } },
      { pk: "c2", text: "gracias!", created_at: at("2026-08-25T13:05:00.000Z"), comment_like_count: 0, user: { username: "ferrooficial" } },
      { pk: "c3", text: "", created_at: at("2026-08-25T13:06:00.000Z"), user: { username: "hincha2" } },
      { pk: "c4", text: "otro", created_at: at("2026-08-25T13:07:00.000Z"), user: null },
    ],
    next_min_id: "MIN2",
  };

  it("mapea a kind comment con url única y descarta la respuesta de la propia cuenta", () => {
    const items = commentsFromJson(json, "https://www.instagram.com/p/BBB/", "ferrooficial");
    expect(items).toEqual([
      {
        site: "instagram",
        kind: "comment",
        text: "vamos ferro",
        url: "https://www.instagram.com/p/BBB/#c1",
        author: "hincha1",
        parentUrl: "https://www.instagram.com/p/BBB/",
        publishedAt: "2026-08-25T13:00:00.000Z",
        metrics: { likeCount: 4 },
      },
    ]);
  });

  it("nextMinId devuelve el cursor o null", () => {
    expect(nextMinId(json)).toBe("MIN2");
    expect(nextMinId({ comments: [] })).toBeNull();
    expect(nextMinId(null)).toBeNull();
  });
});

describe("ig · historias y userId de scripts", () => {
  it("reels_media → items kind story con expiringAt", () => {
    const json = {
      reels_media: [{
        items: [
          { pk: "s1", taken_at: at("2026-08-26T08:00:00.000Z"), expiring_at: at("2026-08-27T08:00:00.000Z"), accessibility_caption: "Foto de la cancha" },
          { pk: "s2", taken_at: at("2026-08-26T09:00:00.000Z") },
        ],
      }],
    };
    const items = storiesFromReels(json, "ferrooficial", 136000);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      site: "instagram",
      kind: "story",
      text: "Foto de la cancha",
      url: "https://www.instagram.com/stories/ferrooficial/s1/",
      author: "ferrooficial",
      publishedAt: "2026-08-26T08:00:00.000Z",
      metrics: {
        followers: 136000,
        takenAt: "2026-08-26T08:00:00.000Z",
        expiringAt: "2026-08-27T08:00:00.000Z",
      },
    });
    expect(items[1].text).toBe("(historia sin texto alternativo)");
    expect(storiesFromReels(null, "h", 1)).toEqual([]);
  });

  it("userIdFromScripts saca profile_id de los scripts de la página", () => {
    const doc = new JSDOM(`<html><body><script>window.__d({"profile_id":"9001","x":1})</script></body></html>`).window.document;
    expect(userIdFromScripts(doc)).toBe("9001");
    const vacio = new JSDOM(`<html><body><script>nada</script></body></html>`).window.document;
    expect(userIdFromScripts(vacio)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm i -D jsdom` (todavía no está en `devDependencies`) y después `npx vitest run tests/extension-ig.test.ts`: falla porque `core/ig.js` no existe.

- [ ] **Step 3: Implementar**

```js
// infra/escucha-extension/core/ig.js
// Mapeo puro de las respuestas de la API interna de Instagram a items del
// contrato de /api/extension/items. Recibe JSON ya parseado: no hace fetch,
// no toca chrome.*, no depende de la pestaña. Testeable con vitest.

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;

const toIso = (sec) =>
  typeof sec === "number" && Number.isFinite(sec) && sec > 0
    ? new Date(sec * 1000).toISOString()
    : undefined;

const numOrUndef = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

export function mediaUrl(pk, code) {
  return code
    ? `https://www.instagram.com/p/${code}/`
    : `https://www.instagram.com/media/${pk}/`;
}

// userId del primer item del feed: la vía barata que reemplaza a
// web_profile_info (que devuelve 400 desde el 26-ago).
export function userIdFromFeed(json) {
  const items = Array.isArray(json && json.items) ? json.items : [];
  for (const it of items) {
    const u = it && it.user;
    const pk = u && (u.pk || u.pk_id || u.id);
    if (pk) return String(pk);
  }
  return null;
}

// Fallback cuando el feed viene vacío: los scripts del perfil traen profile_id.
export function userIdFromScripts(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  for (const s of doc.querySelectorAll("script")) {
    const m = String(s.textContent || "").match(/"profile_id"\s*:\s*"?(\d{3,})"?/);
    if (m) return m[1];
  }
  return null;
}

// Piezas nuevas del feed. Filtra por `taken_at` posterior a `sinceIso`, NUNCA
// por posición: los fijados van primero y son viejos. Devuelve también
// `pieces` (pk + url + comentarios) para que el sw pida los comentarios.
export function itemsFromFeed(json, handle, followers, sinceIso) {
  const raw = Array.isArray(json && json.items) ? json.items : [];
  const sinceMs = sinceIso ? +new Date(sinceIso) : NaN;
  const items = [];
  const pieces = [];
  for (const it of raw) {
    if (!it || (it.pk == null && !it.code)) continue;
    const takenAt = toIso(it.taken_at);
    if (takenAt && Number.isFinite(sinceMs) && +new Date(takenAt) <= sinceMs) continue;
    const url = mediaUrl(it.pk, it.code);
    const commentCount = numOrUndef(it.comment_count);
    items.push({
      site: "instagram",
      kind: it.media_type === 2 ? "reel" : "post",
      text: (clean(it.caption && it.caption.text) || "(publicación sin texto)").slice(0, MAX_TEXT),
      url,
      author: handle,
      publishedAt: takenAt,
      metrics: {
        followers: numOrUndef(followers),
        likeCount: numOrUndef(it.like_count),
        commentCount,
        viewCount: numOrUndef(it.play_count) ?? numOrUndef(it.view_count) ?? numOrUndef(it.ig_play_count),
        takenAt,
      },
    });
    pieces.push({ pk: String(it.pk), url, commentCount: commentCount ?? 0 });
  }
  return { items, pieces };
}

// Comentarios de una pieza. `handle` es la cuenta dueña: sus propias
// respuestas no cuentan como comentaristas para la densidad, se descartan.
export function commentsFromJson(json, parentUrl, handle) {
  const raw = Array.isArray(json && json.comments) ? json.comments : [];
  const own = String(handle || "").replace(/^@/, "").toLowerCase();
  const items = [];
  for (const c of raw) {
    if (!c) continue;
    const text = clean(c.text);
    const author = c.user && typeof c.user.username === "string" ? c.user.username : null;
    if (!text || !author) continue;
    if (own && author.toLowerCase() === own) continue;
    const pk = c.pk != null ? String(c.pk) : String(items.length + 1);
    items.push({
      site: "instagram",
      kind: "comment",
      text: text.slice(0, MAX_TEXT),
      url: `${parentUrl}#c${pk}`,
      author,
      parentUrl,
      publishedAt: toIso(c.created_at),
      metrics: { likeCount: numOrUndef(c.comment_like_count) },
    });
  }
  return items;
}

export function nextMinId(json) {
  const v = json && json.next_min_id;
  return typeof v === "string" && v ? v : null;
}

// Historias vigentes (reels_media). Lectura pura: nunca media/<pk>/seen.
export function storiesFromReels(json, handle, followers) {
  const reel = (Array.isArray(json && json.reels_media) ? json.reels_media : [])[0];
  const raw = Array.isArray(reel && reel.items) ? reel.items : [];
  return raw.filter(Boolean).map((it) => {
    const takenAt = toIso(it.taken_at);
    return {
      site: "instagram",
      kind: "story",
      text: (clean(it.accessibility_caption) || "(historia sin texto alternativo)").slice(0, MAX_TEXT),
      url: `https://www.instagram.com/stories/${handle}/${it.pk}/`,
      author: handle,
      publishedAt: takenAt,
      metrics: {
        followers: numOrUndef(followers),
        takenAt,
        expiringAt: toIso(it.expiring_at),
      },
    };
  });
}
```

- [ ] **Step 4: Correr y ver pasar** — `npx vitest run tests/extension-ig.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -- infra/escucha-extension/core/ig.js tests/extension-ig.test.ts package.json package-lock.json && git commit -m "feat(extension): mapeo puro del feed, comentarios e historias de Instagram" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/core/ig.js tests/extension-ig.test.ts package.json package-lock.json
```

---

### Task 3: `core/xdom.js` (perfil, timeline y respuestas de X) + tests

**Files:** Create `infra/escucha-extension/core/xdom.js`; Test `tests/extension-xdom.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/extension-xdom.test.ts
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { parseXProfile, parseXTimeline, parseXReplies } from "../infra/escucha-extension/core/xdom.js";

const tweet = (o: { handle: string; id: string; text: string; at?: string; label?: string }) => `
  <article data-testid="tweet" role="article">
    <div data-testid="User-Name">
      <a href="/${o.handle}"><span>${o.handle}</span></a>
      <a href="/${o.handle}/status/${o.id}">${o.at ? `<time datetime="${o.at}">hoy</time>` : ""}</a>
    </div>
    <div data-testid="tweetText">${o.text}</div>
    ${o.label ? `<div role="group" aria-label="${o.label}"></div>` : ""}
  </article>`;

const profileDoc = (body: string) =>
  new JSDOM(`<html><body>
    <a href="/FerroOficial/followers"><span>38,2 mil</span> Seguidores</a>
    <a href="/FerroOficial/following"><span>120</span> Siguiendo</a>
    ${body}
  </body></html>`).window.document;

describe("xdom · perfil", () => {
  it("seguidores del link /followers", () => {
    expect(parseXProfile(profileDoc(""))).toEqual({ followers: 38200 });
  });
  it("null si no está el link", () => {
    expect(parseXProfile(new JSDOM("<html><body></body></html>").window.document)).toBeNull();
  });
});

describe("xdom · timeline", () => {
  const doc = profileDoc(
    tweet({ handle: "FerroOficial", id: "111", text: "fijado viejo", at: "2026-08-01T10:00:00.000Z", label: "2 respuestas, 1 repost, 5 Me gusta, 300 reproducciones" }) +
    tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z", label: "7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones" }) +
    tweet({ handle: "FerroOficial", id: "333", text: "entradas a la venta", at: "2026-08-26T09:00:00.000Z", label: "1 respuesta, 0 reposts, 2 Me gusta" }),
  );

  it("filtra por datetime posterior a since, nunca por posición", () => {
    const items = parseXTimeline(doc, "FerroOficial", "2026-08-20T00:00:00.000Z");
    expect(items.map((i) => i.url)).toEqual([
      "https://x.com/FerroOficial/status/222",
      "https://x.com/FerroOficial/status/333",
    ]);
  });

  it("saca texto, autor, fecha y métricas del aria-label del group", () => {
    const [item] = parseXTimeline(doc, "FerroOficial", "2026-08-24T00:00:00.000Z");
    expect(item).toEqual({
      site: "x",
      kind: "post",
      text: "ganamos de local",
      url: "https://x.com/FerroOficial/status/222",
      author: "FerroOficial",
      publishedAt: "2026-08-25T20:00:00.000Z",
      metrics: { likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 },
    });
  });

  it("sin since devuelve todo y deduplica por url", () => {
    const dup = profileDoc(
      tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" }) +
      tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" }),
    );
    expect(parseXTimeline(dup, "FerroOficial", undefined)).toHaveLength(1);
  });

  it("timeline vacío → []", () => {
    expect(parseXTimeline(profileDoc(""), "FerroOficial", undefined)).toEqual([]);
  });
});

describe("xdom · respuestas", () => {
  it("saltea el primer artículo (la pieza madre) y devuelve kind comment", () => {
    const doc = new JSDOM(`<html><body>
      ${tweet({ handle: "FerroOficial", id: "222", text: "ganamos de local", at: "2026-08-25T20:00:00.000Z" })}
      ${tweet({ handle: "hincha1", id: "901", text: "vamos ferro", at: "2026-08-25T20:10:00.000Z", label: "0 respuestas, 0 reposts, 3 Me gusta" })}
      ${tweet({ handle: "FerroOficial", id: "902", text: "gracias", at: "2026-08-25T20:20:00.000Z" })}
      ${tweet({ handle: "hincha2", id: "903", text: "aguante", at: "2026-08-25T20:30:00.000Z" })}
    </body></html>`).window.document;
    const items = parseXReplies(doc, "https://x.com/FerroOficial/status/222", "FerroOficial");
    expect(items.map((i) => [i.author, i.kind])).toEqual([["hincha1", "comment"], ["hincha2", "comment"]]);
    expect(items[0]).toEqual({
      site: "x",
      kind: "comment",
      text: "vamos ferro",
      url: "https://x.com/hincha1/status/901",
      author: "hincha1",
      parentUrl: "https://x.com/FerroOficial/status/222",
      publishedAt: "2026-08-25T20:10:00.000Z",
      metrics: { likeCount: 3, replyCount: 0, repostCount: 0, viewCount: undefined },
    });
  });

  it("un solo artículo (sin respuestas) → []", () => {
    const doc = new JSDOM(`<html><body>${tweet({ handle: "FerroOficial", id: "222", text: "solo" })}</body></html>`).window.document;
    expect(parseXReplies(doc, "https://x.com/FerroOficial/status/222", "FerroOficial")).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/extension-xdom.test.ts`: falla porque `core/xdom.js` no existe. (Si `jsdom` no está instalado todavía: `npm i -D jsdom`.)

- [ ] **Step 3: Implementar**

```js
// infra/escucha-extension/core/xdom.js
// Parseo puro del DOM de X: recibe un Document (la pestaña real o un fixture
// de jsdom) y devuelve items del contrato de /api/extension/items.
// Usa textContent/getAttribute — NUNCA innerText, que jsdom no implementa.
import { parseCount, parseXGroupLabel } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
const ARTICLES = 'article[data-testid="tweet"], article[role="article"]';
// handle = path de un solo segmento; nunca rutas de la app.
const X_HANDLE_PATH = /^\/[A-Za-z0-9_]{1,15}$/;
const X_NON_HANDLE_PATHS = new Set(["/i", "/home", "/explore", "/search", "/notifications", "/messages"]);

function absX(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `https://x.com${href.startsWith("/") ? href : `/${href}`}`;
}

function authorFrom(article, fallback) {
  for (const a of article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]')) {
    const href = a.getAttribute("href") || "";
    if (X_HANDLE_PATH.test(href) && !X_NON_HANDLE_PATHS.has(href.toLowerCase())) return href.slice(1);
  }
  return fallback || undefined;
}

function statusUrl(article) {
  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/^(?:https?:\/\/[^/]+)?(\/[^/]+\/status\/\d+)/);
    if (m) return absX(m[1]);
  }
  return null;
}

function metricsFrom(article) {
  const group = article.querySelector('[role="group"][aria-label]');
  if (!group) return {};
  const g = parseXGroupLabel(group.getAttribute("aria-label"));
  return { likeCount: g.likes, replyCount: g.replies, repostCount: g.reposts, viewCount: g.views };
}

function textFrom(article) {
  const node = article.querySelector('[data-testid="tweetText"]');
  return clean(node ? node.textContent : article.textContent);
}

// Seguidores del perfil: "38,2 mil Seguidores" en a[href$="/followers"].
export function parseXProfile(doc) {
  const link = doc.querySelector('a[href$="/followers"], a[href$="/verified_followers"]');
  const followers = link ? parseCount(clean(link.textContent)) : null;
  return followers == null ? null : { followers };
}

// Piezas del timeline del perfil. Filtra por time[datetime] posterior a
// `sinceIso`, NUNCA por posición (los fijados van primero).
export function parseXTimeline(doc, handle, sinceIso) {
  const sinceMs = sinceIso ? +new Date(sinceIso) : NaN;
  const items = [];
  const seen = new Set();
  for (const art of doc.querySelectorAll(ARTICLES)) {
    const url = statusUrl(art);
    if (!url || seen.has(url)) continue;
    const text = textFrom(art);
    if (text.length < 5) continue;
    const time = art.querySelector("time[datetime]");
    const publishedAt = time ? time.getAttribute("datetime") : undefined;
    if (publishedAt && Number.isFinite(sinceMs) && +new Date(publishedAt) <= sinceMs) continue;
    seen.add(url);
    items.push({
      site: "x",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: authorFrom(art, handle),
      publishedAt,
      metrics: metricsFrom(art),
    });
  }
  return items;
}

// Respuestas a una pieza (página /status/<id>): el PRIMER artículo es la
// pieza madre, no una respuesta. Las respuestas de la propia cuenta no son
// comentaristas: se descartan.
export function parseXReplies(doc, parentUrl, handle) {
  const arts = Array.from(doc.querySelectorAll(ARTICLES)).slice(1);
  const own = String(handle || "").replace(/^@/, "").toLowerCase();
  const items = [];
  const seen = new Set();
  for (const art of arts) {
    const url = statusUrl(art);
    if (!url || url === parentUrl || seen.has(url)) continue;
    const author = authorFrom(art, undefined);
    if (!author) continue;
    if (own && author.toLowerCase() === own) continue;
    const text = textFrom(art);
    if (!text) continue;
    const time = art.querySelector("time[datetime]");
    seen.add(url);
    items.push({
      site: "x",
      kind: "comment",
      text: text.slice(0, MAX_TEXT),
      url,
      author,
      parentUrl,
      publishedAt: time ? time.getAttribute("datetime") : undefined,
      metrics: metricsFrom(art),
    });
  }
  return items;
}
```

- [ ] **Step 4: Correr y ver pasar** — `npx vitest run tests/extension-xdom.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -- infra/escucha-extension/core/xdom.js tests/extension-xdom.test.ts package.json package-lock.json && git commit -m "feat(extension): parseo del DOM de X (perfil, timeline con métricas, respuestas)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/core/xdom.js tests/extension-xdom.test.ts package.json package-lock.json
```

---

### Task 4: `core/fbdom.js` y `core/ttdom.js` (mínimos) + tests

**Files:** Create `infra/escucha-extension/core/fbdom.js`, `infra/escucha-extension/core/ttdom.js`; Test `tests/extension-dom-fb-tt.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/extension-dom-fb-tt.test.ts
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { parseFbProfile, parseFbTimeline } from "../infra/escucha-extension/core/fbdom.js";
import { parseTikTokProfile, parseTikTokTimeline } from "../infra/escucha-extension/core/ttdom.js";

describe("fbdom", () => {
  const doc = new JSDOM(`<html><body>
    <div><span>3,4 mil seguidores</span><span>120 seguidos</span></div>
    <div role="article">
      <div>Ferro presentó el proyecto del nuevo predio para el barrio y la comisión directiva.</div>
      <a href="/ferrooficial/posts/pfbid0123?__cft__[0]=abc&amp;__tn__=x">Ver</a>
      <div aria-label="12 reacciones: Me gusta, Me encanta"></div>
      <span>8 comentarios</span><span>3 veces compartido</span>
    </div>
    <div role="article"><div>corto</div></div>
  </body></html>`).window.document;

  it("seguidores del texto del encabezado", () => {
    expect(parseFbProfile(doc)).toEqual({ followers: 3400 });
    expect(parseFbProfile(new JSDOM("<html><body>nada</body></html>").window.document)).toBeNull();
  });

  it("una publicación con reacciones, comentarios y url normalizada", () => {
    const items = parseFbTimeline(doc, "ferrooficial");
    expect(items).toHaveLength(1);
    expect(items[0].site).toBe("facebook");
    expect(items[0].kind).toBe("post");
    expect(items[0].url).toBe("https://www.facebook.com/ferrooficial/posts/pfbid0123");
    expect(items[0].author).toBe("ferrooficial");
    expect(items[0].metrics).toEqual({ likeCount: 12, commentCount: 8, repostCount: 3, followers: undefined });
  });

  it("sin artículos → []", () => {
    expect(parseFbTimeline(new JSDOM("<html><body></body></html>").window.document, "h")).toEqual([]);
  });
});

describe("ttdom", () => {
  const doc = new JSDOM(`<html><body>
    <strong data-e2e="followers-count">38.2K</strong>
    <div data-e2e="user-post-item">
      <a href="/@ferrooficial/video/7412"><img alt="gol"></a>
      <div data-e2e="video-desc">golazo de contra</div>
      <strong data-e2e="video-views">1.2M</strong>
    </div>
  </body></html>`).window.document;

  it("seguidores de data-e2e followers-count", () => {
    expect(parseTikTokProfile(doc)).toEqual({ followers: 38200 });
    expect(parseTikTokProfile(new JSDOM("<html><body></body></html>").window.document)).toBeNull();
  });

  it("un video con vistas", () => {
    const items = parseTikTokTimeline(doc, "ferrooficial");
    expect(items).toEqual([{
      site: "tiktok",
      kind: "post",
      text: "golazo de contra",
      url: "https://www.tiktok.com/@ferrooficial/video/7412",
      author: "ferrooficial",
      metrics: { viewCount: 1200000, followers: undefined },
    }]);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/extension-dom-fb-tt.test.ts`: falla porque los dos módulos no existen.

- [ ] **Step 3: Implementar `core/fbdom.js`**

```js
// infra/escucha-extension/core/fbdom.js
// Parseo puro del DOM de Facebook (mínimo: seguidores del encabezado y, por
// publicación, reacciones/comentarios/compartidos). Sin abrir comentarios:
// eso requiere clics y queda fuera de esta iteración.
import { countBefore, parseCount } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
const POST_HREF = /\/(posts|permalink|videos|reel)\/|pfbid|story_fbid/;
const KEEP_PARAMS = ["story_fbid", "fbid", "id", "v"];

// URL estable para el dedupe por (project_id, url): fuera los parámetros de
// tracking (__cft__, __tn__), que cambian en cada carga.
function absFb(href) {
  try {
    const u = new URL(href, "https://www.facebook.com");
    const keep = new URLSearchParams();
    for (const k of KEEP_PARAMS) {
      const v = u.searchParams.get(k);
      if (v) keep.set(k, v);
    }
    const q = keep.toString();
    return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`;
  } catch {
    return null;
  }
}

function reactionsFrom(article) {
  for (const el of article.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") || "";
    if (!/reaccion|reaction|me gusta|like/i.test(label)) continue;
    const n = parseCount(label);
    if (n != null) return n;
  }
  return undefined;
}

export function parseFbProfile(doc) {
  const followers = countBefore(doc.body ? doc.body.textContent : "", "seguidores|followers");
  return followers == null ? null : { followers };
}

export function parseFbTimeline(doc, handle, followers) {
  const items = [];
  const seen = new Set();
  for (const art of doc.querySelectorAll('div[role="article"]')) {
    const text = clean(art.textContent);
    if (text.length < 25) continue;
    let url = null;
    for (const a of art.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (POST_HREF.test(h)) { url = absFb(h); break; }
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const commentCount = countBefore(text, "comentarios|comments");
    const repostCount = countBefore(text, "veces compartido|compartidos|shares|share");
    items.push({
      site: "facebook",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: handle || undefined,
      metrics: {
        followers: typeof followers === "number" ? followers : undefined,
        likeCount: reactionsFrom(art),
        commentCount: commentCount == null ? undefined : commentCount,
        repostCount: repostCount == null ? undefined : repostCount,
      },
    });
  }
  return items;
}
```

- [ ] **Step 4: Implementar `core/ttdom.js`**

```js
// infra/escucha-extension/core/ttdom.js
// Parseo puro del DOM de TikTok (mínimo: seguidores y vistas por video).
// Sin comentarios en esta iteración.
import { parseCount } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
const DESC = '[data-e2e="video-desc"], [data-e2e="browse-video-desc"], [data-e2e="search-card-desc"], [data-e2e="user-post-item-desc"]';

function absTt(href) {
  try {
    const u = new URL(href, "https://www.tiktok.com");
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

export function parseTikTokProfile(doc) {
  const el = doc.querySelector('[data-e2e="followers-count"]');
  const followers = el ? parseCount(clean(el.textContent)) : null;
  return followers == null ? null : { followers };
}

export function parseTikTokTimeline(doc, handle, followers) {
  const items = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('a[href*="/video/"]')) {
    const url = absTt(a.getAttribute("href"));
    if (!url || seen.has(url)) continue;
    const box = (a.closest && a.closest('[data-e2e="user-post-item"]')) || a.parentElement || a;
    const descEl = box.querySelector(DESC);
    const img = a.querySelector("img[alt]");
    const text = clean(descEl ? descEl.textContent : img ? img.getAttribute("alt") : "");
    if (text.length < 3) continue;
    const viewsEl = box.querySelector('[data-e2e="video-views"]');
    const viewCount = viewsEl ? parseCount(clean(viewsEl.textContent)) : null;
    seen.add(url);
    items.push({
      site: "tiktok",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: handle || undefined,
      metrics: {
        followers: typeof followers === "number" ? followers : undefined,
        viewCount: viewCount == null ? undefined : viewCount,
      },
    });
  }
  return items;
}
```

- [ ] **Step 5: Correr y ver pasar** — `npx vitest run tests/extension-dom-fb-tt.test.ts && npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add -- infra/escucha-extension/core/fbdom.js infra/escucha-extension/core/ttdom.js tests/extension-dom-fb-tt.test.ts && git commit -m "feat(extension): parseo mínimo del DOM de Facebook y TikTok (seguidores y métricas por pieza)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/core/fbdom.js infra/escucha-extension/core/ttdom.js tests/extension-dom-fb-tt.test.ts
```

---

### Task 5: `content.js` con los cuatro handlers nuevos + `web_accessible_resources`

**Files:** Rewrite `infra/escucha-extension/content.js`; Modify `infra/escucha-extension/manifest.json`

**Depende de:** Tasks 1–4 (los `core/*.js` tienen que existir).

**Por qué import dinámico:** los content scripts declarativos de MV3 son scripts clásicos (no admiten `import` estático ni `"type": "module"` en el manifest), pero sí admiten `import()` dinámico de un recurso de la extensión, siempre que esté en `web_accessible_resources`. Es la única forma de que la lógica pura viva en `core/` (testeada) y `content.js` no la duplique.

- [ ] **Step 1: Manifest — `web_accessible_resources`**

Agregar al final de `infra/escucha-extension/manifest.json`, después del bloque `content_scripts` (y subir `"version"` a `"0.3.0"`):

```json
  "web_accessible_resources": [
    {
      "resources": ["core/parse.js", "core/ig.js", "core/xdom.js", "core/fbdom.js", "core/ttdom.js"],
      "matches": [
        "https://*.facebook.com/*",
        "https://*.instagram.com/*",
        "https://x.com/*",
        "https://twitter.com/*",
        "https://*.tiktok.com/*"
      ]
    }
  ]
```

Verificar que el JSON queda válido: `node -e "JSON.parse(require('fs').readFileSync('infra/escucha-extension/manifest.json','utf8')); console.log('ok')"`.

- [ ] **Step 2: Reescribir `content.js`** (archivo completo)

```js
// Content script: ejecuta UNA unidad de colecta a pedido del orquestador (sw).
// Corre en la pestaña de la plataforma (misma sesión, misma IP). Para
// Instagram usa la API interna con credentials:include; para X/FB/TikTok lee
// el DOM. NUNCA invoca endpoints de escritura (lista negra dura, spec §3.5).
//
// Toda la lógica de parseo vive en core/*.js (módulos ESM puros, testeados con
// vitest). Este archivo es un content script clásico: los carga con import()
// dinámico sobre chrome.runtime.getURL, que funciona porque el manifest los
// declara en web_accessible_resources.

// Lista negra: cualquier efecto observable por terceros aborta en runtime.
// OJO: el patrón exige "/comment/" exacto — la LECTURA de comentarios es
// "/comments/" (plural) y no queda bloqueada. No cambiar a "comments?".
const WRITE_BLACKLIST = /\/(like|unlike|friendships\/(create|destroy)|media\/[^/]+\/seen|comment|save|approve)\//i;

const IG_APP_ID = "936619743392459";
const IG_FEED_COUNT = 12;
const IG_COMMENT_PAGES = 2;
const SCROLL_PASSES = 3;
const SCROLL_PAUSE_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Carga perezosa y cacheada de los módulos puros.
let corePromise = null;
function core() {
  if (!corePromise) {
    corePromise = Promise.all([
      import(chrome.runtime.getURL("core/parse.js")),
      import(chrome.runtime.getURL("core/ig.js")),
      import(chrome.runtime.getURL("core/xdom.js")),
      import(chrome.runtime.getURL("core/fbdom.js")),
      import(chrome.runtime.getURL("core/ttdom.js")),
    ]).then(([parse, ig, xdom, fbdom, ttdom]) => ({ parse, ig, xdom, fbdom, ttdom }));
  }
  return corePromise;
}

// ---- Instagram: API interna (spec §4). Solo lectura. ----
async function igFetch(path) {
  if (WRITE_BLACKLIST.test(path)) {
    throw new Error(`endpoint de escritura bloqueado: ${path}`);
  }
  const res = await fetch(path, {
    credentials: "include",
    headers: { "x-ig-app-id": IG_APP_ID },
  });
  const text = await res.text();
  if (!res.ok) return { status: res.status, body: text, json: null };
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-json */ }
  return { status: res.status, body: text, json };
}

// Seguidores del perfil: primero el header, después og:description.
function igFollowersFromDom(parse) {
  const header = document.querySelector("header");
  const fromHeader = header ? parse.parseIgHeader(header.textContent) : null;
  if (fromHeader != null) return { followers: fromHeader, posts: null };
  const og = document.querySelector('meta[property="og:description"]');
  return parse.parseIgOg(og ? og.getAttribute("content") : "");
}

// Unidad completa de una cuenta de IG: perfil (DOM) + feed + historias.
async function igCollect(handle, since) {
  const { parse, ig } = await core();
  const errors = [];
  const { followers, posts } = igFollowersFromDom(parse);
  if (followers == null) errors.push({ step: "profile", detail: "seguidores no encontrados en el DOM" });

  let items = [];
  let pieces = [];
  let userId = null;
  let status = 200;
  let body = "";

  const feed = await igFetch(`/api/v1/feed/user/${encodeURIComponent(handle)}/username/?count=${IG_FEED_COUNT}`);
  status = Math.max(status, feed.status);
  if (!feed.json) {
    body = body || feed.body;
    errors.push({ step: "feed", detail: `HTTP ${feed.status}` });
  } else if (!Array.isArray(feed.json.items) || feed.json.items.length === 0) {
    errors.push({ step: "feed", detail: "feed sin items" });
  } else {
    userId = ig.userIdFromFeed(feed.json);
    const mapped = ig.itemsFromFeed(feed.json, handle, followers == null ? undefined : followers, since);
    items = mapped.items;
    pieces = mapped.pieces;
  }

  if (!userId) userId = ig.userIdFromScripts(document);
  if (userId) {
    const st = await igFetch(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`);
    status = Math.max(status, st.status);
    if (!st.json) {
      body = body || st.body;
      errors.push({ step: "stories", detail: `HTTP ${st.status}` });
    } else {
      items = items.concat(ig.storiesFromReels(st.json, handle, followers == null ? undefined : followers));
    }
  } else {
    errors.push({ step: "userId", detail: "sin userId: feed vacío y sin profile_id en los scripts" });
  }

  return {
    ok: true,
    status,
    body,
    items,
    pieces,
    profile: { followers: followers == null ? null : followers, posts, userId },
    errors,
  };
}

// Comentarios de UNA pieza, hasta IG_COMMENT_PAGES páginas (~40 comentarios).
async function igComments(pk, url, handle) {
  const { ig } = await core();
  let items = [];
  let status = 200;
  let body = "";
  let minId = null;
  for (let page = 0; page < IG_COMMENT_PAGES; page++) {
    const q = `/api/v1/media/${encodeURIComponent(pk)}/comments/?can_support_threading=true&permalink_enabled=false${minId ? `&min_id=${encodeURIComponent(minId)}` : ""}`;
    const r = await igFetch(q);
    status = Math.max(status, r.status);
    if (!r.json) { body = r.body; break; }
    items = items.concat(ig.commentsFromJson(r.json, url, handle));
    minId = ig.nextMinId(r.json);
    if (!minId) break;
    await sleep(1200 + Math.floor(Math.random() * 800));
  }
  return { ok: true, status, body, items };
}

// ---- DOM: X / Facebook / TikTok ----
async function scrollDown(passes, pauseMs) {
  for (let i = 0; i < passes; i++) {
    window.scrollBy(0, window.innerHeight * 2);
    await sleep(pauseMs);
  }
}

function isX(h) { return h === "x.com" || h.endsWith(".x.com") || h.includes("twitter.com"); }

// Unidad completa de una cuenta de X/FB/TikTok desde su perfil.
async function domProfile(handle, since) {
  const { xdom, fbdom, ttdom } = await core();
  const errors = [];
  await scrollDown(SCROLL_PASSES, SCROLL_PAUSE_MS);
  const h = location.hostname;
  let profile = null;
  let items = [];
  if (isX(h)) {
    profile = xdom.parseXProfile(document);
    items = xdom.parseXTimeline(document, handle, since);
    if (document.querySelectorAll("article").length === 0) errors.push({ step: "parse", detail: "0 artículos" });
  } else if (h.includes("facebook.com")) {
    profile = fbdom.parseFbProfile(document);
    items = fbdom.parseFbTimeline(document, handle, profile ? profile.followers : undefined);
    if (document.querySelectorAll('div[role="article"]').length === 0) errors.push({ step: "parse", detail: "0 artículos" });
  } else if (h.includes("tiktok.com")) {
    profile = ttdom.parseTikTokProfile(document);
    items = ttdom.parseTikTokTimeline(document, handle, profile ? profile.followers : undefined);
    if (document.querySelectorAll('a[href*="/video/"]').length === 0) errors.push({ step: "parse", detail: "0 videos" });
  } else {
    errors.push({ step: "dispatch", detail: `hostname sin parser: ${h}` });
  }
  if (!profile) errors.push({ step: "profile", detail: "seguidores no encontrados en el DOM" });
  // Los seguidores viajan en cada pieza: amplificación/adhesión son server-side.
  if (profile && profile.followers != null) {
    items = items.map((i) => ({ ...i, metrics: { ...i.metrics, followers: profile.followers } }));
  }
  const pieces = items
    .filter((i) => i.kind === "post")
    .map((i) => ({ url: i.url, replyCount: (i.metrics && i.metrics.replyCount) || 0 }));
  return { ok: true, status: 200, items, pieces, profile, errors };
}

// Respuestas de una pieza de X (la pestaña ya está en /status/<id>).
async function domReplies(url, handle) {
  const { xdom } = await core();
  await scrollDown(2, 1500);
  return { ok: true, status: 200, items: xdom.parseXReplies(document, url, handle) };
}

// Búsquedas A/B por DOM (sin `since`: es descubrimiento, no seguimiento).
async function domCollect(handle) {
  const { xdom, fbdom, ttdom } = await core();
  await scrollDown(1, 1500);
  const h = location.hostname;
  let items = [];
  if (isX(h)) items = xdom.parseXTimeline(document, handle, undefined);
  else if (h.includes("facebook.com")) items = fbdom.parseFbTimeline(document, handle, undefined);
  else if (h.includes("tiktok.com")) items = ttdom.parseTikTokTimeline(document, handle, undefined);
  return { ok: true, status: 200, items };
}

// Orquestador → content: ejecutá esta unidad y devolveme datos + status.
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ig-collect") {
        sendResponse(await igCollect(msg.handle, msg.since));
      } else if (msg.type === "ig-comments") {
        sendResponse(await igComments(msg.pk, msg.url, msg.handle));
      } else if (msg.type === "dom-profile") {
        sendResponse(await domProfile(msg.handle, msg.since));
      } else if (msg.type === "dom-replies") {
        sendResponse(await domReplies(msg.url, msg.handle));
      } else if (msg.type === "ig-search") {
        const r = await igFetch(`/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(msg.query)}`);
        sendResponse({ ok: true, status: r.status, body: r.body, json: r.json });
      } else if (msg.type === "dom-collect") {
        // msg.query es solo informativo (lo usa el orquestador para armar
        // candidatos); el autor siempre sale del DOM.
        sendResponse(await domCollect(msg.handle));
      } else {
        sendResponse({ ok: false, error: "tipo desconocido" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async
});
```

- [ ] **Step 3: Verificar** — `node --check infra/escucha-extension/content.js` (debe salir sin output) y `npx vitest run` (la suite sigue verde: `content.js` no se importa desde tests).

- [ ] **Step 4: Commit**

```bash
git add -- infra/escucha-extension/content.js infra/escucha-extension/manifest.json && git commit -m "feat(extension): content script con perfil, piezas, comentarios e historias sobre core/*" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/content.js infra/escucha-extension/manifest.json
```

---

### Task 6: `sw.js` — flujo por cuenta, errores estructurados y `run-summary`

**Files:** Modify `infra/escucha-extension/sw.js`, `infra/escucha-extension/panel.js`, `infra/escucha-extension/panel.html`

**Depende de:** Task 5 (las formas de mensaje tienen que coincidir exactamente).

- [ ] **Step 1: Constantes y helpers** — en `sw.js`, debajo de `const PLATFORM_HOME = { … };` agregar:

```js
// Techos por cuenta y corrida (spec §3 y §4).
const IG_COMMENT_PIECES = 6;
const X_REPLY_PIECES = 2;
const MAX_ERRORES = 50;

// Error de corrida con forma estable: lo consume el panel y el server
// (POST /api/extension/signal kind:"run-summary").
function pushError(errores, platform, handle, step, detail) {
  if (errores.length >= MAX_ERRORES) return;
  errores.push({
    platform,
    handle: handle || undefined,
    step,
    detail: String(detail == null ? "" : detail).slice(0, 300),
  });
}
```

- [ ] **Step 2: Reportar la corrida** — debajo de `async function pushItems(items) { … }` agregar:

```js
// Resumen final de la corrida: sin esto nadie ve que una plataforma viene
// fallando hace días (IG devolvió 400 durante una semana sin que se notara).
async function reportRun(summary) {
  try {
    await api("/api/extension/signal", {
      method: "POST",
      body: JSON.stringify({ kind: "run-summary", ...summary }),
    });
  } catch (e) {
    console.warn("run-summary report failed", e);
  }
}
```

- [ ] **Step 3: Reemplazar el bucle de cuentas** — en `runCollection`, borrar todo el bloque que va desde `let igTab = null;` hasta el cierre del `for (const acc of accounts) { … }` y poner:

```js
  for (const acc of accounts) {
    const platform = acc.platform;
    if (cooled.has(platform)) continue;
    if (budget.remaining(platform) <= 0) continue;
    const handle = acc.handle.replace(/^@/, "");
    await setStatus({ estado: `${platform}: @${handle} (${done + 1}/${accounts.length})`, inserted, cuentas: done });

    try {
      const url = profileUrl(platform, handle);
      if (!url) { pushError(errores, platform, handle, "plan", "plataforma sin URL de perfil"); continue; }
      // Cada navegación gasta 1 request del presupuesto de la plataforma.
      const tab = await openIn(platform, url);
      await budget.spend(platform);
      const res = await send(
        tab.id,
        platform === "instagram"
          ? { type: "ig-collect", handle, since: acc.since }
          : { type: "dom-profile", handle, since: acc.since },
      );
      if (!res.ok) { pushError(errores, platform, handle, "colecta", res.error || "sin respuesta"); continue; }
      done++;

      const sig = signalFromResponse(res.status, res.body);
      if (sig) {
        cooled.add(platform);
        await reportSignal(platform, sig);
        pushError(errores, platform, handle, "breaker", sig);
        await setStatus({ estado: `${platform} enfriado (${sig})`, inserted, cuentas: done });
        continue; // nunca reintentar en la misma corrida
      }
      for (const e of res.errors || []) pushError(errores, platform, handle, e.step, e.detail);
      inserted += await pushItems(res.items || []);
      await setStatus({ inserted, cuentas: done });

      const pieces = res.pieces || [];
      if (platform === "instagram") {
        // Comentarios de las piezas nuevas con más comentarios (máx. 6).
        const conComentarios = [...pieces]
          .filter((p) => (p.commentCount || 0) > 0)
          .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0))
          .slice(0, IG_COMMENT_PIECES);
        for (const p of conComentarios) {
          if (cooled.has(platform) || budget.remaining(platform) <= 0) break;
          await setStatus({ estado: `instagram: comentarios de @${handle}`, inserted, cuentas: done });
          await budget.spend(platform);
          const cr = await send(tab.id, { type: "ig-comments", pk: p.pk, url: p.url, handle });
          if (!cr.ok) { pushError(errores, platform, handle, "comentarios", cr.error || "sin respuesta"); continue; }
          const csig = signalFromResponse(cr.status, cr.body);
          if (csig) {
            cooled.add(platform);
            await reportSignal(platform, csig);
            pushError(errores, platform, handle, "breaker", csig);
            break;
          }
          inserted += await pushItems(cr.items || []);
          await setStatus({ inserted });
        }
      } else if (platform === "x") {
        // Respuestas de las 2 piezas con más respuestas de esta corrida.
        const conRespuestas = [...pieces]
          .filter((p) => (p.replyCount || 0) > 0)
          .sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0))
          .slice(0, X_REPLY_PIECES);
        for (const p of conRespuestas) {
          if (cooled.has(platform) || budget.remaining(platform) <= 0) break;
          await setStatus({ estado: `x: respuestas de @${handle}`, inserted, cuentas: done });
          const rtab = await openIn(platform, p.url);
          await budget.spend(platform);
          const rr = await send(rtab.id, { type: "dom-replies", url: p.url, handle });
          if (!rr.ok) { pushError(errores, platform, handle, "respuestas", rr.error || "sin respuesta"); continue; }
          const rsig = signalFromResponse(rr.status, rr.body);
          if (rsig) {
            cooled.add(platform);
            await reportSignal(platform, rsig);
            pushError(errores, platform, handle, "breaker", rsig);
            break;
          }
          inserted += await pushItems(rr.items || []);
          await setStatus({ inserted });
        }
      }
    } catch (e) {
      console.warn("colecta falló", platform, acc.handle, e);
      pushError(errores, platform, handle, "excepción", String((e && e.message) || e));
    }
  }

  // Pestaña de Instagram para las búsquedas (ig-search es API, sirve
  // cualquier pestaña de instagram.com).
  let igTab = await findPlatformTab("instagram");
```

- [ ] **Step 4: Errores estructurados en las búsquedas y candidatos** — en el bloque de búsquedas y en el de candidatos, reemplazar los cuatro `errores.push(\`…\`)` por:

```js
          if (!res.ok) { pushError(errores, platform, undefined, "búsqueda", `"${q}": ${res.error || "sin respuesta"}`); continue; }
```
```js
          if (!res.ok) { pushError(errores, platform, undefined, "búsqueda", `"${q}": ${res.error || "sin respuesta"}`); continue; }
```
```js
        console.warn("búsqueda falló", platform, q, e);
        pushError(errores, platform, undefined, "búsqueda", `"${q}": ${String((e && e.message) || e)}`);
```
```js
      console.warn("candidatos falló", e);
      pushError(errores, "server", undefined, "candidatos", String((e && e.message) || e));
```

- [ ] **Step 5: Cierre de la corrida** — reemplazar el `await setStatus({ … finishedAt: Date.now() });` final y la notificación por:

```js
  await reportRun({
    cuentas: done,
    busquedas,
    items: inserted,
    candidatos: candidates.length,
    sugeridos,
    errores,
  });

  await setStatus({
    estado: `listo — ${inserted} nuevos · ${candidates.length} candidatos → ${sugeridos} sugeridos${errores.length ? ` · ${errores.length} errores` : ""}`,
    inserted, cuentas: done, busquedas, candidatos: candidates.length, sugeridos, errores, finishedAt: Date.now(),
  });
  chrome.notifications.create({
    type: "basic", iconUrl: "icons/icon128.png",
    title: "Monitor: corrida completa",
    message: `${done} cuentas, ${busquedas} búsquedas, ${inserted} menciones nuevas, ${sugeridos} actores sugeridos, ${errores.length} errores.`,
  });
```

- [ ] **Step 6: Panel** — en `panel.html`, agregar una quinta caja dentro de `<div class="counters">`:

```html
    <div class="box">
      <div class="num-sm warn" id="errores">0</div>
      <div class="muted">errores</div>
    </div>
```

y en `panel.js`, dentro de `refresh()`, después de la línea de `sugeridos`:

```js
    $("errores").textContent = Array.isArray(runStatus.errores) ? runStatus.errores.length : 0;
```

- [ ] **Step 7: Verificar** — `node --check infra/escucha-extension/sw.js && node --check infra/escucha-extension/panel.js && npx vitest run tests/extension-nav.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add -- infra/escucha-extension/sw.js infra/escucha-extension/panel.js infra/escucha-extension/panel.html && git commit -m "feat(extension): orquestación por cuenta con comentarios, errores estructurados y run-summary" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- infra/escucha-extension/sw.js infra/escucha-extension/panel.js infra/escucha-extension/panel.html
```

---

### Task 7: Server — `since` en el plan, `replyCount` en items, `run-summary` en signal y estado en el panel

**Files:** Create `lib/extension-since.ts`, `lib/extension-run.ts`; Modify `app/api/extension/plan/route.ts`, `app/api/extension/items/route.ts`, `app/api/extension/signal/route.ts`, `components/escucha/bloque-redes.tsx`, `components/escucha/escenario-tab.tsx`, `app/(dashboard)/escucha/page.tsx`; Test `tests/extension-plan-route.test.ts`, `tests/extension-items-route.test.ts`, `tests/extension-signal-route.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/extension-plan-route.test.ts
import { describe, it, expect, vi } from "vitest";

const NOW = Date.UTC(2026, 7, 26, 12);
const rows = [
  { author: "ferrooficial", connector_id: "meta-ig", kind: "post", published_at: "2026-08-25T12:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "story", published_at: "2026-08-24T12:00:00.000Z" },
  { author: "@FerroOficial", connector_id: "x-api", kind: "post", published_at: "2026-08-26T09:00:00.000Z" },
  { author: "otracuenta", connector_id: "x-api", kind: "post", published_at: "2026-08-26T10:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "comment", published_at: "2026-08-26T11:00:00.000Z" },
];
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: rows }) }) }) }) }) }) }),
}));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/monitor-config", async (o) => ({
  ...(await o<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => ({
    accounts: [
      { handle: "ferrooficial", platform: "instagram", category: "organizacion" },
      { handle: "@FerroOficial", platform: "x", category: "organizacion" },
      { handle: "sinhistorial", platform: "facebook", category: "medio" },
    ],
    searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {},
  }),
}));
vi.mock("@/lib/monitor-breaker", () => ({ readBreakerState: async () => ({}) }));

import { GET } from "@/app/api/extension/plan/route";
import { sinceByAccount, defaultSince } from "@/lib/extension-since";

const req = (token = "ok") =>
  new Request("https://a/api/extension/plan", { headers: { authorization: `Bearer ${token}` } });

describe("sinceByAccount", () => {
  it("usa la última pieza guardada por cuenta y 7 días atrás si no hay", async () => {
    const map = await sinceByAccount("p1", [
      { handle: "ferrooficial", platform: "instagram", category: "organizacion" },
      { handle: "@FerroOficial", platform: "x", category: "organizacion" },
      { handle: "sinhistorial", platform: "facebook", category: "medio" },
    ], NOW);
    expect(map["instagram:ferrooficial"]).toBe("2026-08-25T12:00:00.000Z");
    expect(map["x:ferrooficial"]).toBe("2026-08-26T09:00:00.000Z");
    expect(map["facebook:sinhistorial"]).toBe(defaultSince(NOW));
  });
  it("defaultSince son 7 días", () => {
    expect(defaultSince(NOW)).toBe(new Date(NOW - 7 * 86400_000).toISOString());
  });
});

describe("GET /api/extension/plan", () => {
  it("403 sin token válido", async () => {
    expect((await GET(req("bad"))).status).toBe(403);
  });
  it("cada cuenta viaja con su since", async () => {
    const body = await (await GET(req())).json();
    expect(body.accounts.map((a: { handle: string; since: string }) => [a.handle, a.since])).toEqual([
      ["ferrooficial", "2026-08-25T12:00:00.000Z"],
      ["@FerroOficial", "2026-08-26T09:00:00.000Z"],
      ["sinhistorial", expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)],
    ]);
    expect(body.budget).toBeDefined();
    expect(body.cooldowns).toEqual({});
  });
});
```

```ts
// tests/extension-items-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const upsert = vi.fn(async () => ({ inserted: 1, skipped: 0 }));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/listening-cache", () => ({ upsertItems: (...a: unknown[]) => upsert(...(a as [])) }));
import { POST } from "@/app/api/extension/items/route";

const req = (body: unknown, token = "ok") =>
  new Request("https://a/api/extension/items", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/extension/items", () => {
  beforeEach(() => upsert.mockClear());

  it("403 sin token válido", async () => {
    expect((await POST(req({ items: [] }, "bad"))).status).toBe(403);
  });

  it("acepta replyCount y lo guarda en meta", async () => {
    const res = await POST(req({ items: [{
      site: "x", text: "ganamos", url: "https://x.com/FerroOficial/status/222",
      author: "FerroOficial", kind: "post", publishedAt: "2026-08-25T20:00:00.000Z",
      metrics: { followers: 38200, likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 },
    }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, inserted: 1 });
    const [, connectorId, items] = upsert.mock.calls[0] as unknown as [string, string, Array<Record<string, unknown>>];
    expect(connectorId).toBe("x-api");
    expect(items[0].meta).toEqual({ followers: 38200, likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 });
  });

  it("acepta comentarios con parentUrl", async () => {
    const res = await POST(req({ items: [{
      site: "instagram", text: "vamos ferro", url: "https://www.instagram.com/p/BBB/#c1",
      author: "hincha1", kind: "comment", parentUrl: "https://www.instagram.com/p/BBB/",
      publishedAt: "2026-08-25T13:00:00.000Z", metrics: { likeCount: 4 },
    }] }));
    expect(res.status).toBe(200);
    const items = (upsert.mock.calls[0] as unknown as [string, string, Array<Record<string, unknown>>])[2];
    expect(items[0].kind).toBe("comment");
    expect(items[0].parentUrl).toBe("https://www.instagram.com/p/BBB/");
  });

  it("400 si replyCount es negativo", async () => {
    const res = await POST(req({ items: [{
      site: "x", text: "t", url: "https://x.com/a/status/1", metrics: { replyCount: -1 },
    }] }));
    expect(res.status).toBe(400);
  });
});
```

```ts
// tests/extension-signal-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const trip = vi.fn(async () => {});
const saveRun = vi.fn(async () => {});
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/monitor-breaker", () => ({ tripBreaker: (...a: unknown[]) => trip(...(a as [])) }));
vi.mock("@/lib/extension-run", () => ({ saveExtensionRun: (...a: unknown[]) => saveRun(...(a as [])) }));
import { POST } from "@/app/api/extension/signal/route";

const req = (body: unknown, token = "ok") =>
  new Request("https://a/api/extension/signal", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/extension/signal", () => {
  beforeEach(() => { trip.mockClear(); saveRun.mockClear(); });

  it("403 sin token válido", async () => {
    expect((await POST(req({ platform: "x", signal: "http_429" }, "bad"))).status).toBe(403);
  });

  it("señal de breaker: sigue enfriando la plataforma", async () => {
    const res = await POST(req({ platform: "x", signal: "http_429" }));
    expect(res.status).toBe(200);
    expect(trip).toHaveBeenCalledWith("p1", "x", "http_429");
    expect(saveRun).not.toHaveBeenCalled();
  });

  it("run-summary: guarda la corrida y no toca el breaker", async () => {
    const res = await POST(req({
      kind: "run-summary", cuentas: 6, busquedas: 4, items: 41, candidatos: 12, sugeridos: 2,
      errores: [{ platform: "instagram", handle: "ferrooficial", step: "feed", detail: "HTTP 400" }],
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(trip).not.toHaveBeenCalled();
    expect(saveRun).toHaveBeenCalledWith("p1", {
      cuentas: 6, busquedas: 4, items: 41, candidatos: 12, sugeridos: 2,
      errores: [{ platform: "instagram", handle: "ferrooficial", step: "feed", detail: "HTTP 400" }],
    });
  });

  it("run-summary sin errores: errores por defecto []", async () => {
    const res = await POST(req({ kind: "run-summary", cuentas: 1, busquedas: 0, items: 0, candidatos: 0, sugeridos: 0 }));
    expect(res.status).toBe(200);
    expect((saveRun.mock.calls[0] as unknown as [string, { errores: unknown[] }])[1].errores).toEqual([]);
  });

  it("400 con payload que no es ni señal ni run-summary", async () => {
    expect((await POST(req({ platform: "marte", signal: "http_429" }))).status).toBe(400);
    expect((await POST(req({ kind: "run-summary" }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/extension-plan-route.test.ts tests/extension-items-route.test.ts tests/extension-signal-route.test.ts`: fallan por `lib/extension-since` y `lib/extension-run` inexistentes, por `since` ausente en el plan, por `replyCount` rechazado y por `run-summary` inválido.

- [ ] **Step 3: `lib/extension-since.ts`**

```ts
// Fecha de corte por cuenta para la extensión: la última pieza guardada de
// esa cuenta en esa plataforma, o 7 días atrás si nunca se guardó nada. El
// content script filtra por fecha (taken_at / datetime) y NUNCA por posición:
// los posts fijados van primero y son viejos.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import type { MonitorAccount, Platform } from "@/lib/monitor-config";

const PLATFORM_BY_CONNECTOR: Record<string, Platform> = {
  "meta-ig": "instagram",
  "x-api": "x",
  "fb-pages": "facebook",
  tiktok: "tiktok",
};
// Comentarios e historias ajenas no marcan el corte de las piezas propias.
const PIECE_KINDS = ["post", "reel", "story"];
const DEFAULT_DAYS = 7;

interface Row {
  author: string | null;
  connector_id: string | null;
  kind: string | null;
  published_at: string | null;
}

export const accountKey = (platform: string, handle: string): string =>
  `${platform}:${handle.replace(/^@/, "").toLowerCase()}`;

export function defaultSince(nowMs = Date.now()): string {
  return new Date(nowMs - DEFAULT_DAYS * 86400_000).toISOString();
}

export async function sinceByAccount(
  projectId: string,
  accounts: MonitorAccount[],
  nowMs = Date.now(),
): Promise<Record<string, string>> {
  const fallback = defaultSince(nowMs);
  const out: Record<string, string> = {};
  for (const a of accounts) out[accountKey(a.platform, a.handle)] = fallback;
  if (!dbConfigured() || accounts.length === 0) return out;

  const { data } = await getSupabase()
    .from("listening_items")
    .select("author, connector_id, kind, published_at")
    .eq("project_id", projectId)
    .in("kind", PIECE_KINDS)
    .order("published_at", { ascending: false })
    .limit(2000);

  const resuelto = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    const platform = PLATFORM_BY_CONNECTOR[row.connector_id ?? ""];
    if (!platform || !row.author || !row.published_at) continue;
    const key = accountKey(platform, row.author);
    if (!(key in out) || resuelto.has(key)) continue;
    // Vienen ordenadas descendente: la primera de cada cuenta es la última.
    out[key] = row.published_at;
    resuelto.add(key);
  }
  return out;
}
```

- [ ] **Step 4: `lib/extension-run.ts`**

```ts
// Resumen de la última corrida de la extensión, por proyecto. Persistencia
// sin DDL: fila sintética de conector_config extension-run:<projectId>.
// Sin esto el operador y el soporte quedan a ciegas: Instagram devolvió 400
// durante días sin que nadie lo viera.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";

export interface ExtensionRunError {
  platform: string;
  handle?: string;
  step: string;
  detail: string;
}

export interface ExtensionRunInput {
  cuentas: number;
  busquedas: number;
  items: number;
  candidatos: number;
  sugeridos: number;
  errores: ExtensionRunError[];
}

export interface ExtensionRun extends ExtensionRunInput {
  at: string;
}

const MAX_ERRORES = 50;
const key = (projectId: string) => `extension-run:${projectId}`;

export async function saveExtensionRun(
  projectId: string,
  run: ExtensionRunInput,
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await upsertConectorConfig(key(projectId), {
      ...run,
      errores: run.errores.slice(0, MAX_ERRORES),
      at: new Date().toISOString(),
    });
  } catch (error) {
    log.warn("extension_run.save_failed", { error: (error as Error).message });
  }
}

export async function readExtensionRun(
  projectId: string,
): Promise<ExtensionRun | null> {
  if (!dbConfigured()) return null;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return (data?.config as ExtensionRun | undefined) ?? null;
}
```

- [ ] **Step 5: `plan/route.ts`** — reemplazar el bloque de `accounts` y el `NextResponse.json`:

```ts
import { NextResponse } from "next/server";
import { verifyExtensionToken } from "@/lib/extension-token";
import { getMonitorConfig } from "@/lib/monitor-config";
import { readBreakerState } from "@/lib/monitor-breaker";
import { sinceByAccount, accountKey, defaultSince } from "@/lib/extension-since";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });

  const [cfg, breaker] = await Promise.all([
    getMonitorConfig(projectId),
    readBreakerState(projectId),
  ]);

  // `since` por cuenta: el plugin filtra por fecha, nunca por posición.
  const since = await sinceByAccount(projectId, cfg.accounts);
  const accounts = cfg.accounts.map((a) => ({
    ...a,
    since: since[accountKey(a.platform, a.handle)] ?? defaultSince(),
  }));

  return NextResponse.json({
    accounts,
    searches: { a: cfg.searchesA, b: cfg.searchesB },
    budget: cfg.budget,
    // Plataformas enfriadas por el breaker: el plugin las saltea hasta cooldownUntil.
    cooldowns: breaker,
    // Horario plausible: el plugin ya lo respeta; se envía como recordatorio.
    ventanaHoraria: ["08:00", "01:00"],
  });
}
```

(El comentario "Barajar cuentas" que estaba sobre `const accounts = [...cfg.accounts];` se elimina: el shuffle lo hace el plugin en `runCollection`.)

- [ ] **Step 6: `items/route.ts`** — dentro del objeto `metrics` del `ItemSchema`, agregar después de `repostCount`:

```ts
      replyCount: z.number().int().nonnegative().optional(),
```

- [ ] **Step 7: `signal/route.ts`** — archivo completo:

```ts
// POST: dos payloads. (1) señal anti-bloqueo (429, checkpoint, captcha…): el
// servidor enfría esa plataforma para el proyecto; el plugin corta y no
// reintenta. (2) resumen de la corrida (kind:"run-summary"): se guarda para
// que el panel muestre cuántas cuentas se relevaron y qué falló.
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExtensionToken } from "@/lib/extension-token";
import { tripBreaker } from "@/lib/monitor-breaker";
import { saveExtensionRun } from "@/lib/extension-run";

const BreakerSchema = z.object({
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  signal: z.enum([
    "http_429",
    "http_401_403",
    "checkpoint",
    "try_later",
    "captcha",
    "empty_streak",
  ]),
});

const count = z.number().int().nonnegative();
const RunSummarySchema = z.object({
  kind: z.literal("run-summary"),
  cuentas: count,
  busquedas: count,
  items: count,
  candidatos: count,
  sugeridos: count,
  errores: z
    .array(
      z.object({
        platform: z.string().max(20),
        handle: z.string().max(120).optional(),
        step: z.string().max(40),
        detail: z.string().max(300),
      }),
    )
    .max(50)
    .default([]),
});

const Schema = z.union([RunSummarySchema, BreakerSchema]);

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  if ("kind" in parsed.data) {
    const { kind: _kind, ...run } = parsed.data;
    await saveExtensionRun(projectId, run);
    return NextResponse.json({ ok: true });
  }
  await tripBreaker(projectId, parsed.data.platform, parsed.data.signal);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Correr y ver pasar los tres tests** — `npx vitest run tests/extension-plan-route.test.ts tests/extension-items-route.test.ts tests/extension-signal-route.test.ts`.

- [ ] **Step 9: Mostrar la corrida en el bloque Redes** (server component, sin `"use client"`, sin exports que no sean componentes).

En `components/escucha/bloque-redes.tsx`, agregar el import y el tipo:

```tsx
import { timeAgo } from "@/components/escucha/source-rows";
import type { ExtensionRun } from "@/lib/extension-run";
```

sumar `extensionRun` a las props (tipo `ExtensionRun | null` y desestructurado en la firma junto a `now`), y renderizar como primer hijo del `<form>`:

```tsx
        <section
          aria-label="Última corrida de la extensión"
          className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <span className="text-zinc-700 dark:text-zinc-200">
            Última corrida de la extensión:{" "}
            <span className="font-mono tabular-nums">{timeAgo(extensionRun?.at, now)}</span>
            {extensionRun && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{extensionRun.cuentas}</span> cuentas
                {" · "}
                <span className="font-mono tabular-nums">{extensionRun.items}</span> ítems
                {" · "}
                <span className={extensionRun.errores.length > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>
                  <span className="font-mono tabular-nums">{extensionRun.errores.length}</span> errores
                </span>
              </>
            )}
          </span>
          {extensionRun && extensionRun.errores.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              {extensionRun.errores.slice(0, 10).map((e, i) => (
                <li key={`${e.platform}-${e.step}-${i}`} className="font-mono">
                  {e.platform}
                  {e.handle ? ` @${e.handle.replace(/^@/, "")}` : ""} · {e.step} · {e.detail}
                </li>
              ))}
              {extensionRun.errores.length > 10 && (
                <li className="text-zinc-500">y {extensionRun.errores.length - 10} más</li>
              )}
            </ul>
          )}
        </section>
```

- [ ] **Step 10: Pasar `extensionRun` desde la página**

En `components/escucha/escenario-tab.tsx`: agregar `import type { ExtensionRun } from "@/lib/extension-run";`, sumar `extensionRun: ExtensionRun | null;` a las props y pasar `extensionRun={props.extensionRun}` a `<BloqueRedes …>`.

En `app/(dashboard)/escucha/page.tsx`: agregar `import { readExtensionRun } from "@/lib/extension-run";`, sumar al `Promise.all` (y a su destructuring, al final de la lista) `tab === "escenario" ? readExtensionRun(projectId) : Promise.resolve(null)` como `extensionRun`, y pasar `extensionRun={extensionRun}` a `<EscenarioTab …>`.

- [ ] **Step 11: Verificar** — `npx vitest run && npx tsc --noEmit && npx eslint app/api/extension/plan/route.ts app/api/extension/items/route.ts app/api/extension/signal/route.ts lib/extension-since.ts lib/extension-run.ts components/escucha/bloque-redes.tsx components/escucha/escenario-tab.tsx "app/(dashboard)/escucha/page.tsx" && npm run build`.

- [ ] **Step 12: Commit**

```bash
git add -- lib/extension-since.ts lib/extension-run.ts app/api/extension/plan/route.ts app/api/extension/items/route.ts app/api/extension/signal/route.ts components/escucha/bloque-redes.tsx components/escucha/escenario-tab.tsx "app/(dashboard)/escucha/page.tsx" tests/extension-plan-route.test.ts tests/extension-items-route.test.ts tests/extension-signal-route.test.ts && git commit -m "feat(extension): since por cuenta, replyCount y resumen de corrida visible en Escenario" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- lib/extension-since.ts lib/extension-run.ts app/api/extension/plan/route.ts app/api/extension/items/route.ts app/api/extension/signal/route.ts components/escucha/bloque-redes.tsx components/escucha/escenario-tab.tsx "app/(dashboard)/escucha/page.tsx" tests/extension-plan-route.test.ts tests/extension-items-route.test.ts tests/extension-signal-route.test.ts
```

---

### Task 8: Métricas de comentarios y muestra en el prompt del informe

**Files:** Modify `lib/monitor-metrics.ts`, `lib/daily-report.ts`; Test `tests/monitor-metrics.test.ts` (ampliar), `tests/daily-report-metrics.test.ts` (crear)

- [ ] **Step 1: Tests que fallan** — reemplazar `tests/monitor-metrics.test.ts` por:

```ts
import { describe, it, expect, vi } from "vitest";
const NOW = Date.UTC(2026, 7, 25, 12);
const PIEZA = "https://www.instagram.com/p/BBB/";
const PIEZA2 = "https://www.instagram.com/p/CCC/";
let rows: Array<Record<string, unknown>> = [
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", url: null, parent_url: null, meta: { expiringAt: new Date(NOW + 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-24T10:00:00.000Z", created_at: "2026-08-24T10:00:00.000Z", text: "s0", url: null, parent_url: null, meta: { expiringAt: new Date(NOW - 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000, likeCount: 306 } },
];
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: rows }) }) }) }) }) }) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "somosferro2026", platform: "instagram", category: "organizacion" }], searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {} }) }));
import { accountMetrics } from "@/lib/monitor-metrics";

describe("accountMetrics", () => {
  it("historias vivas cuenta solo las no vencidas; ultimaPieza es el post más reciente", async () => {
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.historiasVivas).toBe(1);
    expect(m.ultimaPieza).toEqual({ url: PIEZA, text: "carrusel", likeCount: 306, at: "2026-08-25T09:00:00.000Z" });
    expect(m.piezas).toBe(1);
  });

  it("cuenta con solo historias: followers sale del meta de la historia, piezas 0", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", url: null, parent_url: null, meta: { followers: 1200, expiringAt: new Date(NOW + 3600_000).toISOString() } },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.followers).toBe(1200);
    expect(m.piezas).toBe(0);
    expect(m.historiasVivas).toBe(1);
  });

  it("los comentarios se asocian por parent_url, no por autor", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000, likeCount: 300 } },
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-24T09:00:00.000Z", created_at: "2026-08-24T09:00:00.000Z", text: "otra", url: PIEZA2, parent_url: null, meta: { followers: 1000, likeCount: 100 } },
      { author: "hincha1", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "vamos", url: `${PIEZA}#c1`, parent_url: PIEZA, meta: { likeCount: 4 } },
      { author: "hincha1", source: "instagram/extension", kind: "comment", published_at: "2026-08-24T10:00:00.000Z", created_at: "2026-08-24T10:00:00.000Z", text: "otra vez", url: `${PIEZA2}#c2`, parent_url: PIEZA2, meta: {} },
      { author: "hincha2", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:05:00.000Z", created_at: "2026-08-25T10:05:00.000Z", text: "aguante", url: `${PIEZA}#c3`, parent_url: PIEZA, meta: {} },
      { author: "ajeno", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:06:00.000Z", created_at: "2026-08-25T10:06:00.000Z", text: "de otra cuenta", url: "https://www.instagram.com/p/ZZZ/#c9", parent_url: "https://www.instagram.com/p/ZZZ/", meta: {} },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.comentarios).toBe(3);
    expect(m.comentaristas).toBe(2);
    // hincha1 aparece en 2 piezas de 2 comentaristas → 50%.
    expect(m.densidad).toBe(0.5);
    expect(m.muestraComentarios.map((c) => [c.autor, c.text])).toEqual([
      ["c1", "vamos"],
      ["c1", "otra vez"],
      ["c2", "aguante"],
    ]);
  });

  it("sin comentarios: densidad null y contadores en 0", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000 } },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.comentarios).toBe(0);
    expect(m.comentaristas).toBe(0);
    expect(m.densidad).toBeNull();
    expect(m.muestraComentarios).toEqual([]);
  });
});
```

y crear `tests/daily-report-metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { metricsLine, commentsSection } from "@/lib/daily-report";
import type { AccountMetrics } from "@/lib/monitor-metrics";

const base: AccountMetrics = {
  handle: "@ferrooficial",
  category: "organizacion",
  followers: 136000,
  amplificacion: 0.04,
  adhesion: 0.002,
  densidad: 0.5,
  comentarios: 41,
  comentaristas: 30,
  muestraComentarios: [
    { autor: "c1", text: "vamos ferro", at: "2026-08-25T13:00:00.000Z" },
    { autor: "c2", text: "aguante", at: "2026-08-25T13:05:00.000Z" },
  ],
  piezas: 3,
  ultimaActividad: "2026-08-26T09:00:00.000Z",
  historiasVivas: 2,
  ultimaPieza: { url: "https://www.instagram.com/p/BBB/", text: "carrusel del domingo", likeCount: 306, at: "2026-08-25T12:00:00.000Z" },
};

describe("metricsLine", () => {
  it("suma comentarios y densidad en porcentaje", () => {
    expect(metricsLine(base)).toBe(
      '- @ferrooficial [organizacion] seg:136000 amp:0.04 adh:0.002 com:41 dens:50% piezas:3 hist:2 última:2026-08-26 última pieza: "carrusel del domingo" (306 likes)',
    );
  });
  it("sin datos usa s/d", () => {
    const m: AccountMetrics = { ...base, amplificacion: null, adhesion: null, densidad: null, comentarios: 0, ultimaActividad: null, ultimaPieza: null };
    expect(metricsLine(m)).toBe("- @ferrooficial [organizacion] seg:136000 amp:s/d adh:s/d com:0 dens:s/d piezas:3 hist:2 última:s/d");
  });
});

describe("commentsSection", () => {
  it("una lista por cuenta con autores anonimizados", () => {
    expect(commentsSection([base])).toBe(
      "### @ferrooficial (41 comentarios, 30 comentaristas)\n- [c1] vamos ferro\n- [c2] aguante",
    );
  });
  it("cuentas sin comentarios se omiten", () => {
    expect(commentsSection([{ ...base, muestraComentarios: [] }])).toBe("(sin comentarios colectados)");
  });
  it("como máximo 6 cuentas, ordenadas por cantidad de comentarios", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...base, handle: `cuenta${i}`, comentarios: i }));
    const out = commentsSection(many);
    expect(out.match(/^### /gm)).toHaveLength(6);
    expect(out.startsWith("### @cuenta7 (7 comentarios")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/monitor-metrics.test.ts tests/daily-report-metrics.test.ts`: falla porque `comentarios`/`comentaristas`/`muestraComentarios` no existen y `metricsLine`/`commentsSection` no están exportadas.

- [ ] **Step 3: `lib/monitor-metrics.ts`** — archivo completo:

```ts
// Métricas del monitor electoral (spec §8). Definidas una sola vez; el
// informe las consume, no las recalcula. Se nutren de listening_items.meta
// (followers/likeCount/commentCount/viewCount/repostCount/replyCount) que
// carga el plugin. Cuentas agrupadas por categoría, que NO se comparan entre sí.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getMonitorConfig, type Category } from "@/lib/monitor-config";

// Muestra de comentarios para el prompt del informe: autor anonimizado.
export interface CommentSample {
  autor: string; // c1..cN dentro de la cuenta
  text: string;
  at?: string;
}

export interface AccountMetrics {
  handle: string;
  category: Category;
  followers: number;
  // Amplificación: vistas ÷ seguidores (>5 = circula fuera de su base).
  amplificacion: number | null;
  // Adhesión: me gusta ÷ seguidores.
  adhesion: number | null;
  // Densidad: proporción (0..1) de comentaristas que reaparecen en otra pieza.
  densidad: number | null;
  // Comentarios colectados sobre piezas de esta cuenta, y comentaristas únicos.
  comentarios: number;
  comentaristas: number;
  muestraComentarios: CommentSample[];
  piezas: number;
  ultimaActividad: string | null; // máx entre feed/historias (spec §7.2)
  // Historias (stories) vigentes en este momento, según meta.expiringAt.
  historiasVivas: number;
  // Post/reel más reciente entre las piezas (excluye historias y comentarios).
  ultimaPieza: { url?: string; text: string; likeCount?: number; at: string } | null;
}

interface Row {
  author: string | null;
  source: string | null;
  kind: string | null;
  published_at: string | null;
  created_at: string | null;
  text: string | null;
  meta: Record<string, unknown> | null;
  url: string | null;
  parent_url: string | null;
}

// Muestra por cuenta que viaja al prompt (spec §11: ≤15, anonimizada).
const MAX_SAMPLE = 15;
const MAX_SAMPLE_TEXT = 160;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const when = (r: Row): string => r.published_at ?? r.created_at ?? "";

// Métricas por cuenta del escenario, en la ventana dada.
export async function accountMetrics(
  projectId: string,
  days = 7,
  nowMs = Date.now(),
): Promise<AccountMetrics[]> {
  if (!dbConfigured()) return [];
  const cfg = await getMonitorConfig(projectId);
  if (cfg.accounts.length === 0) return [];
  const since = new Date(nowMs - days * 86400_000).toISOString();
  const { data } = await getSupabase()
    .from("listening_items")
    .select("author, source, kind, published_at, created_at, text, meta, url, parent_url")
    .eq("project_id", projectId)
    .gte("created_at", since)
    .limit(5000);
  const rows = (data ?? []) as Row[];

  return cfg.accounts.map((acc) => {
    const h = acc.handle.replace(/^@/, "").toLowerCase();
    const own = rows.filter(
      (r) => (r.author ?? "").replace(/^@/, "").toLowerCase() === h ||
             (r.source ?? "").toLowerCase().includes(h),
    );
    const propias = own.filter((r) => r.kind !== "comment");
    const posts = propias.filter((r) => r.kind !== "story");
    // Un comentario NO tiene el handle de la cuenta como autor (tiene el del
    // comentarista): se asocia por parent_url a una pieza propia.
    const ownUrls = new Set(propias.map((r) => r.url).filter((u): u is string => Boolean(u)));
    const comments = rows.filter(
      (r) => r.kind === "comment" && r.parent_url && ownUrls.has(r.parent_url),
    );
    const historiasVivas = propias.filter(
      (r) => r.kind === "story" && typeof r.meta?.expiringAt === "string" && +new Date(r.meta.expiringAt as string) > nowMs,
    ).length;

    let followers = 0;
    let views = 0;
    let likes = 0;
    // Seguidores/vistas/likes sobre todo lo propio (historias incluidas);
    // `posts` excluye historias y sólo alimenta piezas/ultimaPieza.
    for (const r of propias) {
      followers = Math.max(followers, num(r.meta?.followers) ?? 0);
      views += num(r.meta?.viewCount) ?? 0;
      likes += num(r.meta?.likeCount) ?? 0;
    }

    // Densidad: comentaristas que aparecen en ≥2 piezas distintas de la cuenta.
    const byCommenter = new Map<string, Set<string>>();
    const alias = new Map<string, string>();
    for (const c of comments) {
      const who = (c.author ?? "").replace(/^@/, "").toLowerCase();
      if (!who) continue;
      const set = byCommenter.get(who) ?? new Set<string>();
      set.add(c.parent_url as string);
      byCommenter.set(who, set);
      if (!alias.has(who)) alias.set(who, `c${alias.size + 1}`);
    }
    const recurrentes = [...byCommenter.values()].filter((s) => s.size >= 2).length;
    const densidad = byCommenter.size > 0 ? recurrentes / byCommenter.size : null;
    const muestraComentarios: CommentSample[] = [...comments]
      .sort((a, b) => when(b).localeCompare(when(a)))
      .slice(0, MAX_SAMPLE)
      .reverse()
      .map((c) => ({
        autor: alias.get((c.author ?? "").replace(/^@/, "").toLowerCase()) ?? "c?",
        text: (c.text ?? "").slice(0, MAX_SAMPLE_TEXT),
        at: c.published_at ?? c.created_at ?? undefined,
      }));

    const ultima = own.map(when).filter(Boolean).sort().at(-1) ?? null;
    const ultimaPiezaRow = [...posts].sort((a, b) => when(a).localeCompare(when(b))).at(-1) ?? null;
    const ultimaPieza = ultimaPiezaRow
      ? {
          url: ultimaPiezaRow.url ?? undefined,
          text: ultimaPiezaRow.text ?? "",
          likeCount: num(ultimaPiezaRow.meta?.likeCount),
          at: when(ultimaPiezaRow),
        }
      : null;

    return {
      handle: acc.handle,
      category: acc.category,
      followers,
      amplificacion: followers > 0 ? Number((views / followers).toFixed(2)) : null,
      adhesion: followers > 0 ? Number((likes / followers).toFixed(3)) : null,
      densidad: densidad !== null ? Number(densidad.toFixed(2)) : null,
      comentarios: comments.length,
      comentaristas: byCommenter.size,
      muestraComentarios,
      piezas: posts.length,
      ultimaActividad: ultima,
      historiasVivas,
      ultimaPieza,
    };
  });
}
```

- [ ] **Step 4: `lib/daily-report.ts`** — agregar el import del tipo y las dos funciones puras (arriba de `generateDailyReport`, junto a `fmtItems`):

```ts
import { accountMetrics, type AccountMetrics } from "@/lib/monitor-metrics";
```

```ts
// Cuentas con muestra de comentarios que entran al prompt (spec §12).
const MAX_COMMENT_ACCOUNTS = 6;

// Una línea por cuenta para el prompt. Densidad en porcentaje: "dens:50%".
export function metricsLine(m: AccountMetrics): string {
  const dens = m.densidad !== null ? `${Math.round(m.densidad * 100)}%` : "s/d";
  const pieza = m.ultimaPieza
    ? ` última pieza: "${m.ultimaPieza.text.slice(0, 60)}" (${m.ultimaPieza.likeCount ?? "s/d"} likes)`
    : "";
  return (
    `- @${m.handle.replace(/^@/, "")} [${m.category}] seg:${m.followers}` +
    ` amp:${m.amplificacion ?? "s/d"} adh:${m.adhesion ?? "s/d"}` +
    ` com:${m.comentarios} dens:${dens} piezas:${m.piezas} hist:${m.historiasVivas}` +
    ` última:${m.ultimaActividad?.slice(0, 10) ?? "s/d"}${pieza}`
  );
}

// Material para "06 Tono y densidad": comentarios reales, autor anonimizado.
export function commentsSection(metrics: AccountMetrics[]): string {
  const conComentarios = metrics
    .filter((m) => m.muestraComentarios.length > 0)
    .sort((a, b) => b.comentarios - a.comentarios)
    .slice(0, MAX_COMMENT_ACCOUNTS);
  if (conComentarios.length === 0) return "(sin comentarios colectados)";
  return conComentarios
    .map((m) =>
      `### @${m.handle.replace(/^@/, "")} (${m.comentarios} comentarios, ${m.comentaristas} comentaristas)\n` +
      m.muestraComentarios.map((c) => `- [${c.autor}] ${c.text}`).join("\n"),
    )
    .join("\n\n");
}
```

Y en el prompt, reemplazar la sección de métricas por:

```ts
## Métricas por cuenta (ventana 7 días; amplificación=vistas/seg, adhesión=likes/seg, com=comentarios colectados, densidad=% de comentaristas que reaparecen en otra pieza)
${metrics.length ? metrics.map(metricsLine).join("\n") : "(sin métricas)"}

## Comentarios recientes por cuenta (muestra, autores anonimizados c1..cN)
${commentsSection(metrics)}
```

- [ ] **Step 5: Correr y ver pasar** — `npx vitest run tests/monitor-metrics.test.ts tests/daily-report-metrics.test.ts tests/daily-report-split.test.ts tests/daily-report-email.test.ts && npx tsc --noEmit && npx eslint lib/monitor-metrics.ts lib/daily-report.ts`.

- [ ] **Step 6: Commit**

```bash
git add -- lib/monitor-metrics.ts lib/daily-report.ts tests/monitor-metrics.test.ts tests/daily-report-metrics.test.ts && git commit -m "feat(monitor): comentarios, comentaristas y densidad reales por cuenta en el informe" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- lib/monitor-metrics.ts lib/daily-report.ts tests/monitor-metrics.test.ts tests/daily-report-metrics.test.ts
```

---

### Task 9: Deploy, extensión y smoke

- [ ] Suite completa verde: `npx vitest run && npx tsc --noEmit && npx eslint && npm run build`.
- [ ] Merge ff a `main`, push, esperar el deploy y `/api/version`.
- [ ] **Config del operador (fuera de código, pero bloquea el smoke):** en `/escucha?tab=escenario` → bloque Redes → "Cuentas a monitorear", dejar `ferrooficial, instagram, organizacion` y `FerroOficial, x, organizacion` (las cargadas hoy, `@ferrocarriloeste` y `@ferrooesteoficial`, no existen). Guardar redes.
- [ ] **Recargar la extensión**: bajar el zip nuevo desde Escucha → Informe, o `chrome://extensions` → Actualizar si la carpeta cargada es un clon del repo. Verificar en `chrome://extensions` que el manifest quedó en `0.3.0` y que no hay errores de carga.
- [ ] Con una pestaña logueada de instagram.com y otra de x.com, abrir el panel lateral → "Correr colecta ahora".
- [ ] **Verificación en el panel:** cuentas relevadas 2, errores 0. Si el contador de errores no es 0, mirar `chrome://extensions` → "service worker" → consola: los errores llevan `{platform, handle, step, detail}`.
- [ ] **Verificación del import dinámico** (el riesgo nuevo de esta iteración): abrir DevTools de la pestaña de instagram.com durante la corrida; si aparece un error de carga de `chrome-extension://…/core/parse.js`, es que `web_accessible_resources` no matchea ese origen — corregir el manifest antes de seguir.
- [ ] **Verificación en DB** (`listening_items` del proyecto Ferro): filas con `kind` `post`, `reel`, `comment` y `story`; `connector_id` `meta-ig`/`x-api`; `meta` con `followers`, `likeCount`, `viewCount` en las piezas y `likeCount` en los comentarios; los `comment` con `parent_url` igual a la `url` de una pieza de la misma corrida (si no coinciden exactamente, la densidad queda en 0).
- [ ] **Verificación en el panel de Escenario:** bloque Redes muestra "Última corrida de la extensión: recién · 2 cuentas · N ítems · 0 errores".
- [ ] **Verificación en el informe:** generar el informe diario y confirmar que la línea por cuenta trae `com:N dens:X%` con valores reales (no `s/d`) y que la sección "Comentarios recientes por cuenta" tiene material.
- [ ] Logs a mirar en Vercel si algo falla: `extension.items`, `extension_run.save_failed`, `listening.cache.upsert_failed`, `monitor_breaker.tripped`.
- [ ] Si X o IG responden 429/checkpoint: el breaker enfría la plataforma 24–48 h y la corrida siguiente la saltea; no reintentar a mano.

## Self-review

- **Cobertura de la spec:** §3 IG perfil/feed/comentarios/historias → T1, T2, T5, T6. §4 X DOM con métricas y respuestas → T1, T3, T5, T6. §5 FB y §6 TikTok → T4, T5. §7 números localizados → T1. §8 presupuesto: cada navegación y cada llamada de comentarios gasta 1 → T6. §9 errores visibles + `run-summary` + panel → T6, T7. §10 `since` por cuenta y filtro por fecha → T2, T3, T7. §11 métricas server-side → T8. §12 prompt → T8. §13 fuera de alcance respetado (no hay comentarios de FB/TikTok, ni likers, ni visor de historias, ni `media/<pk>/seen`).
- **Sin placeholders:** ningún paso dice "igual que la tarea N"; los tests y las implementaciones están completos y repetidos donde hacía falta.
- **Consistencia de tipos entre `content.js` y `sw.js`:** `ig-collect {handle, since}` → `{ok, status, body, items[], pieces:[{pk,url,commentCount}], profile:{followers,posts,userId}, errors:[{step,detail}]}`; `ig-comments {pk,url,handle}` → `{ok, status, body, items[]}`; `dom-profile {handle, since}` → `{ok, status, items[], pieces:[{url,replyCount}], profile:{followers}|null, errors:[{step,detail}]}`; `dom-replies {url, handle}` → `{ok, status, items[]}`. El sw lee exactamente esas claves (`res.pieces`, `p.pk`, `p.commentCount`, `p.replyCount`, `res.errors[].step/detail`) y convierte cada `{step, detail}` en `{platform, handle, step, detail}`, que es la forma que valida `RunSummarySchema` y la que renderiza `bloque-redes.tsx` vía `ExtensionRunError`.
- **Contrato de items:** las únicas claves de `metrics` que emiten los `core/*` son `followers, likeCount, commentCount, viewCount, repostCount, replyCount, takenAt, expiringAt` — todas presentes en `ItemSchema` después de T7 Step 6. `kind` sólo toma `post|reel|comment|story`, todos en el enum.
- **Riesgo asumido:** `import()` dinámico desde un content script. Mitigado con `web_accessible_resources` para los cinco orígenes y con una verificación explícita en T9. Si Chrome lo bloqueara en algún origen, el fallback es concatenar `core/*.js` en `content.js` con un paso de build — no se planifica porque agregaría build a una extensión que hoy no lo tiene.
