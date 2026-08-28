// Importación de un informe escrito afuera (Claude in Chrome, o un archivo que
// el operador pega en el panel) al historial del proyecto: mismo DailyReport,
// mismo mail con PDF, mismas propuestas de brief que el informe generado.
//
// Dos entradas: Markdown directo, o HTML. El HTML se convierte con turndown +
// turndown-plugin-gfm (tablas) más reglas propias para la maqueta del informe
// de referencia (informeferro20260826.html), que usa divs con clases en vez de
// semántica: .kpis/.kpi son tarjetas de números, .cd/.cdc la cuenta regresiva,
// .inf/.callout las lecturas etiquetadas, .scrollnote una ayuda de la pantalla.
//
// Regla de oro: la cuenta regresiva NUNCA viene del documento. Las tarjetas
// .cd se descartan y el código la vuelve a escribir desde los hitos del
// calendario (withCountdown), igual que en el informe generado — si no, el
// informe importado queda con fechas congeladas del día en que se escribió.
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import {
  countdownBlock,
  emailDailyReport,
  saveReport,
  splitReport,
  withCountdown,
  type DailyReport,
} from "@/lib/daily-report";
import { parseReportMarkdown, reportTitle, sectionsOf } from "@/lib/report-markdown";
import { getMonitorConfig } from "@/lib/monitor-config";
import { readCachedItems } from "@/lib/listening-cache";
import { getClientBrief, mergeBriefUpdates, saveClientBrief } from "@/lib/client-brief";
import { log } from "@/lib/logger";

// Techo de entrada. El informe del 26/08 pesa ~80 KB con la imagen embebida;
// 400.000 deja margen sobrado y frena un pegado accidental de un sitio entero.
export const MAX_IMPORT_CHARS = 400_000;

// Techo de salida. La fila de conector_config guarda latest + 14 de historial:
// un informe de 300 KB convertido a markdown la haría inmanejable. El informe
// de referencia pesa ~9 KB de markdown, así que 40.000 deja margen de sobra y
// solo recorta lo que ya no es un informe.
export const MAX_STORED_CHARS = 40_000;

// Margen de reloj para el `at` que manda quien importa: una zona horaria mal
// leída adelanta unas horas, pero un informe fechado mañana es un error.
const MAX_FUTURO_MS = 6 * 3600_000;

// Etiquetas de largo máximo para el título.
const MAX_TITULO = 200;

// Lo que nunca es informe. `head` incluido porque el parser de turndown recibe
// el documento completo cuando le pasan un HTML con <html>/<head>.
// TITLE/META/LINK/BASE van aparte de HEAD: turndown parsea el fragmento que le
// dan, y un <title> pegado suelto (o un head que el parser no reconstruyó)
// aparecía como primera línea del markdown y se volvía el h1 del informe.
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK", "BASE",
  "NAV", "HEADER", "FOOTER",
  "IMG", "SVG", "IFRAME", "FORM", "BUTTON", "TEMPLATE",
]);
// .scrollnote es una instrucción de la pantalla ("deslizá la tabla"), no del
// informe. .cd/.cdc es la cuenta regresiva, que reescribe el código.
const DROP_CLASSES = ["scrollnote", "cd", "cdc"];

