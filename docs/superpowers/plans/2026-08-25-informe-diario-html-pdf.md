# Informe diario HTML + PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El informe diario llega por mail como HTML diseñado con el PDF completo adjunto, y en el panel Informe se ve con el mismo diseño y se descarga en PDF.

**Architecture:** `lib/report-markdown.ts` parsea el markdown del informe a `Block[]`. Tres renderers sobre ese árbol: `lib/report-html.ts` (mail, CSS inline), `lib/pdf/daily-report-pdf.tsx` (`@react-pdf/renderer`), `components/escucha/report-view.tsx` (panel, Tailwind). `emailDailyReport` usa el HTML y adjunta el PDF (base64, Resend `attachments`). Ruta `GET /escucha/informe-diario?at=` sirve el PDF de un informe guardado.

**Tech Stack:** Next.js 15, TypeScript, `@react-pdf/renderer` (ya instalado), Resend API (fetch), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-informe-diario-html-pdf-design.md`

---

## Convenciones

- Tests `npx vitest run <archivo>`; suite `npx vitest run`; `npx tsc --noEmit`; `npx eslint <archivos>`.
- Componentes `.tsx` no se testean en unit (vitest incluye solo `tests/**/*.test.ts`); la lógica va a `lib/`.
- Commits: conventional, cuerpo en español, trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8`.
- Paleta (DESIGN.md): ink `#18181b`, ink-soft `#3f3f46`, muted `#71717a`, border `#e4e4e7`, surface-subtle `#fafafa`, accent `#4f5bd5`, ok `#059669`, warn `#d97706`, danger `#dc2626`.

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `lib/report-markdown.ts` | crear | parser markdown → `Block[]`, `sectionsOf`, `escapeHtml`, `inlineToHtml`, `inlineToText` |
| `lib/report-html.ts` | crear | `renderReportEmail` (subject, html, text) |
| `lib/pdf/daily-report-pdf.tsx` | crear | `DailyReportDocument`, `renderDailyReportPdf` |
| `lib/report-file.ts` | crear | `reportFilename(project, at)` (slug + fecha) |
| `lib/daily-report.ts` | modificar | `emailDailyReport` usa HTML + adjunta PDF |
| `components/escucha/report-view.tsx` | crear | render Tailwind de `Block[]` |
| `components/escucha/informe-panel.tsx` | modificar | usa `ReportView` + botones Descargar PDF |
| `app/(dashboard)/escucha/informe-diario/route.ts` | crear | PDF de un informe por `at` |
| tests | crear | `report-markdown`, `report-html`, `daily-report-pdf`, `daily-report-email`, `informe-diario-route` |

---

### Task 1: Parser `lib/report-markdown.ts`

**Files:** Create `lib/report-markdown.ts`; Test `tests/report-markdown.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/report-markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseReportMarkdown, sectionsOf, escapeHtml, inlineToHtml, inlineToText } from "@/lib/report-markdown";

const MD = `# Informe diario · Ibicuy

Preámbulo corto.

## 1. Resumen ejecutivo
Hoy importa la **crecida del río** y el reclamo por cloacas.
Segunda línea del mismo párrafo.

## 2. Temas del día
- **Cloacas** — volumen alto, tono negativo
- Caminos rurales
1. primero
2. segundo

> "Cita textual" — lacalle.com.ar

| Tema | Vol |
|---|---|
| Cloacas | 12 |
| Caminos | 4 |

---
### Sub
Texto con \`codigo\` y *itálica* y <script>alert(1)</script>.`;

