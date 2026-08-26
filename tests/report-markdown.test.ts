// tests/report-markdown.test.ts
import { describe, it, expect } from "vitest";
import { parseReportMarkdown, sectionsOf, renderableSections, escapeHtml, inlineToHtml, inlineToText, reportTitle } from "@/lib/report-markdown";

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
    expect(blocks.map((b) => b.t)).toEqual(["h", "bajada", "h", "p", "h", "ul", "ol", "quote", "table", "hr", "h", "p"]);
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
    expect(s[0].blocks.map((b) => b.t)).toEqual(["h", "bajada"]);
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

  it("acepta la puntuación adentro de la negrita: **Inferencia:** / **Advertencia.**", () => {
    const b = parseReportMarkdown(
      "**Inferencia:** texto\n\n**Advertencia:** la acusación no está verificada.\n\n**Inferencia.** el tono cayó.\n\n**Advertencia —** rumor sin fuente.",
    );
    expect(b.map((x) => x.t)).toEqual(["callout", "callout", "callout", "callout"]);
    expect(b[0].t === "callout" && b[0].kind).toBe("inferencia");
    expect(b[0].t === "callout" && inlineToText(b[0].text)).toBe("texto");
    expect(b[1].t === "callout" && b[1].kind).toBe("advertencia");
    expect(b[1].t === "callout" && inlineToText(b[1].text)).toBe("la acusación no está verificada.");
    expect(b[2].t === "callout" && b[2].kind).toBe("inferencia");
    expect(b[2].t === "callout" && inlineToText(b[2].text)).toBe("el tono cayó.");
    expect(b[3].t === "callout" && b[3].kind).toBe("advertencia");
    expect(b[3].t === "callout" && inlineToText(b[3].text)).toBe("rumor sin fuente.");
  });

  it("un párrafo que solo empieza en negrita no es callout", () => {
    const b = parseReportMarkdown("**Cloacas** — volumen alto.");
    expect(b[0].t).toBe("p");
  });

  it("una negrita heredada de Object.prototype no abre callout", () => {
    const b = parseReportMarkdown("**constructor** x");
    expect(b[0].t).toBe("p");
    expect(parseReportMarkdown("**toString**: y")[0].t).toBe("p");
  });

  it("encabezado de tabla que arranca con la columna # no es h1", () => {
    const b = parseReportMarkdown(
      "# | Tema | Origen | Alcance | Amplificadores\n---|---|---|---|---\n1 | Cloacas | vecinos | alto | @radioibicuy",
    );
    expect(b.map((x) => x.t)).toEqual(["table"]);
    const t = b[0];
    if (t.t !== "table") throw new Error("esperaba table");
    expect(t.header).toEqual(["#", "Tema", "Origen", "Alcance", "Amplificadores"]);
    expect(t.header[0]).toBe("#");
    expect(t.rows).toEqual([["1", "Cloacas", "vecinos", "alto", "@radioibicuy"]]);
  });

  it("un h1 con pipe que no encabeza tabla sigue siendo h1", () => {
    const b = parseReportMarkdown("# Ferro | dividido\n\nBajada.");
    expect(b.map((x) => x.t)).toEqual(["h", "bajada"]);
  });

  it("reportTitle devuelve la tesis del h1 sin marcas, o null", () => {
    expect(reportTitle("# **Ferro** llega dividido a la asamblea\n\nBajada.")).toBe("Ferro llega dividido a la asamblea");
    expect(reportTitle("## 01 El escenario\nTexto")).toBeNull();
    expect(reportTitle("")).toBeNull();
  });
});