function hasClass(node: HTMLElement, cls: string): boolean {
  const raw = typeof node.getAttribute === "function" ? node.getAttribute("class") : null;
  if (!raw) return false;
  return raw.trim().split(/\s+/).includes(cls);
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
// Las líneas del bloque ```kpi se separan con "|": un pipe adentro de un valor
// partiría la línea en columnas fantasma.
const cellText = (s: string): string => clean(s).replace(/\|/g, "/");
const textOf = (el: HTMLElement, sel: string): string => cellText(el.querySelector(sel)?.textContent ?? "");

// Un párrafo que ya viene etiquetado no se vuelve a etiquetar.
const YA_ETIQUETADO = /^\*\*(Inferencia|Advertencia)\b/i;

function buildService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  td.use(gfm);
  td.remove((node) => DROP_TAGS.has(node.nodeName));

  // <h2><span class="num">01</span>El escenario</h2> → "## 01 El escenario".
  // Sin esto sale "## 01El escenario" y missingSections/sectionsOf leen mal la
  // estructura. El span de Fuentes trae &nbsp;: trim() lo limpia y no deja
  // espacio adelante del título.
  td.addRule("numeroDeSeccion", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "num"),
    replacement: (content) => {
      const t = content.trim();
      return t ? `${t} ` : "";
    },
  });

  // <span class="pill">Mañana</span>Preparar… → "**Mañana** · Preparar…".
  // Sin la regla los dos textos quedan pegados ("MañanaPreparar").
  td.addRule("pill", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "pill"),
    replacement: (content) => {
      const t = content.trim();
      return t ? `**${t}** · ` : "";
    },
  });

  // <p><span class="inf">Inferencia</span>La relación…</p> →
  // "**Inferencia** La relación…", que es lo que parseReportMarkdown lee como
  // callout (regla editorial: toda lectura que no sea dato medido va marcada).
  td.addRule("etiquetaInline", {
    filter: (node) => node.nodeName === "SPAN" && (hasClass(node, "inf") || hasClass(node, "adv")),
    replacement: (content) => {
      const t = content.trim();
      return t ? `**${t}** ` : "";
    },
  });

  // .kpis (o una .kpi suelta) → bloque ```kpi, una línea por número:
  // `valor | etiqueta | nota`, que es el formato que parsea report-markdown.
  // El HTML pone el valor en .v, la etiqueta en .k y la nota en .d.
  td.addRule("kpis", {
    filter: (node) => node.nodeName === "DIV" && (hasClass(node, "kpis") || hasClass(node, "kpi")),
    replacement: (_content, node) => {
      const cards = hasClass(node as HTMLElement, "kpi")
        ? [node as HTMLElement]
        : (Array.from((node as HTMLElement).querySelectorAll(".kpi")) as HTMLElement[]);
      const lines = cards
        .map((c) => ({ v: textOf(c, ".v"), k: textOf(c, ".k"), d: textOf(c, ".d") }))
        .filter((x) => x.v && x.k)
        .map((x) => `${x.v} | ${x.k} | ${x.d}`);
      if (lines.length === 0) return "";
      return `\n\n\`\`\`kpi\n${lines.join("\n")}\n\`\`\`\n\n`;
    },
  });

  // .callout / div.inf → un párrafo etiquetado. El .callout del informe de
  // referencia es la lectura de apertura de la sección, no un dato medido: se
  // etiqueta como Inferencia salvo que ya traiga su propia etiqueta.
  td.addRule("callout", {
    filter: (node) => node.nodeName === "DIV" && (hasClass(node, "callout") || hasClass(node, "inf")),
    replacement: (content) => {
      const t = content.replace(/\s*\n+\s*/g, " ").trim();
      if (!t) return "";
      return YA_ETIQUETADO.test(t) ? `\n\n${t}\n\n` : `\n\n**Inferencia** ${t}\n\n`;
    },
  });

  // Las clases descartables NO pueden ir por td.remove(): los filtros de
  // remove se consultan DESPUÉS de las reglas commonmark, así que un
  // <p class="scrollnote"> lo agarra la regla de párrafo y sobrevive. Como
  // regla propia (la última en registrarse es la primera en evaluarse) gana
  // sobre todo lo demás. Va al final para tener prioridad sobre .kpis y
  // .callout, con los que no se solapa.
  td.addRule("descartarPorClase", {
    filter: (node) => DROP_CLASSES.some((c) => hasClass(node, c)),
    replacement: () => "",
  });

  return td;
}