describe("parseReportMarkdown", () => {
  const blocks = parseReportMarkdown(MD);

  it("reconoce headings, párrafos unidos, listas, cita, tabla, hr", () => {
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "h", "p", "h", "ul", "ol", "quote", "table", "hr", "h", "p"]);
    const p = blocks[3];
    expect(p.t === "p" && inlineToText(p.text)).toBe("Hoy importa la crecida del río y el reclamo por cloacas. Segunda línea del mismo párrafo.");
    const ul = blocks[5];
    expect(ul.t === "ul" && ul.items).toHaveLength(2);
    const table = blocks[8];
    expect(table.t === "table" && table.header).toEqual(["Tema", "Vol"]);
    expect(table.t === "table" && table.rows).toEqual([["Cloacas", "12"], ["Caminos", "4"]]);
  });

  it("inline: negrita, itálica, código; HTML del contenido se escapa", () => {
    const last = blocks[11];
    if (last.t !== "p") throw new Error("esperaba p");
    const html = inlineToHtml(last.text);
    expect(html).toContain("<code>codigo</code>");
    expect(html).toContain("<em>itálica</em>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    const bold = blocks[3];
    expect(bold.t === "p" && inlineToHtml(bold.text)).toContain("<strong>crecida del río</strong>");
  });

  it("sectionsOf corta por h2 y conserva el preámbulo", () => {
    const s = sectionsOf(blocks);
    expect(s.map((x) => x.title)).toEqual(["", "1. Resumen ejecutivo", "2. Temas del día"]);
    expect(s[0].blocks.map((b) => b.t)).toEqual(["h", "p"]);
    expect(s[2].blocks.some((b) => b.t === "table")).toBe(true);
  });

  it("markdown vacío → []; escapeHtml cubre & < > \" '", () => {
    expect(parseReportMarkdown("   ")).toEqual([]);
    expect(escapeHtml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;");
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run tests/report-markdown.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// lib/report-markdown.ts
// Parser del subset de markdown que produce el informe diario (Claude):
// headings, párrafos, listas, citas, tablas simples, hr e inline **/*/`.
// Un árbol de bloques que alimenta tres renderers (mail, PDF, panel) para
// que el informe se vea igual en los tres. Sin dependencias.

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; v: string }
  | { t: "i"; v: string }
  | { t: "code"; v: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; text: Inline[] }
  | { t: "p"; text: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; text: Inline[] }
  | { t: "table"; header: string[]; rows: string[][] }
  | { t: "hr" };

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// **negrita**, *itálica* / _itálica_, `código`. Lo demás es texto.
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\s][^*]*)\*)|(\b_([^_]+)_\b)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: "text", v: s.slice(last, i) });
    if (m[2] !== undefined) out.push({ t: "b", v: m[2] });
    else if (m[4] !== undefined) out.push({ t: "code", v: m[4] });
    else if (m[6] !== undefined) out.push({ t: "i", v: m[6] });
    else if (m[8] !== undefined) out.push({ t: "i", v: m[8] });
    last = i + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function inlineToText(inl: Inline[]): string {
  return inl.map((x) => x.v).join("");
}

export function inlineToHtml(inl: Inline[]): string {
  return inl
    .map((x) => {
      const v = escapeHtml(x.v);
      if (x.t === "b") return `<strong>${v}</strong>`;
      if (x.t === "i") return `<em>${v}</em>`;
      if (x.t === "code") return `<code>${v}</code>`;
      return v;
    })
    .join("");
}

const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
const splitRow = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseReportMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: "p", text: parseInline(para.join(" ")) });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { flushPara(); continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) { flushPara(); blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, text: parseInline(h[2].trim()) }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flushPara(); blocks.push({ t: "hr" }); continue; }
    if (/^>\s?/.test(trimmed)) { flushPara(); blocks.push({ t: "quote", text: parseInline(trimmed.replace(/^>\s?/, "")) }); continue; }

    const ul = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.t === "ul") last.items.push(parseInline(ul[1]));
      else blocks.push({ t: "ul", items: [parseInline(ul[1])] });
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.t === "ol") last.items.push(parseInline(ol[1]));
      else blocks.push({ t: "ol", items: [parseInline(ol[1])] });
      continue;
    }
    if (trimmed.startsWith("|") && lines[i + 1] && TABLE_SEP.test(lines[i + 1].trim())) {
      flushPara();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ t: "table", header, rows });
      continue;
    }
    para.push(trimmed);
  }
  flushPara();
  return blocks;
}

// Secciones por h2: título del h2 (texto plano) + bloques hasta el próximo h2.
// Lo anterior al primer h2 (h1, preámbulo) va como sección sin título.
export function sectionsOf(blocks: Block[]): { title: string; blocks: Block[] }[] {
  const out: { title: string; blocks: Block[] }[] = [{ title: "", blocks: [] }];
  for (const b of blocks) {
    if (b.t === "h" && b.level === 2) out.push({ title: inlineToText(b.text), blocks: [] });
    else out[out.length - 1].blocks.push(b);
  }
  return out.filter((s, i) => i > 0 || s.blocks.length > 0);
}
```

- [ ] **Step 4: Verificar** `npx vitest run tests/report-markdown.test.ts && npx tsc --noEmit && npx eslint lib/report-markdown.ts tests/report-markdown.test.ts` → 4 PASS. Si el test de `sectionsOf` del preámbulo falla porque el filtro deja fuera la sección vacía, revisar que el h1 + párrafo entren en la sección 0.

- [ ] **Step 5: Commit** `git add lib/report-markdown.ts tests/report-markdown.test.ts && git commit -m "feat(informe): parser del markdown del informe diario a bloques"` (+ trailers).

---

### Task 2: Mail HTML `lib/report-html.ts` + `lib/report-file.ts`

**Files:** Create `lib/report-html.ts`, `lib/report-file.ts`; Test `tests/report-html.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/report-html.test.ts
import { describe, it, expect } from "vitest";
import { renderReportEmail } from "@/lib/report-html";
import { reportFilename } from "@/lib/report-file";

