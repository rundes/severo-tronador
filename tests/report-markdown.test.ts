// tests/report-markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseReportMarkdown, sectionsOf, renderableSections, escapeHtml, inlineToHtml, inlineToText } from "@/lib/report-markdown";

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

  it("tabla sin pipe inicial", () => {
    const b = parseReportMarkdown("Tema | Vol\n---|---\nCloacas | 12\nCaminos | 4\n\nTexto.");
    expect(b[0]).toEqual({ t: "table", header: ["Tema", "Vol"], rows: [["Cloacas", "12"], ["Caminos", "4"]] });
    expect(b[1].t).toBe("p");
  });

  it("bloque ``` degrada a párrafo monoespaciado", () => {
    const b = parseReportMarkdown("Antes\n```json\n{\"a\": 1}\n```\nDespués");
    expect(b.map((x) => x.t)).toEqual(["p", "p", "p"]);
    expect(b[1]).toEqual({ t: "p", text: [{ t: "code", v: '{"a": 1}' }] });
  });

  it("título con # final", () => {
    expect(parseReportMarkdown("## Título ##")[0]).toEqual({ t: "h", level: 2, text: [{ t: "text", v: "Título" }] });
  });

  it("renderableSections descarta el preámbulo si son solo headings", () => {
    const s = renderableSections(parseReportMarkdown("# T\n\n## A\nx"));
    expect(s.map((x) => x.title)).toEqual(["A"]);
  });

  it("renderableSections conserva el preámbulo si tiene contenido", () => {
    const s = renderableSections(parseReportMarkdown("# T\n\nIntro.\n\n## A\nx"));
    expect(s.map((x) => x.title)).toEqual(["", "A"]);
  });
});
