# Informe editorial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El informe diario deja de ser un resumen genérico y pasa a ser editorial: título-tesis, bajada, cuenta regresiva en días escrita por el código, diez secciones numeradas fijas + Fuentes, KPIs, inferencias y advertencias etiquetadas. El brief del cliente pasa a tener un **maestro** (documento Markdown de hasta 60.000 caracteres, fuente de verdad del prompt) y el informe devuelve **propuestas de actualización del brief** que el operador acepta o descarta desde el panel.

**Architecture:** `lib/report-markdown.ts` (parser puro, sin dependencias) suma cuatro bloques — `bajada`, `countdown`, `kpi`, `callout` — y el helper `reportTitle`; los tres renderers que consumen ese árbol (`lib/report-html.ts` para el mail, `lib/pdf/daily-report-pdf.tsx` para el PDF, `components/escucha/report-view.tsx` para el panel) los dibujan con la paleta de DESIGN.md (zinc + índigo). `lib/client-brief.ts` suma `master`, `pendingUpdates` y los helpers puros `setMaster` / `mergeBriefUpdates` / `setBriefUpdateStatus`, con zod al leer. `lib/daily-report.ts` suma `countdownBlock` (puro, el código escribe la cuenta regresiva, no el modelo), `withCountdown`, `missingSections`, el system+prompt editorial nuevo con `maxTokens: 8000`, y `splitReport` extrae también `briefUpdates`. `components/escucha/brief-panel.tsx` suma la pestaña del maestro (textarea monoespaciada + importar `.md` en cliente) y la lista de propuestas pendientes, contra dos server actions nuevas.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript strict, zod 4, `@react-pdf/renderer`, Tailwind 4, vitest 4. Persistencia sin DDL en `conector_config` (`brief:<projectId>`, `daily-report:<projectId>`).

**Spec:** `docs/superpowers/specs/2026-08-26-informe-editorial-design.md`
**Referencia editorial:** `~/Downloads/BRIEFmonitoreoferro.md` §1.1, §7, §8, §8.1, §11.

---

## Convenciones