const report = {
  at: "2026-08-25T12:00:00.000Z",
  markdown: "# Informe\n\n## 1. Resumen ejecutivo\nHoy **importa** el río.\n\n## 2. Temas del día\n- Cloacas <script>x</script>\n\n## 5. Sugerencia operativa\nPreguntar por cloacas.",
  items24h: 12,
  items7d: 80,
  pull: { total: 30, bySource: {}, errors: [{ source: "x", detail: "429" }] },
};

describe("renderReportEmail", () => {
  const out = renderReportEmail({ report, project: "Ibicuy", zona: "Ibicuy, Entre Ríos", appUrl: "https://app.test" });

  it("subject con proyecto y fecha; text = markdown", () => {
    expect(out.subject).toMatch(/Informe de escucha · Ibicuy · 25\/08\/2026/);
    expect(out.text).toBe(report.markdown);
  });

  it("html con cabecera, chips, secciones, sugerencia destacada y link", () => {
    expect(out.html).toContain("Ibicuy");
    expect(out.html).toContain("12 menciones");
    expect(out.html).toContain("80 en 7 d");
    expect(out.html).toContain("1 fuente con error");
    expect(out.html).toContain("Resumen ejecutivo");
    expect(out.html).toContain("<strong>importa</strong>");
    expect(out.html).toContain("Sugerencia operativa");
    expect(out.html).toContain('href="https://app.test/escucha?tab=informe"');
  });

  it("escapa HTML del contenido y no trae script ni css externo", () => {
    expect(out.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(out.html).not.toMatch(/<script/i);
    expect(out.html).not.toMatch(/<link|@import|url\(/i);
  });

  it("markdown vacío → placeholder", () => {
    const r = renderReportEmail({ report: { ...report, markdown: "" }, project: "P", zona: "", appUrl: "https://a" });
    expect(r.html).toContain("Informe sin contenido");
  });
});

describe("reportFilename", () => {
  it("slug del proyecto + fecha", () => {
    expect(reportFilename("Rio Grande - TDF", "2026-08-25T12:00:00.000Z")).toBe("informe-rio-grande-tdf-2026-08-25.pdf");
  });
});
```

- [ ] **Step 2: Correr** → FAIL.

- [ ] **Step 3: `lib/report-file.ts`**

```ts
// Nombre de archivo del PDF del informe: informe-<proyecto>-<yyyy-mm-dd>.pdf
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "proyecto";
}

export function reportFilename(project: string, atIso: string): string {
  return `informe-${slugify(project)}-${atIso.slice(0, 10)}.pdf`;
}
```

- [ ] **Step 4: `lib/report-html.ts`**

```ts
// HTML del mail del informe diario: tabla contenedora, CSS inline (Gmail/
// Outlook), paleta de DESIGN.md, sin imágenes remotas ni scripts. El PDF
// adjunto lleva el informe completo; acá va el mismo contenido legible.
import type { DailyReport } from "@/lib/daily-report";
import { parseReportMarkdown, sectionsOf, inlineToHtml, escapeHtml, type Block } from "@/lib/report-markdown";

const C = {
  ink: "#18181b", soft: "#3f3f46", muted: "#71717a", border: "#e4e4e7",
  subtle: "#fafafa", accent: "#4f5bd5", accentSoft: "#eef0fb", danger: "#dc2626",
};
const FONT = "Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function blockHtml(b: Block): string {
  switch (b.t) {
    case "h": {
      if (b.level === 1) return "";
      const size = b.level === 2 ? 16 : 14;
      const bar = b.level === 2 ? `border-left:3px solid ${C.accent};padding-left:10px;` : "";
      return `<h${b.level} style="margin:22px 0 8px;font-size:${size}px;line-height:1.3;color:${C.ink};${bar}">${inlineToHtml(b.text)}</h${b.level}>`;
    }
    case "p":
      return `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:${C.soft}">${inlineToHtml(b.text)}</p>`;
    case "ul":
    case "ol": {
      const items = b.items.map((it) => `<li style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${C.soft}">${inlineToHtml(it)}</li>`).join("");
      return `<${b.t} style="margin:0 0 12px;padding-left:20px">${items}</${b.t}>`;
    }
    case "quote":
      return `<blockquote style="margin:0 0 12px;padding:8px 14px;border-left:3px solid ${C.border};background:${C.subtle};font-size:14px;line-height:1.5;color:${C.soft};font-style:italic">${inlineToHtml(b.text)}</blockquote>`;
    case "table": {
      const th = b.header.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid ${C.border};font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em">${escapeHtml(h)}</th>`).join("");
      const tr = b.rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid ${C.border};font-size:13px;color:${C.soft}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 12px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
    }
    case "hr":
      return `<hr style="border:0;border-top:1px solid ${C.border};margin:16px 0">`;
  }
}

