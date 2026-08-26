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
  | { t: "bajada"; text: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; text: Inline[] }
  | { t: "table"; header: string[]; rows: string[][] }
  | { t: "countdown"; items: { days: number; label: string; detail: string }[] }
  | { t: "kpi"; items: { value: string; label: string; note: string }[] }
  | { t: "callout"; kind: "inferencia" | "advertencia"; text: Inline[] }
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
      if (x.t === "code") return x.v.includes("\n") ? `<code style="white-space:pre-wrap">${v}</code>` : `<code>${v}</code>`;
      return v;
    })
    .join("");
}

const TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
const splitRow = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

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

export function parseReportMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const text = parseInline(para.join(" "));
    const c = calloutOf(text);
    blocks.push(c ? { t: "callout", kind: c.kind, text: c.text } : { t: "p", text });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { flushPara(); continue; }

    const fence = /^```(\w*)\s*$/.exec(trimmed);
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

    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) { flushPara(); blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, text: parseInline(h[2].trim().replace(/\s*#+\s*$/, "")) }); continue; }
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
    if (trimmed.includes("|") && lines[i + 1] && TABLE_SEP.test(lines[i + 1].trim())) {
      flushPara();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
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
  return markBajada(blocks);
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

// Secciones listas para renderizar: igual que sectionsOf pero descarta la
// primera sección sin título cuando solo contiene headings (el h1/preámbulo
// sin cuerpo, que ya se muestra aparte en el encabezado de cada renderer).
export function renderableSections(blocks: Block[]): { title: string; blocks: Block[] }[] {
  const sections = sectionsOf(blocks);
  if (sections.length > 0 && !sections[0].title && sections[0].blocks.every((b) => b.t === "h")) {
    return sections.slice(1);
  }
  return sections;
}
