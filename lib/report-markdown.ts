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