function sectionHtml(title: string, blocks: Block[], variant: "hero" | "accent" | "plain"): string {
  const body = blocks.map(blockHtml).join("");
  if (variant === "hero") {
    return `<div style="margin:0 0 18px;padding:14px 16px;border:1px solid ${C.border};border-radius:8px;background:${C.subtle}"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};margin-bottom:6px">${escapeHtml(title)}</div>${body}</div>`;
  }
  if (variant === "accent") {
    return `<div style="margin:18px 0 0;padding:14px 16px;border-radius:8px;background:${C.accentSoft}"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.accent};margin-bottom:6px">${escapeHtml(title)}</div>${body}</div>`;
  }
  const h = title ? `<h2 style="margin:22px 0 8px;font-size:16px;line-height:1.3;color:${C.ink};border-left:3px solid ${C.accent};padding-left:10px">${escapeHtml(title)}</h2>` : "";
  return h + body;
}

const chip = (text: string, color = C.soft) =>
  `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border:1px solid ${C.border};border-radius:999px;font-size:12px;color:${color};background:#fff">${escapeHtml(text)}</span>`;

export function renderReportEmail(input: { report: DailyReport; project: string; zona: string; appUrl: string }): {
  subject: string; html: string; text: string;
} {
  const { report, project, zona, appUrl } = input;
  const subject = `Informe de escucha · ${project} · ${fechaCorta(report.at)}`;
  const blocks = parseReportMarkdown(report.markdown);
  const sections = sectionsOf(blocks);

  const chips = [
    chip(`${report.items24h} menciones 24 h`),
    chip(`${report.items7d} en 7 d`),
    report.pull ? chip(`barrido: ${report.pull.total} items`) : "",
    report.pull && report.pull.errors.length > 0
      ? chip(`${report.pull.errors.length} fuente${report.pull.errors.length === 1 ? "" : "s"} con error`, C.danger)
      : "",
  ].join("");

  const body = blocks.length === 0
    ? `<p style="font-size:14px;color:${C.muted}">Informe sin contenido.</p>`
    : sections.map((s, i) => {
        const t = s.title.toLowerCase();
        const variant = /resumen ejecutivo/.test(t) ? "hero" : /sugerencia operativa/.test(t) ? "accent" : "plain";
        // el preámbulo (i === 0, sin título) solo lleva el h1 → se omite
        if (i === 0 && !s.title && s.blocks.every((b) => b.t === "h")) return "";
        return sectionHtml(s.title, s.blocks, variant);
      }).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:${C.subtle};font-family:${FONT};color:${C.ink}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%">
<tr><td style="padding:0 4px 12px">
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.muted}">Tronador · Escucha</div>
  <div style="font-size:22px;font-weight:600;line-height:1.15;color:${C.ink};margin-top:4px">${escapeHtml(project)}</div>
  <div style="font-size:13px;color:${C.muted};margin-top:2px">${escapeHtml(fechaLarga(report.at))}${zona ? ` · ${escapeHtml(zona)}` : ""}</div>
  <div style="margin-top:10px">${chips}</div>
</td></tr>
<tr><td style="background:#fff;border:1px solid ${C.border};border-radius:10px;padding:22px 24px">
${body}
<div style="margin-top:26px;padding-top:16px;border-top:1px solid ${C.border};text-align:center">
  <a href="${escapeHtml(appUrl)}/escucha?tab=informe" style="display:inline-block;padding:9px 16px;border-radius:6px;background:${C.accent};color:#fff;font-size:13px;font-weight:600;text-decoration:none">Abrir en Tronador</a>
  <div style="margin-top:10px;font-size:12px;color:${C.muted}">Adjunto: informe completo en PDF.</div>
</div>
</td></tr>
<tr><td style="padding:14px 4px 0;font-size:11px;color:${C.muted};text-align:center">Generado automáticamente por Tronador a partir de la escucha del proyecto.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text: report.markdown };
}
```

- [ ] **Step 5: Verificar** `npx vitest run tests/report-html.test.ts && npx tsc --noEmit && npx eslint lib/report-html.ts lib/report-file.ts tests/report-html.test.ts`. Nota: `report-html.ts` importa el tipo `DailyReport` de `daily-report.ts` y `daily-report.ts` importará `report-html.ts` en Task 4 — `import type` no crea ciclo en runtime; si eslint `import/no-cycle` se queja, mover `DailyReport` a `lib/daily-report-types.ts` y re-exportar.

- [ ] **Step 6: Commit** `feat(informe): mail HTML del informe diario con diseño de marca`.

---

### Task 3: PDF `lib/pdf/daily-report-pdf.tsx`

**Files:** Create `lib/pdf/daily-report-pdf.tsx`; Test `tests/daily-report-pdf.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/daily-report-pdf.test.ts
import { describe, it, expect } from "vitest";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";