- Tests: `npx vitest run <archivo>`; suite completa: `npx vitest run`. Tipos: `npx tsc --noEmit`. Lint: `npx eslint <archivos>`.
- vitest incluye `tests/**/*.test.ts`, alias `@` → raíz del repo, entorno `node`, `testTimeout` 30 s.
- **Commits SIEMPRE con pathspec explícito**: `git add -- <archivos> && git commit -m "…" -- <archivos>`. Nunca `git commit -a`. Trailers del repo: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8`.
- **Estado intermedio esperado entre Task 1 y Task 2:** al agregar variantes al union `Block`, los tres `switch` exhaustivos (`blockHtml` en `lib/report-html.ts`, `BlockView` en `lib/pdf/daily-report-pdf.tsx` y en `components/escucha/report-view.tsx`) dejan de cubrir todos los casos y `npx tsc --noEmit` tira TS2366 ("Function lacks ending return statement") en esos tres archivos. Es esperado: Task 1 verifica con vitest, Task 2 devuelve el verde. **No pushear entre Task 1 y Task 2.**
- Los componentes `"use client"` NO pueden importar valores en runtime de `lib/client-brief.ts` (arrastra `node:crypto` al bundle). Sólo `import type`. Las constantes que necesite el cliente se pasan por props desde el componente servidor.

## Orden y paralelismo

| Task | Qué | Depende de | ¿Paralelo? |
| --- | --- | --- | --- |
| 1 | `lib/report-markdown.ts`: bloques nuevos + `reportTitle` | — | sí, con 3 |
| 2 | Renderers: mail, PDF, panel | 1 | no (1→2 secuencial) |
| 3 | `lib/client-brief.ts`: maestro + pendingUpdates | — | sí, con 1 |
| 4 | `lib/daily-report.ts`: countdown, prompt nuevo, briefUpdates, asunto | 1 + 3 | no |
| 5 | Panel: maestro, importar `.md`, propuestas + actions | 3 | sí, con 4 |
| 6 | Deploy + smoke con el brief de Ferro | 1-5 | no |

Tandas sugeridas: **(1 ‖ 3)** → **(2 ‖ 5)** → **4** → **6**. Task 4 necesita `countdown`/`kpi`/`callout` del parser (Task 1) y `mergeBriefUpdates` (Task 3); Task 5 necesita `setMaster`/`setBriefUpdateStatus` (Task 3).

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `lib/report-markdown.ts` | modificar | bloques `bajada`/`countdown`/`kpi`/`callout`, `reportTitle` |
| `lib/report-html.ts` | modificar | render de bloques nuevos + asunto con título-tesis |
| `lib/pdf/daily-report-pdf.tsx` | modificar | render de bloques nuevos + título-tesis en la portada |
| `components/escucha/report-view.tsx` | modificar | render de bloques nuevos + h1 visible |
| `lib/client-brief.ts` | modificar | `master`, `pendingUpdates`, `BriefUpdate`, `setMaster`, `mergeBriefUpdates`, `setBriefUpdateStatus`, zod al leer |
| `lib/daily-report.ts` | modificar | `countdownBlock`, `withCountdown`, `missingSections`, system+prompt editorial, `splitReport` con `briefUpdates` |
| `app/(dashboard)/escucha/actions.ts` | modificar | `guardarBriefMaestro`, `resolverBriefUpdate` |
| `components/escucha/brief-master.tsx` | crear | textarea monoespaciada + contador + importar `.md` (cliente) |
| `components/escucha/brief-panel.tsx` | modificar | monta el maestro y lista las propuestas pendientes |
| `components/escucha/escenario-tab.tsx` | modificar | pasa los flags `maestro` / `brief_error` |
| `tests/report-markdown.test.ts` | modificar | bloques nuevos |
| `tests/report-html.test.ts` | modificar | bloques nuevos + asunto |
| `tests/daily-report-pdf.test.ts` | modificar | bloques nuevos |
| `tests/client-brief.test.ts` | modificar | maestro + pendingUpdates |
| `tests/daily-report-split.test.ts` | modificar | `briefUpdates`, `countdownBlock`, `withCountdown`, `missingSections` |
| `tests/escucha-brief-actions.test.ts` | modificar | `guardarBriefMaestro`, `resolverBriefUpdate` |
| `tests/daily-report-email.test.ts` | modificar | asunto con el título-tesis |

---

### Task 1: `report-markdown` — bloques `bajada`, `countdown`, `kpi`, `callout` + `reportTitle`

**Files:** Modify `lib/report-markdown.ts`; Test `tests/report-markdown.test.ts`

- [ ] **Step 1: Escribir el test que falla** — agregar al final de `tests/report-markdown.test.ts` y sumar `reportTitle` al import de la línea 3, que queda `import { parseReportMarkdown, sectionsOf, renderableSections, escapeHtml, inlineToHtml, inlineToText, reportTitle } from "@/lib/report-markdown";`:

```ts
describe("bloques editoriales", () => {
  it("el primer párrafo después del h1 es la bajada; los siguientes son p", () => {
    const b = parseReportMarkdown("# Ferro llega dividido\n\nLa bajada de tres líneas.\n\nOtro párrafo.");
    expect(b.map((x) => x.t)).toEqual(["h", "bajada", "p"]);
    const bajada = b[1];
    expect(bajada.t === "bajada" && inlineToText(bajada.text)).toBe("La bajada de tres líneas.");
  });

  it("sin h1 no hay bajada", () => {
    const b = parseReportMarkdown("## 01 El escenario\n\nTexto.");
    expect(b.map((x) => x.t)).toEqual(["h", "p"]);
  });

  it("h1 seguido de h2 no genera bajada", () => {
    const b = parseReportMarkdown("# T\n\n## 01 El escenario\n\nTexto.");
    expect(b.map((x) => x.t)).toEqual(["h", "h", "p"]);
  });

  it("countdown parsea días | etiqueta | detalle y tolera líneas malformadas", () => {
    const b = parseReportMarkdown("```countdown\n12 | Asamblea | esta semana\nbasura sin pipes\n | sin dias | x\n40 | Elección | 6 semanas\n```");
    expect(b[0]).toEqual({
      t: "countdown",
      items: [
        { days: 12, label: "Asamblea", detail: "esta semana" },
        { days: 40, label: "Elección", detail: "6 semanas" },
      ],
    });
  });

  it("countdown sin ninguna línea válida no emite bloque", () => {
    expect(parseReportMarkdown("```countdown\nbasura\n```")).toEqual([]);
  });

  it("countdown sin detalle deja detail vacío", () => {
    const b = parseReportMarkdown("```countdown\n3 | Junta Electoral\n```");
    expect(b[0]).toEqual({ t: "countdown", items: [{ days: 3, label: "Junta Electoral", detail: "" }] });
  });

  it("kpi parsea valor | etiqueta | nota y corta en 4", () => {
    const b = parseReportMarkdown("```kpi\n312 | menciones 24 h | +18% vs ayer\n4 | historias vivas |\nsin etiqueta\n9 | cuentas nuevas | dos direcciones\n1 | listas activas | s/d\n7 | de más | corta acá\n```");
    expect(b[0]).toEqual({
      t: "kpi",
      items: [
        { value: "312", label: "menciones 24 h", note: "+18% vs ayer" },
        { value: "4", label: "historias vivas", note: "" },
        { value: "9", label: "cuentas nuevas", note: "dos direcciones" },
        { value: "1", label: "listas activas", note: "s/d" },
      ],
    });
  });

  it("otros bloques cercados siguen degradando a párrafo monoespaciado", () => {
    const b = parseReportMarkdown("```json\n{\"a\":1}\n```");
    expect(b[0]).toEqual({ t: "p", text: [{ t: "code", v: "{\"a\":1}" }] });
  });

  it("Inferencia y Advertencia abren callout; el resto es p", () => {
    const b = parseReportMarkdown("**Inferencia** — el orden por estructura no coincide con el de tamaño.\n\n**Advertencia:** la acusación es una declaración pública, no un hecho.\n\n**Dato** medido: 312 menciones.");
    expect(b.map((x) => x.t)).toEqual(["callout", "callout", "p"]);
    const inf = b[0];
    expect(inf.t === "callout" && inf.kind).toBe("inferencia");
    expect(inf.t === "callout" && inlineToText(inf.text)).toBe("el orden por estructura no coincide con el de tamaño.");
    const adv = b[1];
    expect(adv.t === "callout" && adv.kind).toBe("advertencia");
    expect(adv.t === "callout" && inlineToText(adv.text)).toBe("la acusación es una declaración pública, no un hecho.");
  });

  it("un párrafo que solo empieza en negrita no es callout", () => {
    const b = parseReportMarkdown("**Cloacas** — volumen alto.");
    expect(b[0].t).toBe("p");
  });

  it("reportTitle devuelve la tesis del h1 sin marcas, o null", () => {
    expect(reportTitle("# **Ferro** llega dividido a la asamblea\n\nBajada.")).toBe("Ferro llega dividido a la asamblea");
    expect(reportTitle("## 01 El escenario\nTexto")).toBeNull();
    expect(reportTitle("")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar** — `npx vitest run tests/report-markdown.test.ts`. Falla al importar: `reportTitle` no existe en `@/lib/report-markdown` (`TypeError: reportTitle is not a function`), y los casos de bajada / countdown / kpi / callout devuelven `p`.

- [ ] **Step 3: Implementar** — en `lib/report-markdown.ts`:

**3a.** Reemplazar el union `Block` completo por:

```ts
export type Block =
  | { t: "h"; level: 1 | 2 | 3; text: Inline[] }
  | { t: "p"; text: Inline[] }
  | { t: "bajada"; text: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; text: Inline[] }
  | { t: "table"; header: string[]; rows: string[][] }
  | { t: "countdown"; items: { days: number; label: string; detail: string }[] }
  | { t: "kpi"; items: { value: string; label: string; note: string }[] }
  | { t: "callout"; kind: "inferencia" | "advertencia"; text: Inline[] }
  | { t: "hr" };
```

**3b.** Justo antes de `export function parseReportMarkdown`, agregar:

```ts
// Bloques cercados que el informe editorial usa como datos, no como código:
// ```countdown (una línea por hito: días | etiqueta | detalle) y ```kpi (una
// línea por número del día: valor | etiqueta | nota). Tolerantes: la línea
// que no cumple se descarta y el resto del bloque sobrevive.
const cells = (line: string) => line.split("|").map((c) => c.trim());

function parseCountdownLines(raw: string[]): { days: number; label: string; detail: string }[] {
  const out: { days: number; label: string; detail: string }[] = [];
  for (const line of raw) {
    const t = line.trim();
    if (!t) continue;
    const [d = "", label = "", detail = ""] = cells(t);
    if (!/^-?\d+$/.test(d) || !label) continue;
    out.push({ days: Number(d), label, detail });
  }
  return out.slice(0, 8);
}

function parseKpiLines(raw: string[]): { value: string; label: string; note: string }[] {
  const out: { value: string; label: string; note: string }[] = [];
  for (const line of raw) {
    const t = line.trim();
    if (!t) continue;
    const [value = "", label = "", note = ""] = cells(t);
    if (!value || !label) continue;
    out.push({ value, label, note });
  }
  return out.slice(0, 4);
}

// "**Inferencia** …" / "**Advertencia**: …" → callout. Regla editorial: toda
// lectura que no sea dato medido va etiquetada (brief de referencia §8).
const CALLOUT_KIND: Record<string, "inferencia" | "advertencia"> = {
  inferencia: "inferencia",
  advertencia: "advertencia",
};

function calloutOf(text: Inline[]): { kind: "inferencia" | "advertencia"; text: Inline[] } | null {
  const first = text[0];
  if (!first || first.t !== "b") return null;
  const kind = CALLOUT_KIND[first.v.trim().replace(/:$/, "").toLowerCase()];
  if (!kind) return null;
  const rest = text.slice(1);
  const head = rest[0];
  if (head && head.t === "text") rest[0] = { t: "text", v: head.v.replace(/^[\s:.—–-]+/, "") };
  return { kind, text: rest };
}

// El primer párrafo después del h1 es la bajada (3-5 líneas que resumen el
// día). El parser lo tipa aparte para que los tres renderers lo destaquen.
function markBajada(blocks: Block[]): Block[] {
  const i = blocks.findIndex((b) => b.t === "h" && b.level === 1);
  if (i === -1) return blocks;
  const next = blocks[i + 1];
  if (!next || next.t !== "p") return blocks;
  return blocks.map((b, j) => (j === i + 1 && b.t === "p" ? { t: "bajada", text: b.text } : b));
}

// Tesis del día: el texto plano del primer h1. null si el modelo no lo puso.
export function reportTitle(markdown: string): string | null {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown.replace(/\r\n?/g, "\n"));
  if (!m) return null;
  return inlineToText(parseInline(m[1])).trim() || null;
}
```

**3c.** Dentro de `parseReportMarkdown`, reemplazar `flushPara` por:

```ts
  const flushPara = () => {
    if (!para.length) return;
    const text = parseInline(para.join(" "));
    const c = calloutOf(text);
    blocks.push(c ? { t: "callout", kind: c.kind, text: c.text } : { t: "p", text });
    para = [];
  };
```

**3d.** Dentro de `parseReportMarkdown`, reemplazar el bloque `if (fence) { … }` completo por:

```ts
    if (fence) {
      flushPara();
      const content: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        content.push(lines[i]);
        i++;
      }
      const lang = fence[1].toLowerCase();
      if (lang === "countdown") {
        const items = parseCountdownLines(content);
        if (items.length > 0) blocks.push({ t: "countdown", items });
        continue;
      }
      if (lang === "kpi") {
        const items = parseKpiLines(content);
        if (items.length > 0) blocks.push({ t: "kpi", items });
        continue;
      }
      blocks.push({ t: "p", text: [{ t: "code", v: content.join("\n") }] });
      continue;
    }
```

**3e.** Al final de `parseReportMarkdown`, reemplazar `return blocks;` por `return markBajada(blocks);`.

- [ ] **Step 4: Correr el test y verlo pasar** — `npx vitest run tests/report-markdown.test.ts`: 20 tests en verde (los 9 previos + los 11 nuevos). `npx eslint lib/report-markdown.ts tests/report-markdown.test.ts` limpio. `npx tsc --noEmit` queda **rojo a propósito** con TS2366 en `lib/report-html.ts`, `lib/pdf/daily-report-pdf.tsx` y `components/escucha/report-view.tsx` (los switch dejaron de ser exhaustivos): lo cierra Task 2.

- [ ] **Step 5: Commit**

```bash
git add -- lib/report-markdown.ts tests/report-markdown.test.ts && git commit -m "feat(informe): parser de bajada, countdown, kpi y callout" -- lib/report-markdown.ts tests/report-markdown.test.ts
```

---

### Task 2: Renderers — mail HTML, PDF y panel dibujan los bloques nuevos

**Files:** Modify `lib/report-html.ts`, `lib/pdf/daily-report-pdf.tsx`, `components/escucha/report-view.tsx`; Test `tests/report-html.test.ts`, `tests/daily-report-pdf.test.ts`

Depende de Task 1 (los bloques tienen que existir en el union). Es la tarea que devuelve `tsc` al verde.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/report-html.test.ts`:

```ts
const editorial = {
  at: "2026-08-26T12:00:00.000Z",
  markdown: [
    "# Ferro llega dividido a la asamblea",
    "",
    "Las tres agrupaciones cerraron la semana sin fórmula.",
    "",
    "## 01 El escenario",
    "",
    "```countdown",
    "12 | Asamblea de socios | esta semana",
    "40 | Elección de comisión | 6 semanas",
    "```",
    "",
    "Narrativa del escenario.",
    "",
    "## 02 Lo que cambió",
    "",
    "```kpi",
    "312 | menciones 24 h | +18% vs ayer",
    "4 | historias vivas | tres agrupaciones",
    "```",
    "",
    "**Inferencia** — la cadencia responde al calendario, no a la coyuntura.",
    "",
    "**Advertencia:** la denuncia es una declaración pública, no un hecho probado.",
  ].join("\n"),
  items24h: 312,
  items7d: 1200,
};

describe("renderReportEmail · bloques editoriales", () => {
  const out = renderReportEmail({ report: editorial, project: "Ferro", zona: "Caballito", appUrl: "https://app.test" });

  it("bajada, countdown con días y etiqueta, kpi con valor y etiqueta", () => {
    expect(out.html).toContain("Las tres agrupaciones cerraron la semana sin fórmula.");
    expect(out.html).toContain('data-block="countdown"');
    expect(out.html).toContain("Asamblea de socios");
    expect(out.html).toContain(">12<");
    expect(out.html).toContain('data-block="kpi"');
    expect(out.html).toContain("menciones 24 h");
    expect(out.html).toContain(">312<");
  });

  it("callouts con su kind y su etiqueta visible", () => {
    expect(out.html).toContain('data-callout="inferencia"');
    expect(out.html).toContain('data-callout="advertencia"');
    expect(out.html).toContain("Inferencia");
    expect(out.html).toContain("Advertencia");
    expect(out.html).toContain("la cadencia responde al calendario, no a la coyuntura.");
  });

  it("sigue sin traer script ni css externo", () => {
    expect(out.html).not.toMatch(/<script/i);
    expect(out.html).not.toMatch(/<link|@import|url\(/i);
  });
});
```

Reemplazar el cuerpo del test de `tests/daily-report-pdf.test.ts` por (mismo `describe`, se agrega un segundo `it`):

```ts
  it("rinde bajada, countdown, kpi y callouts sin romper", async () => {
    const buf = await renderDailyReportPdf({
      report: {
        at: "2026-08-26T12:00:00.000Z",
        markdown: [
          "# Ferro llega dividido a la asamblea",
          "",
          "Las tres agrupaciones cerraron la semana sin fórmula.",
          "",
          "## 01 El escenario",
          "",
          "```countdown",
          "12 | Asamblea de socios | esta semana",
          "40 | Elección de comisión | 6 semanas",
          "```",
          "",
          "## 02 Lo que cambió",
          "",
          "```kpi",
          "312 | menciones 24 h | +18% vs ayer",
          "```",
          "",
          "**Inferencia** — la cadencia responde al calendario.",
          "",
          "**Advertencia:** la denuncia es una declaración pública.",
        ].join("\n"),
        items24h: 312,
        items7d: 1200,
      },
      project: "Ferro",
      zona: "Caballito",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 30_000);
```

- [ ] **Step 2: Correr los tests y verlos fallar** — `npx vitest run tests/report-html.test.ts tests/daily-report-pdf.test.ts`. Fallan porque `blockHtml` / `BlockView` no manejan los bloques nuevos: el HTML no contiene `data-block="countdown"` (los `case` faltantes devuelven `undefined`, que se concatena como `"undefined"`), y `npx tsc --noEmit` reporta TS2366 en los tres renderers.

- [ ] **Step 3: Implementar `lib/report-html.ts`** — agregar los cuatro `case` dentro de `blockHtml`, antes de `case "hr":`:

```ts
    case "bajada":
      return `<p style="margin:0 0 16px;font-size:15.5px;line-height:1.6;color:${C.ink}">${inlineToHtml(b.text)}</p>`;
    case "countdown": {
      const w = Math.floor(100 / Math.max(b.items.length, 1));
      const tds = b.items
        .map(
          (it) =>
            `<td width="${w}%" style="padding:0 6px 8px 0;vertical-align:top"><div style="border:1px solid ${C.border};border-radius:8px;padding:10px 12px;background:#fff"><div style="font-size:24px;font-weight:600;line-height:1;color:${C.accent}">${escapeHtml(String(it.days))}</div><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin-top:3px">días</div><div style="font-size:13px;line-height:1.35;color:${C.ink};margin-top:7px">${escapeHtml(it.label)}</div>${it.detail ? `<div style="font-size:12px;color:${C.muted};margin-top:2px">${escapeHtml(it.detail)}</div>` : ""}</div></td>`,
        )
        .join("");
      return `<table role="presentation" data-block="countdown" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px"><tr>${tds}</tr></table>`;
    }
    case "kpi": {
      const w = Math.floor(100 / Math.max(b.items.length, 1));
      const tds = b.items
        .map(
          (it) =>
            `<td width="${w}%" style="padding:0 6px 8px 0;vertical-align:top"><div style="border:1px solid ${C.border};border-radius:8px;padding:10px 12px;background:${C.subtle}"><div style="font-size:22px;font-weight:600;line-height:1;color:${C.ink}">${escapeHtml(it.value)}</div><div style="font-size:12px;line-height:1.35;color:${C.soft};margin-top:5px">${escapeHtml(it.label)}</div>${it.note ? `<div style="font-size:11px;color:${C.muted};margin-top:2px">${escapeHtml(it.note)}</div>` : ""}</div></td>`,
        )
        .join("");
      return `<table role="presentation" data-block="kpi" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:0 0 14px"><tr>${tds}</tr></table>`;
    }
    case "callout": {
      const adv = b.kind === "advertencia";
      const line = adv ? "#b45309" : C.accent;
      const bg = adv ? "#fffbeb" : C.accentSoft;
      const label = adv ? "Advertencia" : "Inferencia";
      return `<div data-callout="${b.kind}" style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${line};background:${bg}"><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${line};margin-bottom:4px">${label}</div><div style="font-size:14px;line-height:1.55;color:${C.soft}">${inlineToHtml(b.text)}</div></div>`;
    }
```

- [ ] **Step 4: Implementar `lib/pdf/daily-report-pdf.tsx`** — agregar a `StyleSheet.create` (después de `p:`):

```ts
  bajada: { fontSize: 12, color: C.ink, lineHeight: 1.5, marginBottom: 12 },
  cards: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 8, marginRight: 6, marginBottom: 6, width: 120 },
  cardBig: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.accent },
  cardBigInk: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink },
  cardLabel: { fontSize: 9, color: C.ink, marginTop: 3 },
  cardNote: { fontSize: 8, color: C.muted, marginTop: 1 },
  callout: { borderLeftWidth: 2, paddingLeft: 8, paddingRight: 8, paddingVertical: 5, marginBottom: 8 },
  calloutLabel: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
```

y los cuatro `case` en `BlockView`, antes de `case "hr":`:

```tsx
    case "bajada":
      return <View style={s.bajada}><InlineText text={b.text} /></View>;
    case "countdown":
      return (
        <View style={s.cards}>
          {b.items.map((it, i) => (
            <View key={i} style={s.card}>
              <Text style={s.cardBig}>{it.days} días</Text>
              <Text style={s.cardLabel}>{it.label}</Text>
              {it.detail ? <Text style={s.cardNote}>{it.detail}</Text> : null}
            </View>
          ))}
        </View>
      );
    case "kpi":
      return (
        <View style={s.cards}>
          {b.items.map((it, i) => (
            <View key={i} style={s.card}>
              <Text style={s.cardBigInk}>{it.value}</Text>
              <Text style={s.cardLabel}>{it.label}</Text>
              {it.note ? <Text style={s.cardNote}>{it.note}</Text> : null}
            </View>
          ))}
        </View>
      );
    case "callout": {
      const adv = b.kind === "advertencia";
      const line = adv ? "#b45309" : C.accent;
      return (
        <View style={[s.callout, { borderLeftColor: line, backgroundColor: adv ? "#fffbeb" : C.accentSoft }]}>
          <Text style={[s.calloutLabel, { color: line }]}>{adv ? "Advertencia" : "Inferencia"}</Text>
          <InlineText text={b.text} />
        </View>
      );
    }
```

- [ ] **Step 5: Implementar `components/escucha/report-view.tsx`** — en `BlockView`, cambiar el `case "h"` para que el h1 se muestre (en el panel no hay portada que lo lleve, a diferencia del mail y el PDF) y agregar los cuatro `case` antes de `case "hr":`:

```tsx
    case "h":
      if (b.level === 1)
        return <h2 className="mb-3 text-[19px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100"><InlineText text={b.text} /></h2>;
      return b.level === 2
        ? <h3 className="mt-5 mb-2 border-l-2 border-[oklch(52%_0.13_255)] pl-2.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100"><InlineText text={b.text} /></h3>
        : <h4 className="mt-3 mb-1 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"><InlineText text={b.text} /></h4>;
    case "bajada":
      return <p className="mb-4 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200"><InlineText text={b.text} /></p>;
    case "countdown":
      return (
        <div className="mb-4 flex flex-wrap gap-2">
          {b.items.map((it, i) => (
            <div key={i} className="min-w-[120px] flex-1 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <div className="text-[22px] font-semibold leading-none tabular-nums text-[oklch(52%_0.13_255)]">{it.days}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">días</div>
              <div className="mt-1.5 text-[13px] leading-snug text-zinc-900 dark:text-zinc-100">{it.label}</div>
              {it.detail && <div className="text-[12px] text-zinc-500">{it.detail}</div>}
            </div>
          ))}
        </div>
      );
    case "kpi":
      return (
        <div className="mb-4 flex flex-wrap gap-2">
          {b.items.map((it, i) => (
            <div key={i} className="min-w-[120px] flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="text-[20px] font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">{it.value}</div>
              <div className="mt-1 text-[12px] leading-snug text-zinc-700 dark:text-zinc-300">{it.label}</div>
              {it.note && <div className="text-[11px] text-zinc-500">{it.note}</div>}
            </div>
          ))}
        </div>
      );
    case "callout": {
      const adv = b.kind === "advertencia";
      return (
        <div
          data-callout={b.kind}
          className={`mb-3 border-l-2 px-3 py-2 ${adv ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-[oklch(52%_0.13_255)] bg-[oklch(52%_0.13_255)]/8"}`}
        >
          <div className={`mb-1 text-[10px] font-medium uppercase tracking-[0.14em] ${adv ? "text-amber-700 dark:text-amber-400" : "text-[oklch(52%_0.13_255)]"}`}>
            {adv ? "Advertencia" : "Inferencia"}
          </div>
          <p className="text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300"><InlineText text={b.text} /></p>
        </div>
      );
    }
```

- [ ] **Step 6: Correr los tests y verlos pasar** — `npx vitest run tests/report-html.test.ts tests/daily-report-pdf.test.ts tests/report-markdown.test.ts` en verde; `npx tsc --noEmit` **limpio** (cierra el rojo intermedio de Task 1); `npx eslint lib/report-html.ts lib/pdf/daily-report-pdf.tsx components/escucha/report-view.tsx tests/report-html.test.ts tests/daily-report-pdf.test.ts` limpio.

- [ ] **Step 7: Commit**

```bash
git add -- lib/report-html.ts lib/pdf/daily-report-pdf.tsx components/escucha/report-view.tsx tests/report-html.test.ts tests/daily-report-pdf.test.ts && git commit -m "feat(informe): mail, PDF y panel dibujan bajada, countdown, kpi y callouts" -- lib/report-html.ts lib/pdf/daily-report-pdf.tsx components/escucha/report-view.tsx tests/report-html.test.ts tests/daily-report-pdf.test.ts
```

---

### Task 3: `client-brief` — brief maestro y propuestas de actualización

**Files:** Modify `lib/client-brief.ts`; Test `tests/client-brief.test.ts`

Independiente de Task 1 y Task 2: se puede correr en paralelo con Task 1.

- [ ] **Step 1: Escribir el test que falla** — en `tests/client-brief.test.ts`, sumar al import de `@/lib/client-brief` los nombres `MASTER_MAX_CHARS, setMaster, mergeBriefUpdates, setBriefUpdateStatus` y agregar al final del archivo:

```ts
describe("client-brief · brief maestro", () => {
  it("setMaster guarda texto, autor y fecha; briefText pone el maestro antes de los aportes", () => {
    const b0 = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "La lista opositora se llama Verde", at: NOW });
    const b1 = setMaster(b0, { text: "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.", by: "ana@x.ar", at: NOW });
    expect(b1.master).toEqual({ text: "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.", updatedAt: NOW, by: "ana@x.ar" });
    expect(briefText(b1)).toBe("# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.\n\n[2026-08-25 · ana@x.ar] La lista opositora se llama Verde");
    expect(b0.master).toBeUndefined();
  });

  it("setMaster con texto vacío borra el maestro", () => {
    const b = setMaster(setMaster(EMPTY_BRIEF, { text: "x", by: "a", at: NOW }), { text: "   ", by: "a", at: NOW });
    expect(b.master).toBeUndefined();
    expect(briefText(b)).toBe("");
  });

  it("setMaster rechaza más de 60.000 caracteres", () => {
    expect(MASTER_MAX_CHARS).toBe(60000);
    expect(() => setMaster(EMPTY_BRIEF, { text: "x".repeat(60001), by: "a", at: NOW })).toThrow(/60/);
  });

  it("briefHash cambia cuando cambia el maestro", () => {
    expect(briefHash(setMaster(EMPTY_BRIEF, { text: "a", by: "x", at: NOW }))).not.toBe(
      briefHash(setMaster(EMPTY_BRIEF, { text: "b", by: "x", at: NOW })),
    );
  });
});

describe("client-brief · propuestas de actualización", () => {
  it("mergeBriefUpdates agrega con id y status pending, dedupe por sección+texto y corta en 8", () => {
    const incoming = [
      { seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga, 1.2k seguidores" },
      { seccion: "3.5", texto: "  cuenta nueva @IdentidadVerdolaga, 1.2k seguidores  " },
      { seccion: "9", texto: "" },
      ...Array.from({ length: 9 }, (_, i) => ({ seccion: "7", texto: `regla ${i}` })),
    ];
    const out = mergeBriefUpdates(EMPTY_BRIEF, incoming, NOW);
    expect(out.pendingUpdates).toHaveLength(8);
    expect(out.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", status: "pending", reportAt: NOW });
    expect(out.pendingUpdates?.[0].id).toBeTruthy();
    expect(out.pendingUpdates?.map((u) => u.texto)).toEqual([
      "Cuenta nueva @identidadverdolaga, 1.2k seguidores",
      "regla 0", "regla 1", "regla 2", "regla 3", "regla 4", "regla 5", "regla 6",
    ]);
  });

  it("mergeBriefUpdates no repite una propuesta ya resuelta", () => {
    const b1 = mergeBriefUpdates(EMPTY_BRIEF, [{ seccion: "7", texto: "regla nueva" }], NOW);
    const b2 = setBriefUpdateStatus(b1, b1.pendingUpdates![0].id, "dismissed");
    const b3 = mergeBriefUpdates(b2, [{ seccion: "7", texto: "Regla nueva" }], "2026-08-26T00:00:00.000Z");
    expect(b3.pendingUpdates).toHaveLength(1);
    expect(b3.pendingUpdates?.[0].status).toBe("dismissed");
  });

  it("setBriefUpdateStatus cambia solo la indicada", () => {
    const b = mergeBriefUpdates(EMPTY_BRIEF, [{ seccion: "a", texto: "1" }, { seccion: "b", texto: "2" }], NOW);
    const out = setBriefUpdateStatus(b, b.pendingUpdates![1].id, "accepted");
    expect(out.pendingUpdates?.map((u) => u.status)).toEqual(["pending", "accepted"]);
  });

  it("getClientBrief normaliza con zod: maestro inválido y propuestas rotas se descartan", async () => {
    stored = {
      entries: [],
      master: { text: 42, updatedAt: NOW, by: "a" },
      pendingUpdates: [
        { id: "u1", seccion: "7", texto: "regla", reportAt: NOW, status: "pending" },
        { id: "u2", seccion: "7", texto: "", reportAt: NOW, status: "pending" },
        { id: "u3", seccion: "7", texto: "otra", reportAt: NOW, status: "raro" },
      ],
    };
    const b = await getClientBrief("p1");
    expect(b.master).toBeUndefined();
    expect(b.pendingUpdates).toEqual([{ id: "u1", seccion: "7", texto: "regla", reportAt: NOW, status: "pending" }]);
  });

  it("getClientBrief acepta un maestro válido", async () => {
    stored = { entries: [], master: { text: "# BRIEF", updatedAt: NOW, by: "ana@x.ar" } };
    expect((await getClientBrief("p1")).master).toEqual({ text: "# BRIEF", updatedAt: NOW, by: "ana@x.ar" });
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar** — `npx vitest run tests/client-brief.test.ts`: falla en el import (`setMaster`, `mergeBriefUpdates`, `setBriefUpdateStatus`, `MASTER_MAX_CHARS` no existen).

- [ ] **Step 3: Implementar** — en `lib/client-brief.ts`:

**3a.** Agregar `import { z } from "zod";` debajo de `import { log } from "@/lib/logger";`.

**3b.** Después de la interfaz `BriefEntry`, agregar:

```ts
// Brief maestro: el documento que el operador mantiene (mapa de actores,
// métricas medidas, hallazgos establecidos, reglas editoriales). Es la fuente
// de verdad del prompt del informe; los `entries` son notas incrementales
// entre versiones del maestro.
export interface BriefMaster {
  text: string;
  updatedAt: string; // ISO
  by: string; // email del operador
}

export const MASTER_MAX_CHARS = 60000;

// Hecho nuevo que el informe propone incorporar al maestro (spec §5). Nunca
// se edita el maestro solo: el operador acepta (→ aporte) o descarta.
export interface BriefUpdate {
  id: string;
  seccion: string;
  texto: string;
  reportAt: string; // ISO del informe que la propuso
  status: "pending" | "accepted" | "dismissed";
}
```

**3c.** Reemplazar la interfaz `ClientBrief` y `EMPTY_BRIEF` por:

```ts
export interface ClientBrief {
  entries: BriefEntry[];
  master?: BriefMaster;
  pendingUpdates?: BriefUpdate[];
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}

export const EMPTY_BRIEF: ClientBrief = { entries: [], pendingUpdates: [], suggestions: [] };
```

**3d.** Después de `normalizeProposal`, agregar los esquemas de lectura:

```ts
// Lo guardado en conector_config es JSON libre: se valida al leer y lo que no
// cumple se descarta (un maestro roto no puede tirar abajo el panel).
const MasterSchema = z.object({
  text: z.string(),
  updatedAt: z.string(),
  by: z.string(),
});

const BriefUpdateSchema = z.object({
  id: z.string().min(1),
  seccion: z.string().min(1),
  texto: z.string().min(1),
  reportAt: z.string().min(1),
  status: z.enum(["pending", "accepted", "dismissed"]),
});
```

**3e.** Reemplazar `briefText` por:

```ts
// Texto del brief tal como lo lee el modelo: primero el maestro completo,
// después los aportes (una línea por aporte, en orden).
export function briefText(brief: ClientBrief): string {
  const parts: string[] = [];
  const master = brief.master?.text.trim();
  if (master) parts.push(master);
  const aportes = brief.entries.map((e) => `[${e.at.slice(0, 10)} · ${e.by}] ${e.text}`).join("\n");
  if (aportes) parts.push(aportes);
  return parts.join("\n\n");
}
```

**3f.** Después de `removeEntry`, agregar los helpers puros del maestro y de las propuestas:

```ts
export function setMaster(
  brief: ClientBrief,
  input: { text: string; by: string; at?: string },
): ClientBrief {
  if (input.text.length > MASTER_MAX_CHARS) {
    throw new Error(`El brief maestro supera los ${MASTER_MAX_CHARS} caracteres`);
  }
  const text = input.text.trim();
  if (!text) return { ...brief, master: undefined };
  return { ...brief, master: { text, updatedAt: input.at ?? new Date().toISOString(), by: input.by } };
}

const updateKey = (seccion: string, texto: string) =>
  `${seccion.trim().toLowerCase()}::${texto.trim().toLowerCase()}`;

// Propuestas de actualización del brief que trae un informe. Fuera: las
// vacías, las que ya se propusieron antes (en cualquier estado) y los
// duplicados dentro de la misma tanda. Máximo 8 por informe (spec §5).
export function mergeBriefUpdates(
  brief: ClientBrief,
  incoming: { seccion: string; texto: string }[],
  reportAt = new Date().toISOString(),
): ClientBrief {
  const current = brief.pendingUpdates ?? [];
  const known = new Set(current.map((u) => updateKey(u.seccion, u.texto)));
  const added: BriefUpdate[] = [];
  for (const u of incoming) {
    if (added.length >= 8) break;
    const seccion = u.seccion.trim();
    const texto = u.texto.trim();
    if (!seccion || !texto) continue;
    const k = updateKey(seccion, texto);
    if (known.has(k)) continue;
    known.add(k);
    added.push({ id: randomUUID(), seccion, texto, reportAt, status: "pending" });
  }
  return { ...brief, pendingUpdates: [...current, ...added] };
}

export function setBriefUpdateStatus(
  brief: ClientBrief,
  id: string,
  status: BriefUpdate["status"],
): ClientBrief {
  return {
    ...brief,
    pendingUpdates: (brief.pendingUpdates ?? []).map((u) => (u.id === id ? { ...u, status } : u)),
  };
}
```

**3g.** Reemplazar el `return` de `getClientBrief` por:

```ts
  const master = cfg.master ? MasterSchema.safeParse(cfg.master) : null;
  return {
    entries: cfg.entries ?? [],
    master: master?.success ? master.data : undefined,
    pendingUpdates: (cfg.pendingUpdates ?? [])
      .map((u) => BriefUpdateSchema.safeParse(u))
      .filter((r): r is { success: true; data: BriefUpdate } => r.success)
      .map((r) => r.data),
    proposal: cfg.proposal ? normalizeProposal(cfg.proposal) : undefined,
    suggestions: cfg.suggestions ?? [],
  };
```

- [ ] **Step 4: Correr los tests y verlos pasar** — `npx vitest run tests/client-brief.test.ts` (los 11 previos siguen verdes: `briefText` sin maestro devuelve exactamente la línea de aportes, y `getClientBrief` sin fila devuelve `EMPTY_BRIEF`, que ahora incluye `pendingUpdates: []`). Después `npx tsc --noEmit` y `npx eslint lib/client-brief.ts tests/client-brief.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -- lib/client-brief.ts tests/client-brief.test.ts && git commit -m "feat(brief): brief maestro y propuestas de actualización" -- lib/client-brief.ts tests/client-brief.test.ts
```

---

### Task 4: `daily-report` — cuenta regresiva por código, prompt editorial, `briefUpdates` y asunto-tesis

**Files:** Modify `lib/daily-report.ts`, `lib/report-html.ts`, `lib/pdf/daily-report-pdf.tsx`; Test `tests/daily-report-split.test.ts`, `tests/daily-report-email.test.ts`, `tests/report-html.test.ts`

Depende de Task 1 (bloques `countdown`/`kpi`/`callout` y `reportTitle`) y de Task 3 (`mergeBriefUpdates`).

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/daily-report-split.test.ts`, cambiar el import a `import { splitReport, countdownItems, countdownBlock, withCountdown, missingSections } from "@/lib/daily-report";` y agregar al final:

```ts
describe("splitReport · briefUpdates", () => {
  it("extrae las propuestas de actualización del brief", () => {
    const text = "# Tesis\n\n```json\n{\"nuevosActores\":[],\"briefUpdates\":[{\"seccion\":\"3.5\",\"texto\":\"Cuenta nueva @identidadverdolaga (1.2k)\"},{\"seccion\":\"7\",\"texto\":\"Pontevedra es el predio de Merlo\"}]}\n```";
    const { markdown, briefUpdates } = splitReport(text);
    expect(markdown).toBe("# Tesis");
    expect(briefUpdates).toEqual([
      { seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga (1.2k)" },
      { seccion: "7", texto: "Pontevedra es el predio de Merlo" },
    ]);
  });

  it("propuestas inválidas se descartan y el informe se guarda igual", () => {
    const text = "T\n```json\n{\"briefUpdates\":[{\"seccion\":\"\",\"texto\":\"x\"},{\"texto\":\"sin seccion\"},{\"seccion\":\"9\",\"texto\":\"vale\"}]}\n```";
    expect(splitReport(text).briefUpdates).toEqual([{ seccion: "9", texto: "vale" }]);
  });

  it("sin bloque json → briefUpdates vacío", () => {
    expect(splitReport("# Solo texto").briefUpdates).toEqual([]);
  });

  it("corta en 8 propuestas", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ seccion: "7", texto: `r${i}` }));
    const text = `T\n\`\`\`json\n${JSON.stringify({ briefUpdates: many })}\n\`\`\``;
    expect(splitReport(text).briefUpdates).toHaveLength(8);
  });
});

describe("countdown", () => {
  const NOW = Date.UTC(2026, 7, 26, 12);
  const calendar = [
    { label: "Elección de comisión", date: "2026-10-05" },
    { label: "Asamblea de socios", date: "2026-09-07" },
    { label: "Cierre de listas | ya pasó", date: "2026-08-01" },
    { label: "Sin fecha", date: "no es fecha" },
  ];

  it("countdownItems ordena por días, filtra pasados e inválidos y limpia pipes", () => {
    expect(countdownItems(calendar, NOW)).toEqual([
      { days: 12, label: "Asamblea de socios", detail: "2 semanas" },
      { days: 40, label: "Elección de comisión", detail: "6 semanas" },
    ]);
  });

  it("countdownBlock arma el bloque cercado que entiende el parser", () => {
    expect(countdownBlock(calendar, NOW)).toBe(
      "```countdown\n12 | Asamblea de socios | 2 semanas\n40 | Elección de comisión | 6 semanas\n```",
    );
  });

  it("sin hitos futuros no hay bloque", () => {
    expect(countdownBlock([{ label: "viejo", date: "2020-01-01" }], NOW)).toBe("");
    expect(countdownBlock([], NOW)).toBe("");
  });

  it("withCountdown inserta después del heading 01", () => {
    const md = "# Tesis\n\nBajada.\n\n## 01 El escenario\n\nNarrativa.";
    expect(withCountdown(md, "```countdown\n3 | X | esta semana\n```")).toBe(
      "# Tesis\n\nBajada.\n\n## 01 El escenario\n\n```countdown\n3 | X | esta semana\n```\n\nNarrativa.",
    );
  });

  it("withCountdown sin heading 01 lo pone arriba de todo; bloque vacío no toca nada", () => {
    expect(withCountdown("# Tesis\n\nBajada.", "```countdown\n3 | X | hoy\n```")).toBe(
      "```countdown\n3 | X | hoy\n```\n\n# Tesis\n\nBajada.",
    );
    expect(withCountdown("# Tesis", "")).toBe("# Tesis");
  });
});

describe("missingSections", () => {
  it("lista las secciones fijas que el modelo no escribió", () => {
    const md = ["# T", "## 01 El escenario", "## 02 Lo que cambió", "## 10 Vigilancia", "## Fuentes"].join("\n\n");
    expect(missingSections(md)).toEqual(["03", "04", "05", "06", "07", "08", "09"]);
  });

  it("informe completo → sin faltantes", () => {
    const md = ["# T", ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => `## ${n} Sección`), "## Fuentes"].join("\n\n");
    expect(missingSections(md)).toEqual([]);
  });

  it("sin Fuentes la reporta", () => {
    const md = ["# T", ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => `## ${n} S`)].join("\n\n");
    expect(missingSections(md)).toEqual(["Fuentes"]);
  });
});
```

En `tests/daily-report-email.test.ts`, reemplazar el `const report = …` y la aserción del asunto:

```ts
const report = {
  at: "2026-08-25T12:00:00.000Z",
  markdown: "# Ferro llega dividido a la asamblea\n\nLas tres agrupaciones cerraron sin fórmula.\n\n## 01 El escenario\nHola.",
  items24h: 1,
  items7d: 2,
};
```

y dentro del primer `it`, cambiar `expect(body.subject).toMatch(/Ibicuy/);` por:

```ts
    expect(body.subject).toBe("Ibicuy · Ferro llega dividido a la asamblea");
    expect(body.html).toContain("Ferro llega dividido a la asamblea");
    expect(body.html).toContain("Las tres agrupaciones cerraron sin fórmula.");
```

(y `expect(body.html).toContain("Resumen ejecutivo")` pasa a `expect(body.html).toContain("01 El escenario")`).

En `tests/report-html.test.ts`, reemplazar el `it("subject con proyecto y fecha; text = markdown")` por:

```ts
  it("subject con el título-tesis; text = markdown", () => {
    expect(out.subject).toBe("Ibicuy · Informe");
    expect(out.text).toBe(report.markdown);
  });

  it("sin h1 el subject cae a proyecto + fecha", () => {
    const r = renderReportEmail({ report: { ...report, markdown: "## 01 El escenario\nx" }, project: "Ibicuy", zona: "", appUrl: "https://a" });
    expect(r.subject).toBe("Informe de escucha · Ibicuy · 25/08/2026");
  });
```

- [ ] **Step 2: Correr los tests y verlos fallar** — `npx vitest run tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/report-html.test.ts`: `countdownItems is not a function` (idem `countdownBlock`, `withCountdown`, `missingSections`), `briefUpdates` es `undefined`, y el asunto sigue siendo `Informe de escucha · Ibicuy · 25/08/2026`.

- [ ] **Step 3: Implementar el asunto-tesis en `lib/report-html.ts`** — importar `reportTitle` (la línea de import pasa a `import { parseReportMarkdown, renderableSections, inlineToHtml, escapeHtml, reportTitle, type Block } from "@/lib/report-markdown";`) y, dentro de `renderReportEmail`, reemplazar la línea del `subject` y el encabezado:

```ts
  const titulo = reportTitle(report.markdown);
  const subject = titulo ? `${project} · ${titulo}` : `Informe de escucha · ${project} · ${fechaCorta(report.at)}`;
```

y en el `<td style="padding:0 4px 12px">` del encabezado, reemplazar las dos líneas del nombre del proyecto y la meta por:

```ts
  <div style="font-size:22px;font-weight:600;line-height:1.15;color:${C.ink};margin-top:4px">${escapeHtml(titulo ?? project)}</div>
  <div style="font-size:13px;color:${C.muted};margin-top:2px">${escapeHtml(project)} · ${escapeHtml(fechaLarga(report.at))}${zona ? ` · ${escapeHtml(zona)}` : ""}</div>
```

(la bajada queda arriba del informe sin cambios extra: el parser la deja en el preámbulo, que `renderableSections` conserva y `blockHtml` dibuja con el estilo `bajada` de Task 2, antes de la primera sección.)

- [ ] **Step 4: Implementar el título-tesis en `lib/pdf/daily-report-pdf.tsx`** — importar `reportTitle` (`import { parseReportMarkdown, renderableSections, reportTitle, inlineToText, type Block, type Inline } from "@/lib/report-markdown";`) y dentro de `DailyReportDocument`, después de `const fecha = …`:

```ts
  const titulo = reportTitle(report.markdown);
```

y reemplazar las dos líneas de portada:

```tsx
        <Text style={s.title}>{titulo ?? project}</Text>
        <Text style={s.meta}>{project} · {fecha}{zona ? ` · ${zona}` : ""}</Text>
```

- [ ] **Step 5: Implementar `lib/daily-report.ts`**

**5a.** Imports: sacar `nextCountdown` (queda `import { getMonitorConfig } from "@/lib/monitor-config";`), agregar el tipo del calendario y `mergeBriefUpdates`:

```ts
import { getMonitorConfig, type CalendarEvent } from "@/lib/monitor-config";
```

```ts
import { getClientBrief, briefText, mergeSuggestions, mergeBriefUpdates, saveClientBrief } from "@/lib/client-brief";
```

**5b.** Después de `const CLAUDE_ID = "claude-api";`, agregar la cuenta regresiva y el chequeo de estructura:

```ts
// Secciones fijas del informe editorial (spec §3). Si el modelo se saltea
// alguna se loguea, pero el informe se guarda igual: el parser es tolerante.
const REQUIRED_SECTIONS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

export function missingSections(markdown: string): string[] {
  const present = new Set([...markdown.matchAll(/^##\s+(\d\d)\b/gm)].map((m) => m[1]));
  const missing = REQUIRED_SECTIONS.filter((n) => !present.has(n));
  if (!/^##\s+Fuentes\s*$/im.test(markdown)) missing.push("Fuentes");
  return missing;
}

// Detalle en palabras, nunca una fecha suelta (regla editorial del brief:
// la cuenta regresiva se expresa en días que faltan).
function countdownDetail(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days <= 7) return "esta semana";
  if (days <= 30) return `${Math.round(days / 7)} semanas`;
  return `${Math.round(days / 30)} meses`;
}

// Hitos futuros ordenados por cercanía. Los escribe el CÓDIGO, no el modelo:
// así la cuenta regresiva nunca se equivoca ni inventa fechas.
export function countdownItems(
  calendar: CalendarEvent[],
  now = Date.now(),
): { days: number; label: string; detail: string }[] {
  return calendar
    .map((e) => ({
      label: e.label.replace(/\|/g, "/").trim(),
      days: Math.ceil((+new Date(e.date) - now) / 86400_000),
    }))
    .filter((e) => Boolean(e.label) && Number.isFinite(e.days) && e.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((e) => ({ days: e.days, label: e.label, detail: countdownDetail(e.days) }));
}

export function countdownBlock(calendar: CalendarEvent[], now = Date.now()): string {
  const items = countdownItems(calendar, now);
  if (items.length === 0) return "";
  return ["```countdown", ...items.map((i) => `${i.days} | ${i.label} | ${i.detail}`), "```"].join("\n");
}

// El bloque va al inicio de "01 El escenario"; si el modelo no escribió ese
// heading, arriba de todo.
export function withCountdown(markdown: string, block: string): string {
  if (!block) return markdown;
  const m = /^##\s+01\b.*$/m.exec(markdown);
  if (!m || m.index === undefined) return `${block}\n\n${markdown}`;
  const end = m.index + m[0].length;
  return `${markdown.slice(0, end)}\n\n${block}${markdown.slice(end)}`;
}
```

**5c.** Ampliar el bloque JSON interno: después del `ActorSchema`/`NuevoActor`, agregar

```ts
// Propuesta de actualización del brief maestro (spec §5): hechos nuevos que
// deberían entrar al maestro. Se guardan como pendientes; el operador acepta
// o descarta desde el panel.
const BriefUpdateInputSchema = z.object({
  seccion: z.string().trim().min(1),
  texto: z.string().trim().min(1),
});
export type BriefUpdateInput = z.infer<typeof BriefUpdateInputSchema>;
```

y reemplazar `splitReport` por:

```ts
export function splitReport(text: string): {
  markdown: string;
  nuevosActores: NuevoActor[];
  briefUpdates: BriefUpdateInput[];
} {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const m = matches.at(-1);
  if (!m || m.index === undefined) return { markdown: text.trim(), nuevosActores: [], briefUpdates: [] };
  const markdown = text.slice(0, m.index).trim();
  try {
    const raw = JSON.parse(m[1]) as { nuevosActores?: unknown[]; briefUpdates?: unknown[] };
    const actores = (raw.nuevosActores ?? [])
      .map((a) => ActorSchema.safeParse(a))
      .filter((r): r is { success: true; data: NuevoActor } => r.success)
      .map((r) => r.data);
    const updates = (raw.briefUpdates ?? [])
      .map((u) => BriefUpdateInputSchema.safeParse(u))
      .filter((r): r is { success: true; data: BriefUpdateInput } => r.success)
      .map((r) => r.data)
      .slice(0, 8);
    return { markdown, nuevosActores: actores, briefUpdates: updates };
  } catch {
    log.warn("daily_report.actors_parse_failed", { head: m[1].slice(0, 200) });
    return { markdown, nuevosActores: [], briefUpdates: [] };
  }
}
```

**5d.** En `generateDailyReport`, reemplazar `const countdown = nextCountdown(monitor);` y `const isElectoral = monitor.accounts.length > 0;` por:

```ts
  const hitos = countdownItems(monitor.calendar);
```

**5e.** Reemplazar el `briefSection` por:

```ts
  const brief = await getClientBrief(projectId);
  const briefBody = briefText(brief);
  const briefSection = briefBody
    ? `## Brief maestro del cliente (fuente de verdad para el contexto)\n${briefBody}\n\n`
    : "";
```

**5f.** Reemplazar el `system` completo por:

```ts
  const system =
    "Sos analista de opinión pública de un centro de estudios. Escribís el " +
    "informe editorial diario para un operador: sobrio, denso en dato, sin " +
    "marketing y sin relleno. Español rioplatense, Markdown. Reglas " +
    "editoriales innegociables:\n" +
    "1. Separá hecho verificado de inferencia y etiquetá la inferencia: toda " +
    "lectura que no sea dato medido va en un párrafo que empieza con " +
    "**Inferencia**.\n" +
    "2. Una acusación de un usuario es una declaración pública, no un hecho: " +
    "va en un párrafo que empieza con **Advertencia**, sin atenuantes.\n" +
    "3. Nunca atribuyas una operación a una organización sin evidencia. Que " +
    "dos cuentas apunten al mismo blanco, o se hayan creado el mismo mes, no " +
    "prueba coordinación.\n" +
    "4. La tracción de una pieza se mide a las 24 h; por debajo es provisoria " +
    "y se declara como tal.\n" +
    "5. NO compares alcance entre categorías (medios partidarios contra " +
    "agrupaciones contra individuales contra institucional): cada categoría " +
    "se ordena por dentro y nunca contra otra.\n" +
    "6. La cuenta regresiva se expresa en días que faltan, nunca en fechas " +
    "sueltas.\n" +
    "7. Fechá con hora argentina (UTC-3): a las 02:00 UTC todavía es el día " +
    "anterior en Buenos Aires.\n" +
    "8. El informe no habla de sí mismo: sin menciones al método, a la " +
    "herramienta, a cambios de criterio ni a limitaciones técnicas.\n" +
    "9. No publiques nómina de particulares; sí agregados, densidades y " +
    "cuentas con relevancia organizativa.\n" +
    "10. Un resultado deportivo apaga la conversación política unas 12 h: no " +
    "leas esa caída de tracción como muerte del tema.\n" +
    "11. Verificá antes de reportar una primicia; si no podés verificarla, va " +
    "como **Advertencia**.\n" +
    "12. La rutina no es novedad: reportá el cambio, no la existencia.\n" +
    "13. No infieras ausencia a partir de una observación parcial: que una " +
    "cuenta no aparezca en el feed no significa que esté callada.";
```

**5g.** Reemplazar el `prompt` completo por:

```ts
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const prompt = `${briefSection}## Datos del sistema (mediciones de hoy)
Si el brief y estos datos se contradicen: el brief manda para el contexto, estos números mandan para las cifras medidas hoy.
Proyecto: ${project?.nombre ?? projectId}
Zona: ${cfg.zona || "sin definir"} (${cfg.pais})
Keywords monitoreadas: ${cfg.keywords.join(", ") || "ninguna"}
Momento de la corrida (hora argentina): ${ahora}

## Hitos en días (cuenta regresiva)
${hitos.length ? hitos.map((h) => `- faltan ${h.days} días para ${h.label} (${h.detail})`).join("\n") : "(sin hitos cargados)"}

## Cuentas monitoreadas por categoría (no se comparan entre categorías)
${monitor.accounts.length ? monitor.accounts.map((a) => `- [${a.category}] @${a.handle.replace(/^@/, "")} (${a.platform})${a.vinculo ? ` · vínculo: ${a.vinculo}` : ""}${a.nota ? ` · ${a.nota}` : ""}`).join("\n") : "(sin cuentas cargadas)"}

## Métricas por cuenta (ventana 7 días; amplificación=vistas/seg, adhesión=likes/seg, densidad=comentaristas recurrentes)
${metrics.length ? metrics.map((m) => `- @${m.handle.replace(/^@/, "")} [${m.category}] seg:${m.followers} amp:${m.amplificacion ?? "s/d"} adh:${m.adhesion ?? "s/d"} dens:${m.densidad ?? "s/d"} piezas:${m.piezas} hist:${m.historiasVivas} última:${m.ultimaActividad?.slice(0, 10) ?? "s/d"}${m.ultimaPieza ? ` última pieza: "${m.ultimaPieza.text.slice(0, 60)}" (${m.ultimaPieza.likeCount ?? "s/d"} likes)` : ""}`).join("\n") : "(sin métricas)"}

## Menciones de las últimas 24 horas (${items24.length})
${fmtItems(items24, 120) || "(sin menciones nuevas)"}

## Muestra de los últimos 7 días (${items7.length} total, para baseline)
${fmtItems(items7.slice(items24.length), 60) || "(sin muestra)"}

## Informe anterior (para continuidad; puede no existir)
${previous ? previous.markdown.slice(0, 3000) : "(primer informe)"}

## Memoria de errores (no repetir)
${monitor.noRepetir.length ? monitor.noRepetir.map((e) => `- ${e}`).join("\n") : "(sin correcciones registradas)"}

## Definiciones (lugares/personas/cargos)
${Object.entries(monitor.entidades).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "(ninguna)"}

## Estructura obligatoria del informe
Abrí con \`# \` y la **tesis del día**: una sola oración con sujeto y consecuencia, nunca "Informe diario" ni la fecha.
Debajo, un solo párrafo de 3 a 5 líneas: la **bajada**, que cuenta el día en prosa, sin listas y sin numeritos.
Después, exactamente estas secciones, en este orden y con estos títulos, sin agregar ni renombrar ninguna:

## 01 El escenario
Estado del tablero y qué se juega, narrando los hitos en días que faltan. NO escribas vos la cuenta regresiva: el sistema inserta el bloque acá.

## 02 Lo que cambió
Abrí con un bloque \`\`\`kpi de hasta 4 líneas con los números del día. Después, qué se movió respecto del informe anterior y qué no.

## 03 Línea de tiempo
Los hitos del día y de la semana en orden, con hora argentina. Una línea por hito.

## 04 Contenido efímero
Historias vivas y vencidas por cuenta: qué se dijo ahí que no está en el feed. Si no hay relevamiento del día, decilo en una línea.

## 05 Top 5 de discusiones
Tabla \`# | Tema | Origen | Alcance | Amplificadores\`, cinco filas como máximo, ordenadas por tracción.

## 06 Tono y densidad por agrupación
Tabla con una columna por agrupación: proporción de comentarios positivos y negativos, y densidad de comentaristas recurrentes. Leelo como potencial, no como resultado.

## 07 Mapa por categorías
Una tabla por categoría, ordenada por dentro por amplificación / adhesión / densidad. Marcá cuando el orden por estructura difiere del orden por tamaño. Nunca compares una categoría contra otra.

## 08 Cuentas nuevas y cuentas que operan
Cuentas que aparecieron hoy, cuántas en cada dirección del conflicto, y cuáles operan. Sin nómina de particulares.

## 09 Normativo y calendario
Reglamento, junta electoral, plazos y lo que falta confirmar.

## 10 Vigilancia
Tabla \`# | Qué vigilar | Por qué | Cuándo\`, con plazos concretos.

## Fuentes
Lista de URLs citadas, solo las que aparecen en las menciones de arriba o en el brief.

Ninguna sección se omite: si no hay material, escribila igual con una sola línea ("Sin novedades en el período").

## Convenciones de formato
- **Inferencia:** párrafo que arranca con \`**Inferencia**\` y sigue con la lectura. Toda lectura que no sea dato medido va así.
- **Advertencia:** párrafo que arranca con \`**Advertencia**\` para declaraciones no verificadas, acusaciones y rumores.
- **KPIs:** bloque cercado que abre con \`\`\`kpi y cierra con tres backticks, una línea por número: \`valor | etiqueta | nota\`, máximo 4 líneas. Solo en la sección 02.
- **Cuenta regresiva:** no la escribas. El sistema inserta un bloque \`countdown\` al inicio de la sección 01; vos narrá los hitos en días.
- **Tablas:** Markdown normal, con encabezado y línea de guiones.
- No uses ningún otro bloque cercado además de \`\`\`kpi y el \`\`\`json final.

Si casi no hay menciones nuevas, decilo sin inflar y sugerí ajustes de fuentes o keywords dentro de la sección 10.

## Bloque interno de cierre
Cerrá con un bloque \`\`\`json con este esquema exacto:
{ "nuevosActores": [{ "handle": "", "platform": "instagram|x|facebook|tiktok", "category": "organizacion|medio|individual|institucional|opera", "direccion": "A|B|?", "evidencia": "url de la mención", "razon": "por qué vale seguirla" }], "briefUpdates": [{ "seccion": "número o nombre de la sección del brief maestro", "texto": "el hecho nuevo, redactado para pegar en el brief" }] }
El bloque es interno (el operador lo revisa aparte): no lo menciones ni lo describas en el cuerpo del informe.
En "nuevosActores", solo cuentas que aparecen en las menciones de arriba y NO están en el plan${monitor.accounts.length ? ` (plan: ${monitor.accounts.map((a) => "@" + a.handle.replace(/^@/, "")).join(", ")})` : ""}. Si no hay, dejá el array vacío.
En "briefUpdates", hasta 8 propuestas de actualización del brief maestro: cuenta nueva con seguidores, hito confirmado, hallazgo que se rompió (anotá que se rompió, no lo borres), error propio detectado redactado como regla. Si no hay, dejá el array vacío.`;
```

**5h.** Reemplazar la llamada al modelo y el post-proceso:

```ts
  const result = await generateText({
    apiKey,
    system,
    prompt,
    maxTokens: 8000,
  });
  await incrementUsage(CLAUDE_ID, result.inputTokens + result.outputTokens, projectId);

  const { markdown: cuerpo, nuevosActores, briefUpdates } = splitReport(result.text);
  const faltantes = missingSections(cuerpo);
  if (faltantes.length > 0) log.warn("daily_report.structure_missing", { projectId, faltantes });
  const markdown = withCountdown(cuerpo, countdownBlock(monitor.calendar));
  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    pull,
  };
  await saveReport(projectId, report);
  try {
    let next = brief;
    if (nuevosActores.length > 0) next = mergeSuggestions(next, nuevosActores, monitor.accounts, report.at);
    if (briefUpdates.length > 0) next = mergeBriefUpdates(next, briefUpdates, report.at);
    const changed =
      next.suggestions.length !== brief.suggestions.length ||
      (next.pendingUpdates?.length ?? 0) !== (brief.pendingUpdates?.length ?? 0);
    if (changed) await saveClientBrief(projectId, next);
  } catch (e) {
    // El informe ya está guardado: una falla acá no puede frenar el mail.
    log.warn("daily_report.suggestions_save_failed", { projectId, error: (e as Error).message });
  }
  log.info("daily_report.generated", {
    projectId,
    items24h: items24.length,
    nuevosActores: nuevosActores.length,
    briefUpdates: briefUpdates.length,
    faltantes: faltantes.length,
    tokens: result.inputTokens + result.outputTokens,
  });
  return report;
```

- [ ] **Step 6: Correr los tests y verlos pasar** — `npx vitest run tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/report-html.test.ts tests/daily-report-pdf.test.ts` en verde; después `npx vitest run` (suite completa), `npx tsc --noEmit` y `npx eslint lib/daily-report.ts lib/report-html.ts lib/pdf/daily-report-pdf.tsx tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/report-html.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add -- lib/daily-report.ts lib/report-html.ts lib/pdf/daily-report-pdf.tsx tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/report-html.test.ts && git commit -m "feat(informe): prompt editorial, cuenta regresiva por código y asunto con la tesis" -- lib/daily-report.ts lib/report-html.ts lib/pdf/daily-report-pdf.tsx tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/report-html.test.ts
```

---

### Task 5: Panel — brief maestro, importar `.md` y propuestas pendientes

**Files:** Create `components/escucha/brief-master.tsx`; Modify `components/escucha/brief-panel.tsx`, `components/escucha/escenario-tab.tsx`, `app/(dashboard)/escucha/actions.ts`; Test `tests/escucha-brief-actions.test.ts`

Depende de Task 3 (`setMaster`, `setBriefUpdateStatus`, `MASTER_MAX_CHARS`). Se puede correr en paralelo con Task 4.

- [ ] **Step 1: Escribir el test que falla** — en `tests/escucha-brief-actions.test.ts`:

**1a.** Reemplazar el mock de `next/navigation` por uno que corte la ejecución como en producción:

```ts
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
```

**1b.** Tipar el estado del brief. Reemplazar el `let brief = { … }` y el `const saveClientBrief = …` por:

```ts
let brief: import("@/lib/client-brief").ClientBrief = {
  entries: [],
  pendingUpdates: [],
  suggestions: [
    { id: "x:nuevo", handle: "nuevo", platform: "x", category: "medio", direccion: "B", razon: "r", suggestedAt: NOW, status: "pending" },
  ],
};
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { brief = b; });
```

**1c.** Cambiar el import de las actions a `import { resolverActorSugerido, guardarBriefMaestro, resolverBriefUpdate } from "@/app/(dashboard)/escucha/actions";` y agregar al final del archivo:

```ts
// Las actions terminan en redirect(), que en producción lanza. El mock hace
// lo mismo: capturar el throw es la forma de leer a dónde redirigió.
async function run(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message.replace(/^REDIRECT:/, "");
  }
}

describe("guardarBriefMaestro", () => {
  beforeEach(() => {
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    saveClientBrief.mockClear();
  });

  it("guarda el maestro con autor y vuelve con maestro=1", async () => {
    const fd = new FormData();
    fd.set("master", "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.");
    expect(await run(() => guardarBriefMaestro(fd))).toBe("/escucha?tab=escenario&maestro=1");
    expect(brief.master?.text).toBe("# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.");
    expect(brief.master?.by).toBe("ana@x.ar");
  });

  it("más de 60.000 caracteres: no guarda y avisa", async () => {
    const fd = new FormData();
    fd.set("master", "x".repeat(60001));
    expect(await run(() => guardarBriefMaestro(fd))).toBe("/escucha?tab=escenario&brief_error=too_long");
    expect(saveClientBrief).not.toHaveBeenCalled();
  });
});

describe("resolverBriefUpdate", () => {
  const upd = {
    id: "u1",
    seccion: "3.5",
    texto: "Cuenta nueva @identidadverdolaga (1.2k seguidores)",
    reportAt: "2026-08-26T00:00:00.000Z",
    status: "pending" as const,
  };
  beforeEach(() => {
    brief = { entries: [], pendingUpdates: [upd], suggestions: [] };
    saveClientBrief.mockClear();
  });

  it("aceptar la suma como aporte [informe fecha · §sección] y la marca accepted", async () => {
    const fd = new FormData();
    fd.set("id", "u1");
    fd.set("accion", "aceptar");
    expect(await run(() => resolverBriefUpdate(fd))).toBe("/escucha?tab=escenario&maestro=1");
    expect(brief.entries.map((e) => e.text)).toEqual([
      "[informe 2026-08-26 · §3.5] Cuenta nueva @identidadverdolaga (1.2k seguidores)",
    ]);
    expect(brief.entries[0].by).toBe("ana@x.ar");
    expect(brief.pendingUpdates?.[0].status).toBe("accepted");
  });

  it("descartar no suma aporte y la marca dismissed", async () => {
    const fd = new FormData();
    fd.set("id", "u1");
    fd.set("accion", "descartar");
    await run(() => resolverBriefUpdate(fd));
    expect(brief.entries).toEqual([]);
    expect(brief.pendingUpdates?.[0].status).toBe("dismissed");
  });

  it("id inexistente: no guarda nada", async () => {
    const fd = new FormData();
    fd.set("id", "nope");
    fd.set("accion", "aceptar");
    expect(await run(() => resolverBriefUpdate(fd))).toBe("/escucha?tab=escenario");
    expect(saveClientBrief).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar** — `npx vitest run tests/escucha-brief-actions.test.ts`: falla en el import (`guardarBriefMaestro` y `resolverBriefUpdate` no existen en las actions).

- [ ] **Step 3: Implementar las actions** — en `app/(dashboard)/escucha/actions.ts`:

**3a.** Ampliar el import de `@/lib/client-brief`:

```ts
import { addEntry, getClientBrief, markApplied, removeEntry, saveClientBrief, setBriefUpdateStatus, setMaster, setSuggestionStatus, MASTER_MAX_CHARS, type ProposalBlock } from "@/lib/client-brief";
```

**3b.** Después de `quitarAporteBrief`, agregar:

```ts
// Brief maestro: el documento que manda sobre la config del panel para el
// contexto del informe. Se pisa entero en cada Guardar (no es append-only
// como los aportes) y no puede pasar de MASTER_MAX_CHARS.
export async function guardarBriefMaestro(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const text = String(formData.get("master") ?? "");
  if (text.length > MASTER_MAX_CHARS) redirect("/escucha?tab=escenario&brief_error=too_long");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, setMaster(brief, { by: await currentUserEmail(), text }));
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario&maestro=1");
}

// Propuesta de actualización del brief que trajo un informe: aceptar la suma
// como aporte fechado (el maestro nunca se edita solo, spec §5); descartar la
// marca y no vuelve.
export async function resolverBriefUpdate(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const id = String(formData.get("id") ?? "");
  const accepted = String(formData.get("accion") ?? "") === "aceptar";
  const brief = await getClientBrief(projectId);
  const u = (brief.pendingUpdates ?? []).find((x) => x.id === id);
  if (!u) {
    // Propuesta ya resuelta o inexistente (doble click / pestaña vieja).
    revalidatePath("/escucha");
    redirect("/escucha?tab=escenario");
  }
  let next = setBriefUpdateStatus(brief, id, accepted ? "accepted" : "dismissed");
  if (accepted) {
    next = addEntry(next, {
      by: await currentUserEmail(),
      text: `[informe ${u.reportAt.slice(0, 10)} · §${u.seccion}] ${u.texto}`,
    });
  }
  await saveClientBrief(projectId, next);
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario&maestro=1");
}
```

- [ ] **Step 4: Crear `components/escucha/brief-master.tsx`**

```tsx
"use client";

// Brief maestro: textarea monoespaciada con contador de caracteres, importar
// un .md (se lee en el cliente con FileReader y se pega en el textarea) y
// Guardar. No importa NADA en runtime de lib/client-brief: ese módulo usa
// node:crypto y arrastrarlo al bundle del cliente rompe el build. El límite
// llega por prop desde el componente servidor.
import { useRef, useState } from "react";
import { guardarBriefMaestro } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function BriefMaster({
  initial,
  max,
  updatedAt,
  by,
}: {
  initial: string;
  max: number;
  updatedAt?: string;
  by?: string;
}) {
  const [text, setText] = useState(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const excedido = text.length > max;

  const importar = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <form action={guardarBriefMaestro} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="brief-master" className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Brief maestro
        </label>
        <span className={`font-mono text-[11px] tabular-nums ${excedido ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
          {text.length.toLocaleString("es-AR")} / {max.toLocaleString("es-AR")}
        </span>
      </div>
      <textarea
        id="brief-master"
        name="master"
        rows={16}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pegá acá el brief maestro en Markdown: mapa de actores con seguidores y vínculos, métricas ya medidas, hallazgos establecidos, errores a no repetir, reglas editoriales y vigilancia del día."
        className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 font-mono text-[12px] leading-relaxed text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" disabled={excedido} pendingLabel="Guardando…">
          Guardar brief maestro
        </SubmitButton>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="sr-only"
          onChange={(e) => {
            importar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Importar .md
        </button>
        {updatedAt && (
          <span className="text-xs text-zinc-500">
            Última versión: {new Date(updatedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            {by ? ` · ${by}` : ""}
          </span>
        )}
        {excedido && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            Supera el límite: recortá {(text.length - max).toLocaleString("es-AR")} caracteres.
          </span>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Modificar `components/escucha/brief-panel.tsx`**

**5a.** Ampliar los imports:

```tsx
import {
  agregarAporteBrief,
  quitarAporteBrief,
  generarEscenarioIA,
  descartarPropuesta,
  resolverBriefUpdate,
} from "@/app/(dashboard)/escucha/actions";
import { BriefMaster } from "@/components/escucha/brief-master";
import { appliedCount, briefHash, isProposalPending, MASTER_MAX_CHARS, type ClientBrief, type ProposalBlock } from "@/lib/client-brief";
```

**5b.** Cambiar la firma de `flags` a:

```tsx
  flags: { saved: boolean; generated: boolean; maestroSaved: boolean; iaError?: string; briefError?: string };
```

y, dentro del componente, después de `const { faltan } = …`, agregar:

```tsx
  const pendientes = (brief.pendingUpdates ?? []).filter((u) => u.status === "pending");
```

**5c.** Reemplazar el `<p>` descriptivo del encabezado por:

```tsx
        <p className="max-w-[70ch] text-xs text-zinc-500">
          El brief maestro es el documento que manda: mapa de actores, métricas ya medidas,
          hallazgos establecidos, errores a no repetir y reglas editoriales. Los aportes de abajo
          son notas incrementales entre versiones del maestro. La IA arma el escenario con todo.
        </p>
```

**5d.** Justo después de ese encabezado (antes de la lista de aportes), montar el maestro y las propuestas:

```tsx
      <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <BriefMaster
          initial={brief.master?.text ?? ""}
          max={MASTER_MAX_CHARS}
          updatedAt={brief.master?.updatedAt}
          by={brief.master?.by}
        />
        <FormStatus
          ok={flags.maestroSaved ? "Brief maestro guardado." : null}
          error={flags.briefError === "too_long" ? `El brief maestro supera los ${MASTER_MAX_CHARS.toLocaleString("es-AR")} caracteres: no se guardó.` : null}
        />

        {pendientes.length > 0 && (
          <div className="space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <h3 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
              Propuestas de actualización ({pendientes.length})
            </h3>
            <p className="max-w-[70ch] text-xs text-zinc-500">
              Hechos nuevos que el último informe propone incorporar al maestro. Aceptar los suma
              como aporte fechado; el maestro nunca se edita solo.
            </p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {pendientes.map((u) => (
                <li key={u.id} className="flex flex-wrap items-start gap-2 py-2 text-[13px]">
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                    {fecha(u.reportAt)} · §{u.seccion}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{u.texto}</span>
                  <form action={resolverBriefUpdate} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <button
                      type="submit"
                      name="accion"
                      value="aceptar"
                      className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Aceptar
                    </button>
                    <button
                      type="submit"
                      name="accion"
                      value="descartar"
                      className="text-[11px] text-zinc-500 hover:text-red-600 dark:text-zinc-400"
                    >
                      Descartar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
```

**5e.** En el `FormStatus` del form de aportes, cambiar el mensaje de error para que no se coma el caso `too_long`:

```tsx
          <FormStatus ok={flags.saved ? "Aporte guardado." : null} error={flags.briefError === "vacio" ? "El aporte está vacío." : null} />
```

**5f.** El botón "Generar escenario con IA" hoy exige `brief.entries.length === 0`; ahora también sirve con maestro. Reemplazar las dos condiciones por `sinContexto`:

```tsx
  const sinContexto = brief.entries.length === 0 && !brief.master?.text;
```

```tsx
          <SubmitButton
            variant="accent"
            disabled={!canGenerate || sinContexto}
            pendingLabel="Leyendo el brief y armando el escenario…"
          >
            Generar escenario con IA
          </SubmitButton>
```

```tsx
        {canGenerate && sinContexto && (
          <span className="text-xs text-zinc-500">Cargá el brief maestro o agregá al menos un aporte.</span>
        )}
```

- [ ] **Step 6: Modificar `components/escucha/escenario-tab.tsx`** — en el `flags` que recibe `BriefPanel`, agregar la línea `maestroSaved: params.maestro === "1",`:

```tsx
        flags={{
          saved: params.brief === "1",
          generated: params.ia === "1",
          maestroSaved: params.maestro === "1",
          iaError: params.ia_error,
          briefError: params.brief_error,
        }}
```

- [ ] **Step 7: Correr los tests y verlos pasar** — `npx vitest run tests/escucha-brief-actions.test.ts` (5 tests nuevos + los 2 existentes en verde); después `npx tsc --noEmit` y `npx eslint "app/(dashboard)/escucha/actions.ts" components/escucha/brief-master.tsx components/escucha/brief-panel.tsx components/escucha/escenario-tab.tsx tests/escucha-brief-actions.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add -- "app/(dashboard)/escucha/actions.ts" components/escucha/brief-master.tsx components/escucha/brief-panel.tsx components/escucha/escenario-tab.tsx tests/escucha-brief-actions.test.ts && git commit -m "feat(escucha): brief maestro en el panel con importar .md y propuestas de actualización" -- "app/(dashboard)/escucha/actions.ts" components/escucha/brief-master.tsx components/escucha/brief-panel.tsx components/escucha/escenario-tab.tsx tests/escucha-brief-actions.test.ts
```

---

### Task 6: Deploy y smoke con el brief de Ferro

**Files:** ninguno (verificación end-to-end)

- [ ] **Step 1: Suite completa y build** — `npx vitest run && npx tsc --noEmit && npx eslint . && npm run build`. Todo verde antes de mergear.
- [ ] **Step 2: Merge y deploy** — merge fast-forward a `main`, `git push`, esperar el deploy y confirmar la versión nueva en `/api/version`.
- [ ] **Step 3: Cargar el brief maestro** — en `/escucha?tab=escenario`, "Importar .md" con `~/Downloads/BRIEFmonitoreoferro.md` (25 KB, bien por debajo del límite) → el contador tiene que mostrar ~25.000 / 60.000 → "Guardar brief maestro" → aparece "Brief maestro guardado." y la línea "Última versión: hoy · <tu mail>".
- [ ] **Step 4: Generar el informe** — `/escucha?tab=informe` → "Barrer y generar informe". Verificar en el panel:
  - un título-tesis en grande (una oración con sujeto y consecuencia, no "Informe diario") y la bajada debajo;
  - las tarjetas de cuenta regresiva al inicio de "01 El escenario", con días y etiqueta de cada hito del calendario del proyecto (si el proyecto no tiene hitos cargados, NO tiene que haber tarjetas y el texto debe decir que no hay hitos);
  - las tarjetas de KPI en "02 Lo que cambió";
  - al menos un callout de **Inferencia** (borde índigo) y, si hubo acusaciones, uno de **Advertencia** (borde ámbar);
  - los diez `## NN` + `## Fuentes`.
- [ ] **Step 5: Verificar el mail** — el asunto tiene que ser `Ferro · <tesis del día>`; el cuerpo, la tesis como encabezado, la bajada arriba del informe, y las tarjetas de countdown/KPI y los callouts dibujados. El PDF adjunto tiene que abrir con la tesis en la portada.
- [ ] **Step 6: Verificar el ciclo del brief** — volver a `/escucha?tab=escenario`: bajo el maestro tienen que aparecer las "Propuestas de actualización (N)" del informe. Aceptar una → se suma como aporte `[informe AAAA-MM-DD · §sección] …` en la lista de abajo y desaparece de las propuestas. Descartar otra → desaparece sin sumar aporte.
- [ ] **Step 7: Logs a mirar en Vercel si algo falla** — `daily_report.generated` (mirá `briefUpdates` y `faltantes`), `daily_report.structure_missing` (qué secciones se salteó el modelo), `daily_report.actors_parse_failed`, `daily_report.suggestions_save_failed`, `client_brief.save_failed`, `daily_report.pdf_failed`.
- [ ] **Step 8: Si el modelo se saltea secciones** — no tocar el parser: es tolerante por diseño. Ajustar el bloque "Estructura obligatoria del informe" del prompt (Task 4, Step 5g) y volver a generar con "Barrer y generar informe".

---

## Self-review

**Cobertura de la spec:**

| Decisión de la spec | Dónde |
| --- | --- |
| §1 `master` + textarea + importar `.md` + aportes debajo | T3 (`setMaster`, `MASTER_MAX_CHARS`), T5 (`BriefMaster`, `BriefPanel`) |
| §2 el maestro manda; config después como "datos del sistema" | T4 Step 5e + 5g (`briefSection` primero, encabezado explícito de precedencia) |
| §3 estructura fija, títulos `## NN`, `## Fuentes`, sin omitir secciones | T4 Step 5g (bloque "Estructura obligatoria") + `missingSections` (T4 Step 5b) |
| §3 `# Título` = tesis; primer párrafo = bajada | T1 (`markBajada`, `reportTitle`), T2 (render), T4 (asunto y portada) |
| §3 `countdown` escrito por el código, insertado en "01" | T4 (`countdownItems`, `countdownBlock`, `withCountdown`) |
| §3 `kpi` en "02" máx. 4 | T1 (`parseKpiLines` corta en 4), T4 Step 5g |
| §3 `**Inferencia**` / `**Advertencia**` → callout | T1 (`calloutOf`), T2 (los tres renderers), T4 (reglas 1 y 2 del system) |
| §3 tablas Top 5 / Tono y densidad / Vigilancia | T4 Step 5g (formato exacto de cada tabla) |
| §4 prompt nuevo, `maxTokens` 8000 | T4 Steps 5f-5h |
| §5 `briefUpdates` (máx. 8) → `pendingUpdates` → Aceptar/Descartar | T4 (`splitReport`, `mergeBriefUpdates`), T3, T5 (`resolverBriefUpdate`) |
| §6 los cuatro bloques en los tres renderers, zinc + índigo | T2 |
| §7 asunto = `{proyecto} · {tesis}`, bajada arriba del informe | T4 Steps 3-4 |
| Errores: maestro > 60k → `brief_error=too_long` | T3 (`setMaster` lanza), T5 (action redirige sin guardar) |
| Errores: estructura ausente → log, informe se guarda | T4 (`missingSections` + `daily_report.structure_missing`) |
| Errores: `briefUpdates` inválido se ignora | T4 (`BriefUpdateInputSchema` + `safeParse`) |
| Errores: countdown sin hitos → sin bloque, prompt dice "sin hitos cargados" | T4 (`countdownBlock` devuelve `""`, `withCountdown` no toca nada) |
| Testing de la spec (7 archivos) | T1, T2, T3, T4, T5 — los 7 archivos listados en File Structure |

**Reglas editoriales del brief de referencia codificadas en el system (T4 Step 5f):** hecho vs inferencia (§8.1 → regla 1), acusación = declaración pública (§8.2 → regla 2), no atribuir sin evidencia (§8.3 → regla 3), tracción a 24 h (§7.2 → regla 4), no comparar categorías (§1.1.7 y §7.4 → regla 5), cuenta regresiva en días (§1.1.6 → regla 6), hora argentina (§7.3 → regla 7), el informe no habla de sí mismo (§1.1.8 y §8.4 → regla 8), sin nómina de particulares (§8.5 → regla 9), resultado deportivo apaga ~12 h (§7.13 → regla 10), verificar primicias (§7.14 → regla 11), la rutina no es novedad (§7.7 → regla 12), no inferir ausencia de una observación parcial (§7.5 y §7.9 → regla 13). Las secciones fijas salen de §8.1 del brief, renumeradas 01-10 + Fuentes según la spec §3.

**Consistencia de tipos:**
- `Block` (T1) es el único contrato entre el parser y los tres renderers (T2); los `switch` son exhaustivos, así que `tsc` garantiza que ninguno se olvide un bloque.
- `{ days, label, detail }` de `countdownItems` (T4) es exactamente el item del bloque `countdown` del parser (T1); `countdownBlock` serializa a la sintaxis que `parseCountdownLines` parsea — el ida y vuelta está testeado de los dos lados.
- `BriefUpdateInput` (`{ seccion, texto }`, T4) es el argumento de `mergeBriefUpdates` (T3), que produce `BriefUpdate` (`+ id, reportAt, status`), que es lo que consumen `setBriefUpdateStatus` (T3) y `resolverBriefUpdate` (T5) y lo que valida `BriefUpdateSchema` al leer (T3).
- `MASTER_MAX_CHARS` es un solo valor (T3), usado por la action (T5 Step 3b) y pasado por prop al cliente (T5 Step 5d) — el componente `"use client"` nunca importa `lib/client-brief` en runtime, para no arrastrar `node:crypto` al bundle.
- `reportTitle` (T1) es la única fuente del título-tesis: asunto del mail y portada del PDF (T4 Steps 3-4).
- `EMPTY_BRIEF` suma `pendingUpdates: []` (T3) para que `getClientBrief` sin fila siga siendo `toEqual(EMPTY_BRIEF)` en el test existente.

**Escaneo de placeholders:** no hay "TBD", "similar a la tarea N", "agregar validación" ni pasos en prosa que reemplacen código. Todo bloque de código está escrito completo y cada `Step` de implementación dice el archivo y el lugar exacto donde va. Los únicos textos no literales son los del smoke (T6), que describen verificación manual en la app.

**Riesgos conocidos:**
1. Entre Task 1 y Task 2 el repo queda con `tsc` rojo a propósito (switch no exhaustivos). Está documentado en Convenciones: no pushear ahí.
2. `tests/report-html.test.ts` y `tests/daily-report-email.test.ts` cambian aserciones existentes (asunto y encabezado): es el cambio de comportamiento pedido por la spec §7, no una regresión.
3. El umbral de cobertura de `vitest.config.ts` está calibrado sobre la cobertura de hoy; `lib/daily-report.ts` y `lib/client-brief.ts` suman código con tests, así que el número no debería bajar. Si `npx vitest run --coverage` falla el umbral, sumar casos antes de tocar los thresholds.