export function htmlToMarkdown(html: string): string {
  if (html.length > MAX_IMPORT_CHARS) {
    throw new Error(`El informe supera los ${MAX_IMPORT_CHARS} caracteres`);
  }
  // El &nbsp; de la maqueta (<span class="num">&nbsp;</span> en Fuentes) es
  // espacio duro: turndown lo trata como "flanking whitespace" del nodo vacío
  // y lo escupe adelante del título ("##  Fuentes"). Se normaliza a espacio
  // común antes de parsear, y ahí sí se colapsa como cualquier otro blanco.
  return normalize(buildService().turndown(html.replace(/&nbsp;|&#160;| /gi, " ")));
}

function normalize(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// El informe abre con "# " y la tesis del día. Si el documento no trae h1, se
// usa el título explícito; si tampoco hay, la primera línea con contenido SE
// CONVIERTE en el h1 (no se duplica arriba) — salvo que esa línea sea un
// heading: bajar un "## 01 El escenario" a h1 le come una sección al informe,
// así que ahí se antepone un h1 sintético con el mismo texto.
function ensureTitle(md: string, titulo?: string): string {
  if (reportTitle(md)) return md;
  const t = (titulo ?? "").trim().slice(0, MAX_TITULO);
  if (t) return `# ${t}\n\n${md}`.trim();
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i === -1) return md;
  const cruda = lines[i].trim();
  const primera = cruda.replace(/^#+\s*/, "").slice(0, MAX_TITULO);
  if (!primera) return md;
  if (/^#+\s/.test(cruda)) return `# ${primera}\n\n${md}`.trim();
  return [...lines.slice(0, i), `# ${primera}`, ...lines.slice(i + 1)].join("\n");
}

// El `at` lo manda quien importa (la tool MCP o el panel). Date.parse acepta
// cualquier cosa con formatos locales del motor ("Aug 26 2026", "26/08/2026"
// leída como mes/día): se exige la forma ISO para que la fecha del informe no
// dependa de cómo interpretó el runtime, y no se acepta el futuro.
const AT_ISO = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

function isoOrThrow(at: string, now = Date.now()): string {
  const crudo = at.trim();
  if (!AT_ISO.test(crudo)) throw new Error(`Fecha inválida (se espera ISO): ${at}`);
  const t = Date.parse(crudo);
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida (se espera ISO): ${at}`);
  if (t > now + MAX_FUTURO_MS) throw new Error(`Fecha en el futuro: ${at}`);
  return new Date(t).toISOString();
}

// El markdown que se guarda tiene tope propio: pasado ese punto lo que sobra
// ya no es informe. Se recorta y se registra, nunca en silencio.
function capStored(projectId: string, markdown: string): string {
  if (markdown.length <= MAX_STORED_CHARS) return markdown;
  log.warn("report_import.truncated", { projectId, chars: markdown.length, cap: MAX_STORED_CHARS });
  return markdown.slice(0, MAX_STORED_CHARS);
}

export interface ImportReportInput {
  markdown?: string;
  html?: string;
  titulo?: string;
  at?: string; // ISO; default: ahora
  notaOperativa?: string;
  briefUpdates?: { seccion: string; texto: string }[];
  origen: "claude-chrome" | "import";
  conversationUrl?: string;
  enviarMail?: boolean; // default true
}

export interface ImportReportResult {
  at: string;
  titulo: string;
  secciones: number;
  briefUpdates: number;
  mailSent: boolean;
  mailError?: string;
}

export async function importReport(
  projectId: string,
  input: ImportReportInput,
): Promise<ImportReportResult> {
  const esMarkdown = Boolean(input.markdown?.trim());
  const esHtml = !esMarkdown && Boolean(input.html?.trim());
  if (!esMarkdown && !esHtml) {
    throw new Error("Mandá markdown o html: llegaron los dos vacíos");
  }
  const fuente = esMarkdown ? input.markdown! : input.html!;
  if (fuente.length > MAX_IMPORT_CHARS) {
    throw new Error(`El informe supera los ${MAX_IMPORT_CHARS} caracteres`);
  }
  const at = input.at ? isoOrThrow(input.at) : new Date().toISOString();

  const crudo = esMarkdown ? normalize(fuente) : htmlToMarkdown(fuente);
  // Mismo camino que el informe generado: el bloque ```json final es interno
  // (propuestas de brief + nota operativa) y no viaja en el cuerpo.
  const { markdown: cuerpo, briefUpdates: delJson, notaOperativa: notaJson } = splitReport(crudo);
  const conTitulo = ensureTitle(cuerpo, input.titulo);

  // La validación va ANTES de la cuenta regresiva: el bloque ```countdown que
  // escribe el código no es un bloque "h", así que con un calendario cargado
  // haría pasar por informe un documento sin una sola línea de cuerpo.
  const blocks = parseReportMarkdown(conTitulo);
  // Solo headings no es un informe: sin cuerpo no se guarda nada.
  if (blocks.filter((b) => b.t !== "h").length === 0) {
    throw new Error("El informe no tiene ninguna sección reconocible");
  }

  const monitor = await getMonitorConfig(projectId);
  const markdown = capStored(projectId, withCountdown(conTitulo, countdownBlock(monitor.calendar)));

  const [items24, items7] = await Promise.all([
    readCachedItems(projectId, 1),
    readCachedItems(projectId, 7),
  ]);
  const titulo = reportTitle(markdown) ?? "Informe importado";
  const report: DailyReport = {
    at,
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    origen: input.origen,
    titulo,
    conversationUrl: input.conversationUrl,
    notaOperativa: input.notaOperativa?.trim() || notaJson,
  };
  await saveReport(projectId, report);

  // Propuestas de brief: las del argumento (las manda la tool) más las del
  // bloque json. mergeBriefUpdates dedupea contra las ya conocidas y capea en
  // 8; contamos las que realmente entraron, no la diferencia de largos (el
  // pruning de resueltas la falsearía).
  const updates = [...(input.briefUpdates ?? []), ...delJson];
  let sumadas = 0;
  if (updates.length > 0) {
    try {
      const brief = await getClientBrief(projectId);
      const antes = new Set((brief.pendingUpdates ?? []).map((u) => u.id));
      const next = mergeBriefUpdates(brief, updates, at);
      sumadas = (next.pendingUpdates ?? []).filter((u) => !antes.has(u.id)).length;
      if (sumadas > 0) await saveClientBrief(projectId, next);
    } catch (e) {
      // El informe ya está guardado: una falla acá no puede frenar el mail.
      log.warn("report_import.brief_updates_failed", { projectId, error: (e as Error).message });
    }
  }

  let mailSent = false;
  let mailError: string | undefined;
  if (input.enviarMail !== false) {
    try {
      const { sent } = await emailDailyReport(projectId, report);
      mailSent = sent > 0;
      if (!mailSent) mailError = "sin owners del proyecto o Resend sin configurar";
    } catch (e) {
      mailError = (e as Error).message;
    }
  }

  const secciones = sectionsOf(blocks).filter((s) => s.title).length;
  log.info("report_import.saved", {
    projectId,
    at,
    origen: input.origen,
    secciones,
    briefUpdates: sumadas,
    mailSent,
  });
  return { at, titulo, secciones, briefUpdates: sumadas, mailSent, mailError };
}