describe("renderDailyReportPdf", () => {
  it("devuelve un PDF válido con el contenido", async () => {
    const buf = await renderDailyReportPdf({
      report: { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHoy **importa** el río.\n\n- a\n- b\n\n| T | V |\n|---|---|\n| x | 1 |", items24h: 3, items7d: 9 },
      project: "Ibicuy",
      zona: "Ibicuy, Entre Ríos",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  }, 30_000);
});
```

- [ ] **Step 2: Correr** → FAIL. (Si `@react-pdf/renderer` no corre bajo vitest por `jsdom`/env, mirar cómo lo hace `tests/` para `escucha-pdf` — si no hay test previo, agregar `// @vitest-environment node` al tope del test.)

- [ ] **Step 3: Implementar** (mismo patrón que `lib/pdf/escucha-pdf.tsx`: `Document/Page/View/Text/StyleSheet` de `@react-pdf/renderer`)

```tsx
// lib/pdf/daily-report-pdf.tsx
// PDF del informe diario: mismo árbol de bloques que el mail y el panel.
// Helvetica (default de react-pdf): sin descarga de fuentes en Vercel.
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DailyReport } from "@/lib/daily-report";
import { parseReportMarkdown, sectionsOf, inlineToText, type Block, type Inline } from "@/lib/report-markdown";

const C = { ink: "#18181b", soft: "#3f3f46", muted: "#71717a", border: "#e4e4e7", subtle: "#fafafa", accent: "#4f5bd5", accentSoft: "#eef0fb" };

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10.5, color: C.soft, lineHeight: 1.45 },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" },
  title: { fontSize: 20, color: C.ink, marginTop: 4 },
  meta: { fontSize: 9.5, color: C.muted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, marginBottom: 14 },
  chip: { fontSize: 8.5, color: C.soft, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, marginRight: 5, marginBottom: 4 },
  hero: { borderWidth: 1, borderColor: C.border, backgroundColor: C.subtle, borderRadius: 6, padding: 10, marginBottom: 12 },
  accentBox: { backgroundColor: C.accentSoft, borderRadius: 6, padding: 10, marginTop: 12 },
  secTitle: { fontSize: 12.5, color: C.ink, marginTop: 14, marginBottom: 5, borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 7 },
  boxTitle: { fontSize: 8, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", marginBottom: 4 },
  h3: { fontSize: 11, color: C.ink, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6 },
  li: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12 },
  quote: { borderLeftWidth: 2, borderLeftColor: C.border, backgroundColor: C.subtle, paddingVertical: 5, paddingHorizontal: 9, marginBottom: 6, fontStyle: "italic" as const },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  th: { flex: 1, padding: 4, fontSize: 8, color: C.muted, textTransform: "uppercase" },
  td: { flex: 1, padding: 4, fontSize: 9.5 },
  hr: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function InlineText({ text }: { text: Inline[] }) {
  return (
    <Text>
      {text.map((x, i) =>
        x.t === "b" ? <Text key={i} style={{ fontFamily: "Helvetica-Bold", color: C.ink }}>{x.v}</Text>
        : x.t === "i" ? <Text key={i} style={{ fontFamily: "Helvetica-Oblique" }}>{x.v}</Text>
        : x.t === "code" ? <Text key={i} style={{ fontFamily: "Courier" }}>{x.v}</Text>
        : <Text key={i}>{x.v}</Text>,
      )}
    </Text>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h":
      if (b.level === 1) return null;
      return <Text style={b.level === 2 ? s.secTitle : s.h3}>{inlineToText(b.text)}</Text>;
    case "p":
      return <View style={s.p}><InlineText text={b.text} /></View>;
    case "ul":
    case "ol":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((it, i) => (
            <View key={i} style={s.li}>
              <Text style={s.bullet}>{b.t === "ol" ? `${i + 1}.` : "•"}</Text>
              <View style={{ flex: 1 }}><InlineText text={it} /></View>
            </View>
          ))}
        </View>
      );
    case "quote":
      return <View style={s.quote}><InlineText text={b.text} /></View>;
    case "table":
      return (
        <View style={{ marginBottom: 8 }}>
          <View style={s.row}>{b.header.map((h, i) => <Text key={i} style={s.th}>{h}</Text>)}</View>
          {b.rows.map((r, ri) => (
            <View key={ri} style={s.row}>{r.map((c, ci) => <Text key={ci} style={s.td}>{c}</Text>)}</View>
          ))}
        </View>
      );
    case "hr":
      return <View style={s.hr} />;
  }
}

export interface DailyReportPdfInput { report: DailyReport; project: string; zona: string }

export function DailyReportDocument({ report, project, zona }: DailyReportPdfInput) {
  const blocks = parseReportMarkdown(report.markdown);
  const sections = sectionsOf(blocks);
  const fecha = new Date(report.at).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <Document title={`Informe de escucha · ${project} · ${report.at.slice(0, 10)}`} author="Tronador">
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>Tronador · Escucha</Text>
        <Text style={s.title}>{project}</Text>
        <Text style={s.meta}>{fecha}{zona ? ` · ${zona}` : ""}</Text>
        <View style={s.chips}>
          <Text style={s.chip}>{report.items24h} menciones 24 h</Text>
          <Text style={s.chip}>{report.items7d} en 7 d</Text>
          {report.pull && <Text style={s.chip}>barrido: {report.pull.total} items</Text>}
        </View>
        {blocks.length === 0 && <Text style={{ color: C.muted }}>Informe sin contenido.</Text>}
        {sections.map((sec, i) => {
          if (i === 0 && !sec.title && sec.blocks.every((b) => b.t === "h")) return null;
          const t = sec.title.toLowerCase();
          if (/resumen ejecutivo/.test(t)) {
            return <View key={i} style={s.hero}><Text style={s.boxTitle}>{sec.title}</Text>{sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}</View>;
          }
          if (/sugerencia operativa/.test(t)) {
            return <View key={i} style={s.accentBox}><Text style={[s.boxTitle, { color: C.accent }]}>{sec.title}</Text>{sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}</View>;
          }
          return (
            <View key={i}>
              {sec.title ? <Text style={s.secTitle}>{sec.title}</Text> : null}
              {sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}
            </View>
          );
        })}
        <View style={s.footer} fixed>
          <Text>Tronador · Escucha · {project}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDailyReportPdf(input: DailyReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<DailyReportDocument {...input} />);
}
```

- [ ] **Step 4: Verificar** `npx vitest run tests/daily-report-pdf.test.ts && npx tsc --noEmit && npx eslint lib/pdf/daily-report-pdf.tsx`. Si `Text render=` da error de tipos, usar `<Text render={({ pageNumber, totalPages }) => \`página ${pageNumber} de ${totalPages}\`} fixed />` según la versión 4.x.

- [ ] **Step 5: Commit** `feat(informe): PDF del informe diario (@react-pdf)`.

---

### Task 4: `emailDailyReport` con HTML + PDF adjunto

**Files:** Modify `lib/daily-report.ts` (`emailDailyReport`); Test `tests/daily-report-email.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/daily-report-email.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
vi.stubGlobal("fetch", fetchMock);
vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: async () => ({ RESEND_API_KEY: "re_test", RESEND_FROM: "t@x.ar" }),
}));
vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: "p1", nombre: "Ibicuy" }),
  listMembers: async () => [{ email: "o@x.ar", role: "owner" }, { email: "e@x.ar", role: "editor" }],
}));
vi.mock("@/lib/listening-config", () => ({ getListeningConfig: async () => ({ zona: "Ibicuy, Entre Ríos", keywords: [] }) }));
const pdfMock = vi.fn(async () => Buffer.from("%PDF-1.4 fake"));
vi.mock("@/lib/pdf/daily-report-pdf", () => ({ renderDailyReportPdf: (...a: unknown[]) => pdfMock(...(a as [])) }));

import { emailDailyReport } from "@/lib/daily-report";

const report = { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHola.", items24h: 1, items7d: 2 };

describe("emailDailyReport", () => {
  beforeEach(() => { fetchMock.mockClear(); pdfMock.mockReset(); pdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 fake")); });

  it("manda HTML diseñado + PDF adjunto solo a owners", async () => {
    const r = await emailDailyReport("p1", report);
    expect(r.sent).toBe(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("o@x.ar");
    expect(body.subject).toMatch(/Ibicuy/);
    expect(body.html).toContain("Resumen ejecutivo");
    expect(body.html).not.toContain("white-space:pre-wrap");
    expect(body.text).toBe(report.markdown);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe("informe-ibicuy-2026-08-25.pdf");
    expect(Buffer.from(body.attachments[0].content, "base64").toString()).toBe("%PDF-1.4 fake");
  });

  it("si el PDF falla, el mail sale sin adjunto", async () => {
    pdfMock.mockRejectedValueOnce(new Error("boom"));
    const r = await emailDailyReport("p1", report);
    expect(r.sent).toBe(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr** → FAIL (no hay `attachments`, html viejo).

- [ ] **Step 3: Implementar** en `lib/daily-report.ts`

Imports: `import { renderReportEmail } from "@/lib/report-html";`, `import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";`, `import { reportFilename } from "@/lib/report-file";`. Reemplazar el cuerpo de `emailDailyReport` desde `const fecha = …` hasta el `return { sent }` por:

```ts
  const cfgEscucha = await getListeningConfig(projectId);
  const projectName = project?.nombre ?? "Proyecto";
  const appUrl = (process.env.APP_URL ?? "https://severo-tronador.vercel.app").replace(/\/$/, "");
  const { subject, html, text } = renderReportEmail({ report, project: projectName, zona: cfgEscucha.zona ?? "", appUrl });

  // El PDF completo va adjunto; si falla, el mail sale igual (el informe no
  // depende del PDF).
  let attachments: { filename: string; content: string }[] = [];
  try {
    const pdf = await renderDailyReportPdf({ report, project: projectName, zona: cfgEscucha.zona ?? "" });
    attachments = [{ filename: reportFilename(projectName, report.at), content: pdf.toString("base64") }];
  } catch (e) {
    log.warn("daily_report.pdf_failed", { projectId, error: (e as Error).message });
  }

  let sent = 0;
  for (const o of owners) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.RESEND_FROM, to: o.email, subject, html, text, attachments }),
    });
    if (res.ok) sent++;
    else log.warn("daily_report.email_failed", { to: o.email, status: res.status });
  }
  return { sent };
```

(`getListeningConfig` ya está importado en el archivo.)

- [ ] **Step 4: Verificar** `npx vitest run tests/daily-report-email.test.ts tests/daily-report-split.test.ts && npx tsc --noEmit && npx eslint lib/daily-report.ts`. Si el ciclo `daily-report ↔ report-html/pdf` (por `import type { DailyReport }`) molesta a eslint, extraer `DailyReport`/`ReportStore` a `lib/daily-report-types.ts` y re-exportar desde `daily-report.ts`.

- [ ] **Step 5: Commit** `feat(informe): mail con HTML diseñado y PDF adjunto`.

---

### Task 5: Panel — `ReportView`, Descargar PDF, ruta

**Files:** Create `components/escucha/report-view.tsx`, `app/(dashboard)/escucha/informe-diario/route.ts`; Modify `components/escucha/informe-panel.tsx`; Test `tests/informe-diario-route.test.ts`

- [ ] **Step 1: Test de la ruta (falla)**

```ts
// tests/informe-diario-route.test.ts
import { describe, it, expect, vi } from "vitest";

const project = { current: { id: "p1", nombre: "Ibicuy", role: "owner" } as { id: string; nombre: string; role: string } | null };
vi.mock("@/lib/workspace", () => ({ getActiveProject: async () => project.current }));
vi.mock("@/lib/listening-config", () => ({ getListeningConfig: async () => ({ zona: "Ibicuy" }) }));
vi.mock("@/lib/daily-report", () => ({
  readDailyReports: async () => ({
    latest: { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHola", items24h: 1, items7d: 2 },
    history: [{ at: "2026-08-24T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nAyer", items24h: 1, items7d: 2 }],
  }),
}));
vi.mock("@/lib/pdf/daily-report-pdf", () => ({ renderDailyReportPdf: async () => Buffer.from("%PDF-1.4 x") }));

import { GET } from "@/app/(dashboard)/escucha/informe-diario/route";

describe("GET /escucha/informe-diario", () => {
  it("403 sin proyecto activo", async () => {
    project.current = null;
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2026-08-25T12:00:00.000Z"));
    expect(res.status).toBe(403);
    project.current = { id: "p1", nombre: "Ibicuy", role: "owner" };
  });
  it("404 si no hay informe con ese at", async () => {
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2020-01-01T00:00:00.000Z"));
    expect(res.status).toBe(404);
  });
  it("200 pdf del historial con nombre de archivo", async () => {
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2026-08-24T12:00:00.000Z"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="informe-ibicuy-2026-08-24.pdf"');
  });
});
```

- [ ] **Step 2: Ruta** `app/(dashboard)/escucha/informe-diario/route.ts`

```ts
// PDF de un informe diario guardado (vigente o historial) para el proyecto
// activo. ?at=<iso del informe>. Descarga (attachment).
import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/workspace";
import { getListeningConfig } from "@/lib/listening-config";
import { readDailyReports } from "@/lib/daily-report";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";
import { reportFilename } from "@/lib/report-file";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const active = await getActiveProject();
  if (!active) return NextResponse.json({ error: "no_project" }, { status: 403 });
  const at = new URL(req.url).searchParams.get("at") ?? "";
  const store = await readDailyReports(active.id);
  const report = [store.latest, ...store.history].find((r) => r && r.at === at);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const cfg = await getListeningConfig(active.id);
    const pdf = await renderDailyReportPdf({ report, project: active.nombre, zona: cfg.zona ?? "" });
    log.info("pdf.daily_report.generated", { projectId: active.id, at, bytes: pdf.length });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFilename(active.nombre, report.at)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("pdf.daily_report.failed", { projectId: active.id, error: (e as Error).message });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: `components/escucha/report-view.tsx`** (server component)

```tsx
// Render del informe diario en el panel: mismo árbol de bloques que el mail
// y el PDF, con Tailwind y dark mode.
import { parseReportMarkdown, sectionsOf, type Block, type Inline } from "@/lib/report-markdown";

function InlineText({ text }: { text: Inline[] }) {
  return (
    <>
      {text.map((x, i) =>
        x.t === "b" ? <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">{x.v}</strong>
        : x.t === "i" ? <em key={i}>{x.v}</em>
        : x.t === "code" ? <code key={i} className="rounded bg-zinc-100 px-1 font-mono text-[12px] dark:bg-zinc-800">{x.v}</code>
        : <span key={i}>{x.v}</span>,
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h":
      if (b.level === 1) return null;
      return b.level === 2
        ? <h3 className="mt-5 mb-2 border-l-2 border-[oklch(52%_0.13_255)] pl-2.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100"><InlineText text={b.text} /></h3>
        : <h4 className="mt-3 mb-1 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"><InlineText text={b.text} /></h4>;
    case "p":
      return <p className="mb-2 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300"><InlineText text={b.text} /></p>;
    case "ul":
      return <ul className="mb-3 list-disc space-y-1 pl-5 text-[13.5px] text-zinc-700 dark:text-zinc-300">{b.items.map((it, i) => <li key={i}><InlineText text={it} /></li>)}</ul>;
    case "ol":
      return <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13.5px] text-zinc-700 dark:text-zinc-300">{b.items.map((it, i) => <li key={i}><InlineText text={it} /></li>)}</ol>;
    case "quote":
      return <blockquote className="mb-3 border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-[13px] italic text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300"><InlineText text={b.text} /></blockquote>;
    case "table":
      return (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr>{b.header.map((h, i) => <th key={i} className="border-b border-zinc-200 py-1 pr-3 text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:border-zinc-800">{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border-b border-zinc-100 py-1 pr-3 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="my-4 border-zinc-200 dark:border-zinc-800" />;
  }
}

export function ReportView({ markdown }: { markdown: string }) {
  const blocks = parseReportMarkdown(markdown);
  if (blocks.length === 0) return <p className="text-sm text-zinc-500">Informe sin contenido.</p>;
  return (
    <div>
      {sectionsOf(blocks).map((sec, i) => {
        if (i === 0 && !sec.title && sec.blocks.every((b) => b.t === "h")) return null;
        const t = sec.title.toLowerCase();
        const box = /resumen ejecutivo/.test(t)
          ? "rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          : /sugerencia operativa/.test(t)
            ? "mt-4 rounded-md bg-[oklch(52%_0.13_255)]/8 p-4"
            : "";
        return (
          <section key={i} className={box}>
            {sec.title && (box
              ? <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">{sec.title}</div>
              : <h3 className="mt-5 mb-2 border-l-2 border-[oklch(52%_0.13_255)] pl-2.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{sec.title}</h3>)}
            {sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `informe-panel.tsx`** — import `ReportView`; reemplazar `<div className="whitespace-pre-wrap …">{latest.markdown}</div>` por `<ReportView markdown={latest.markdown} />` y en el historial `<div …>{r.markdown}</div>` por `<div className="mt-2"><ReportView markdown={r.markdown} /></div>`. Agregar botón junto al informe vigente (dentro del `<article>`, arriba, alineado a la derecha) y en cada `<summary>` del historial:

```tsx
<a href={`/escucha/informe-diario?at=${encodeURIComponent(latest.at)}`} className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Descargar PDF</a>
```

(en el historial, el `<a>` va fuera del `<summary>` para no abrir/cerrar el details al hacer click: ponerlo como primer hijo del contenido del `<details>`.)

- [ ] **Step 5: Verificar** `npx vitest run tests/informe-diario-route.test.ts && npx tsc --noEmit && npx eslint components/escucha/report-view.tsx components/escucha/informe-panel.tsx "app/(dashboard)/escucha/informe-diario/route.ts"` y suite completa.

- [ ] **Step 6: Commit** `feat(informe): render diseñado del informe en el panel y descarga en PDF`.

---

### Task 6: Deploy y smoke

- [ ] Merge a `main`, push, esperar `/api/version`.
- [ ] Smoke en Ibicuy → Informe: si no hay informe, "Barrer y generar informe" (consume Claude + manda mail a owners: el usuario es owner, recibe el mail). Verificar: panel muestra el informe con secciones (Resumen destacado, temas con barra acento), botón Descargar PDF → `application/pdf` (`fetch` con `credentials: "include"` desde la consola: status 200, `content-type`, magic `%PDF-`), y el mail en la casilla del owner con HTML y adjunto `informe-ibicuy-<fecha>.pdf`.
- [ ] Si falla el PDF en Vercel (`pdf.daily_report.failed`), revisar tamaño del bundle de `@react-pdf/renderer` y que la ruta sea `runtime = "nodejs"`.

## Self-review

- Cobertura del spec: parser (T1), mail (T2), PDF (T3), envío con adjunto y fallback (T4), panel + ruta (T5), smoke (T6). Errores: markdown vacío (T1/T2/T3), PDF falla (T4/T5), 403/404 (T5).
- Tipos: `Block`/`Inline` (T1) usados en T2, T3, T5; `DailyReport` importado por tipo desde `daily-report.ts` (posible ciclo → nota en T2/T4); `reportFilename` (T2) usado en T4 y T5; `renderDailyReportPdf` (T3) en T4 y T5.
- Sin placeholders.
