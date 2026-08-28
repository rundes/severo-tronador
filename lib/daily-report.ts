// Informe diario de escucha: barrido con la config vigente + síntesis con
// Claude sobre el historial del proyecto (items 24h/7d + informe anterior
// como memoria). El contexto vive en la DB — no hay que re-explicarle el
// cliente a Claude en cada corrida: config del panel + historial alcanzan.
//
// Persistencia sin DDL: fila sintética de conector_config
// daily-report:<projectId> = { latest, history[] } (historial capado).
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { getListeningConfig } from "@/lib/listening-config";
import { readCachedItems, pullAllSources, type PullSummary } from "@/lib/listening-cache";
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateText } from "@/lib/anthropic";
import { incrementUsage } from "@/lib/quota";
import { getProject, listMembers } from "@/lib/projects";
import { getMonitorConfig, type CalendarEvent } from "@/lib/monitor-config";
import { accountMetrics, type AccountMetrics } from "@/lib/monitor-metrics";
import { log } from "@/lib/logger";
import { z } from "zod";
import { getClientBrief, briefText, mergeSuggestions, mergeBriefUpdates, saveClientBrief } from "@/lib/client-brief";
import { renderReportEmail } from "@/lib/report-html";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";
import { reportFilename } from "@/lib/report-file";
import { reportTitle } from "@/lib/report-markdown";

const HISTORY_CAP = 14;
// Techo de salida del informe. Si el modelo lo toca, el informe llega
// truncado: se registra (daily_report.truncated) en vez de pasar inadvertido.
const MAX_REPORT_TOKENS = 8000;
const CLAUDE_ID = "claude-api";

// Secciones fijas del informe editorial (spec §3). Una sola fuente de verdad
// para el prompt y para el control de faltantes: si divergieran, el informe
// se marcaría incompleto por secciones que nunca se pidieron.
export interface ReportSection {
  // "01".."10" o "Fuentes": lo que se busca en el markdown del modelo.
  id: string;
  // Título exacto del h2 que el modelo tiene que escribir.
  heading: string;
  // Qué va adentro; se inyecta tal cual en el prompt.
  guide: string;
}

const SECTION_FUENTES: ReportSection = {
  id: "Fuentes",
  heading: "Fuentes",
  guide: "Lista de URLs citadas, solo las que aparecen en las menciones de arriba o en el brief.",
};

// Proyecto con escenario electoral: cuentas del plan y/o calendario de hitos.
const ELECTORAL_SECTIONS: ReportSection[] = [
  {
    id: "01",
    heading: "01 El escenario",
    guide: "Estado del tablero y qué se juega, narrando los hitos en días que faltan. NO escribas vos la cuenta regresiva ni un bloque ```countdown: el sistema lo inserta acá y descarta el tuyo.",
  },
  {
    id: "02",
    heading: "02 Lo que cambió",
    guide: "Abrí con un bloque ```kpi de hasta 4 líneas con los números del día. Después, qué se movió respecto del informe anterior y qué no.",
  },
  {
    id: "03",
    heading: "03 Línea de tiempo",
    guide: "Los hitos del día y de la semana en orden, con hora argentina. Una línea por hito.",
  },
  {
    id: "04",
    heading: "04 Contenido efímero",
    guide: "Historias vivas y vencidas por cuenta: qué se dijo ahí que no está en el feed. Si no hay relevamiento del día, decilo en una línea.",
  },
  {
    id: "05",
    heading: "05 Top 5 de discusiones",
    guide: "Tabla `| # | Tema | Origen | Alcance | Amplificadores |`, cinco filas como máximo, ordenadas por tracción.",
  },
  {
    id: "06",
    heading: "06 Tono y densidad por agrupación",
    guide: "Tabla con una columna por agrupación: proporción de comentarios positivos y negativos, y densidad de comentaristas recurrentes. Leelo como potencial, no como resultado.",
  },
  {
    id: "07",
    heading: "07 Mapa por categorías",
    guide: "Una tabla por categoría, ordenada por dentro por amplificación / adhesión / densidad. Marcá cuando el orden por estructura difiere del orden por tamaño. Nunca compares una categoría contra otra.",
  },
  {
    id: "08",
    heading: "08 Cuentas nuevas y cuentas que operan",
    guide: "Cuentas que aparecieron hoy, cuántas en cada dirección del conflicto, y cuáles operan. Sin nómina de particulares.",
  },
  {
    id: "09",
    heading: "09 Normativo y calendario",
    guide: "Reglamento, junta electoral, plazos y lo que falta confirmar.",
  },
  {
    id: "10",
    heading: "10 Vigilancia",
    guide: "Tabla `| # | Qué vigilar | Por qué | Cuándo |`, con plazos concretos.",
  },
  SECTION_FUENTES,
];

// Proyecto sin escenario electoral (ni cuentas del plan ni calendario): las
// secciones de categorías, contenido efímero y normativo quedarían vacías
// todos los días. Estructura reducida y renumerada, mismo criterio editorial.
const REDUCED_SECTIONS: ReportSection[] = [
  {
    id: "01",
    heading: "01 El escenario",
    guide: "Estado del tema y qué se juega hoy. Este proyecto no tiene calendario ni cuenta regresiva: no inventes fechas ni plazos.",
  },
  {
    id: "02",
    heading: "02 Lo que cambió",
    guide: "Abrí con un bloque ```kpi de hasta 4 líneas con los números del día. Después, qué se movió respecto del informe anterior y qué no.",
  },
  {
    id: "03",
    heading: "03 Línea de tiempo",
    guide: "Los hitos del día y de la semana en orden, con hora argentina. Una línea por hito.",
  },
  {
    id: "04",
    heading: "04 Top 5 de discusiones",
    guide: "Tabla `| # | Tema | Origen | Alcance | Amplificadores |`, cinco filas como máximo, ordenadas por tracción.",
  },
  {
    id: "05",
    heading: "05 Vigilancia",
    guide: "Tabla `| # | Qué vigilar | Por qué | Cuándo |`, con plazos concretos.",
  },
  {
    id: "06",
    heading: "06 Sugerencia operativa",
    guide: "Dos o tres movimientos concretos para mañana, cada uno con el dato medido que lo justifica.",
  },
  SECTION_FUENTES,
];

// electoral = el proyecto tiene cuentas monitoreadas y/o calendario cargado.
export function reportSections(electoral: boolean): ReportSection[] {
  return electoral ? ELECTORAL_SECTIONS : REDUCED_SECTIONS;
}

// Si el modelo se saltea alguna sección se loguea, pero el informe se guarda
// igual: el parser es tolerante.
export function missingSections(markdown: string, electoral = true): string[] {
  const present = new Set([...markdown.matchAll(/^##\s+(\d\d)\b/gm)].map((m) => m[1]));
  const missing = reportSections(electoral)
    .filter((s) => s.id !== SECTION_FUENTES.id && !present.has(s.id))
    .map((s) => s.id);
  // "## Fuentes citadas" también cuenta: lo que importa es que la sección esté.
  if (!/^##\s+.*Fuentes/im.test(markdown)) missing.push(SECTION_FUENTES.id);
  return missing;
}

// Detalle en palabras, nunca una fecha suelta (regla editorial del brief:
// la cuenta regresiva se expresa en días que faltan).
function countdownDetail(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days <= 7) return "esta semana";
  // Hasta ocho semanas la cuenta se lee mejor en semanas; recién ahí pasa a
  // meses (a 8 semanas ya son ~2 meses, así que el salto no pierde precisión).
  if (days <= 56) return `${Math.round(days / 7)} semanas`;
  return `${Math.round(days / 30)} meses`;
}

const DAY_MS = 86400_000;
const ART_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Día calendario como entero (días desde la época). La cuenta regresiva es una
// diferencia de días de calendario en hora argentina, no de milisegundos: a las
// 01:00 UTC del 27 todavía es 26 en Buenos Aires, y un hito del 27 tiene que
// decir "falta 1 día", no "faltan 0".
function artDayIndex(now: number): number {
  const [y, m, d] = ART_DATE.format(new Date(now)).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// La fecha del hito es un día de calendario (YYYY-MM-DD), no un instante: no
// se convierte de zona, se compara contra el día argentino de hoy.
function eventDayIndex(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!m) return null;
  const idx = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
  return Number.isFinite(idx) ? idx : null;
}

// Hitos futuros ordenados por cercanía. Los escribe el CÓDIGO, no el modelo:
// así la cuenta regresiva nunca se equivoca ni inventa fechas.
export function countdownItems(
  calendar: CalendarEvent[],
  now = Date.now(),
): { days: number; label: string; detail: string }[] {
  const hoy = artDayIndex(now);
  return calendar
    .map((e) => ({ label: e.label.replace(/\|/g, "/").trim(), dia: eventDayIndex(e.date) }))
    .filter((e): e is { label: string; dia: number } => Boolean(e.label) && e.dia !== null)
    .map((e) => ({ label: e.label, days: e.dia - hoy }))
    // El día del hito cuenta como 0 y entra: hasta las 23:59 ART todavía es hoy.
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((e) => ({ days: e.days, label: e.label, detail: countdownDetail(e.days) }));
}

export function countdownBlock(calendar: CalendarEvent[], now = Date.now()): string {
  const items = countdownItems(calendar, now);
  if (items.length === 0) return "";
  return ["```countdown", ...items.map((i) => `${i.days} | ${i.label} | ${i.detail}`), "```"].join("\n");
}

// El modelo escribe su propio ```countdown aunque el prompt se lo prohíba, y
// con fechas inventadas. La cuenta regresiva la genera el código: cualquier
// bloque countdown del modelo se borra antes de insertar el nuestro.
function stripModelCountdowns(markdown: string): string {
  const out = markdown.replace(/^[ \t]*```countdown[ \t]*\n[\s\S]*?^[ \t]*```[ \t]*$\n?/gim, "");
  // Solo se normalizan los saltos si hubo recorte: el hueco que deja el
  // bloque borrado no tiene que abrir un espacio de tres líneas.
  return out === markdown ? markdown : out.replace(/\n{3,}/g, "\n\n").trim();
}

// El bloque va al inicio de "01 El escenario"; si el modelo no escribió ese
// heading, arriba de todo.
export function withCountdown(markdown: string, block: string): string {
  const limpio = stripModelCountdowns(markdown);
  if (!block) return limpio;
  const m = /^##\s+01\b.*$/m.exec(limpio);
  if (!m) return `${block}\n\n${limpio}`;
  const end = m.index + m[0].length;
  return `${limpio.slice(0, end)}\n\n${block}${limpio.slice(end)}`;
}

export interface DailyReport {
  at: string;
  markdown: string;
  items24h: number;
  items7d: number;
  pull?: PullSummary;
  // Observación del modelo sobre la herramienta / la config / la calidad del
  // dato (cuentas en cero, handles que no coinciden con el brief, sin
  // menciones). Es para el operador, no para el informe: se muestra en el
  // panel y en el mail, nunca en el cuerpo ni en el PDF.
  notaOperativa?: string;
  // De dónde salió el informe: lo generó Tronador con la API, lo escribió el
  // operador con Claude in Chrome y entró por MCP, o se importó a mano desde
  // el panel. Ausente en los informes previos a este campo → "tronador".
  origen?: "tronador" | "claude-chrome" | "import";
  // Conversación de claude.ai desde la que se importó (si había vínculo).
  conversationUrl?: string;
  // Tesis del día ya extraída, para no re-parsear el markdown en cada listado.
  titulo?: string;
}

interface ReportStore {
  latest: DailyReport | null;
  history: DailyReport[];
}

const key = (projectId: string) => `daily-report:${projectId}`;

export async function readDailyReports(projectId: string): Promise<ReportStore> {
  if (!dbConfigured()) return { latest: null, history: [] };
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return (data?.config as ReportStore | undefined) ?? { latest: null, history: [] };
}

// Exportada: la importación de informes (lib/report-import.ts) guarda por el
// mismo camino que la generación, para que historial, tope y recorte del
// markdown del historial sean idénticos vengan de donde vengan.
export async function saveReport(projectId: string, report: DailyReport): Promise<void> {
  const store = await readDailyReports(projectId);
  const history = [store.latest, ...store.history]
    .filter((r): r is DailyReport => Boolean(r))
    .slice(0, HISTORY_CAP)
    // El historial no necesita el markdown completo de cada día: pesa.
    .map((r) => ({ ...r, markdown: r.markdown.slice(0, 4000), pull: undefined }));
  try {
    await upsertConectorConfig(key(projectId), { latest: report, history });
  } catch (error) {
    log.warn("daily_report.save_failed", { error: (error as Error).message });
  }
}

// Actores nuevos que el modelo detecta en las menciones y no están en el
// plan. Van al final del informe como bloque ```json```; se separan del
// markdown antes de guardar. Un bloque ausente o inválido nunca rompe el
// informe: solo deja 0 sugerencias.
const ActorSchema = z.object({
  handle: z.string().min(1),
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  category: z.enum(["organizacion", "medio", "individual", "institucional", "opera"]),
  direccion: z.enum(["A", "B", "?"]).default("?"),
  evidencia: z
    .string()
    .optional()
    .transform((v) => (v && /^https?:\/\/\S+$/i.test(v) ? v : undefined)),
  razon: z.string().default(""),
});
export type NuevoActor = z.infer<typeof ActorSchema>;

// Propuesta de actualización del brief maestro (spec §5): hechos nuevos que
// deberían entrar al maestro. Se guardan como pendientes; el operador acepta
// o descarta desde el panel.
const BriefUpdateInputSchema = z.object({
  seccion: z.string().trim().min(1),
  texto: z.string().trim().min(1),
});
export type BriefUpdateInput = z.infer<typeof BriefUpdateInputSchema>;

// Nota operativa: texto libre y corto. Tolerante — lo que no sea string con
// contenido se descarta sin romper el informe.
const NOTA_CAP = 600;
function parseNotaOperativa(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t ? t.slice(0, NOTA_CAP) : undefined;
}

export function splitReport(text: string): {
  markdown: string;
  nuevosActores: NuevoActor[];
  briefUpdates: BriefUpdateInput[];
  notaOperativa?: string;
} {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const m = matches.at(-1);
  // Sin bloque cerrado puede haber uno abierto: la respuesta se cortó por
  // max_tokens en mitad del json. Ese resto no es informe, se descarta.
  if (!m || m.index === undefined) {
    return { markdown: text.replace(/\n*```json[\s\S]*$/i, "").trim(), nuevosActores: [], briefUpdates: [] };
  }
  const markdown = text.slice(0, m.index).trim();
  try {
    const raw = JSON.parse(m[1]) as { nuevosActores?: unknown[]; briefUpdates?: unknown[]; notaOperativa?: unknown };
    const actores = (raw.nuevosActores ?? [])
      .map((a) => ActorSchema.safeParse(a))
      .filter((r): r is { success: true; data: NuevoActor } => r.success)
      .map((r) => r.data);
    const updates = (raw.briefUpdates ?? [])
      .map((u) => BriefUpdateInputSchema.safeParse(u))
      .filter((r): r is { success: true; data: BriefUpdateInput } => r.success)
      .map((r) => r.data)
      .slice(0, 8);
    return { markdown, nuevosActores: actores, briefUpdates: updates, notaOperativa: parseNotaOperativa(raw.notaOperativa) };
  } catch {
    log.warn("daily_report.actors_parse_failed", { head: m[1].slice(0, 200) });
    return { markdown, nuevosActores: [], briefUpdates: [] };
  }
}

function fmtItems(items: { source: string; text: string; publishedAt?: string; author?: string }[], cap: number): string {
  return items
    .slice(0, cap)
    .map((i) => `- [${i.source}${i.author ? ` · ${i.author}` : ""}] ${i.text.slice(0, 220)}`)
    .join("\n");
}

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

// Barrido con la config vigente + informe. runPull=false para regenerar el
// informe sin re-fetchear fuentes.
export async function generateDailyReport(
  projectId: string,
  opts: { runPull?: boolean } = {},
): Promise<DailyReport> {
  const cfg = await getListeningConfig(projectId);
  const project = await getProject(projectId);

  let pull: PullSummary | undefined;
  if (opts.runPull !== false) {
    pull = await pullAllSources(projectId);
  }

  const [items24, items7, monitor, metrics] = await Promise.all([
    readCachedItems(projectId, 1),
    readCachedItems(projectId, 7),
    getMonitorConfig(projectId),
    accountMetrics(projectId, 7),
  ]);
  const hitos = countdownItems(monitor.calendar);
  // Sin cuentas del plan ni calendario no hay escenario electoral que mapear:
  // el informe usa la estructura reducida (spec §3.1).
  const electoral = monitor.accounts.length > 0 || monitor.calendar.length > 0;
  const estructura = reportSections(electoral);

  const claudeCfg = await getConnectorConfig(CLAUDE_ID, projectId);
  const apiKey = claudeCfg.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Conector claude-api sin ANTHROPIC_API_KEY");

  const previous = (await readDailyReports(projectId)).latest;

  const brief = await getClientBrief(projectId);
  const briefBody = briefText(brief);
  const briefSection = briefBody
    ? `## Brief maestro del cliente (fuente de verdad para el contexto)\n${briefBody}\n\n`
    : "";

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
    "herramienta, a cambios de criterio ni a limitaciones técnicas. Si el " +
    "panel de fuentes, las cuentas cargadas o los datos del sistema parecen " +
    "mal configurados o incompletos, eso va en \"notaOperativa\" del bloque " +
    "json final — nunca en el cuerpo.\n" +
    "9. No publiques nómina de particulares; sí agregados, densidades y " +
    "cuentas con relevancia organizativa.\n" +
    "10. Un resultado deportivo apaga la conversación política unas 12 h: no " +
    "leas esa caída de tracción como muerte del tema.\n" +
    "11. Verificá antes de reportar una primicia; si no podés verificarla, va " +
    "como **Advertencia**.\n" +
    "12. La rutina no es novedad: reportá el cambio, no la existencia.\n" +
    "13. No infieras ausencia a partir de una observación parcial: que una " +
    "cuenta no aparezca en el feed no significa que esté callada.";

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

## Métricas por cuenta (ventana 7 días; amplificación=vistas/seg, adhesión=likes/seg, com=comentarios colectados, densidad=% de comentaristas que reaparecen en otra pieza)
${metrics.length ? metrics.map(metricsLine).join("\n") : "(sin métricas)"}

## Comentarios recientes por cuenta (muestra, autores anonimizados c1..cN)
${commentsSection(metrics)}

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
Después, exactamente estas secciones, en este orden y con estos títulos, sin agregar ni renombrar ninguna${electoral ? "" : " (este proyecto no tiene escenario electoral: estructura reducida)"}:

${estructura.map((s) => `## ${s.heading}\n${s.guide}`).join("\n\n")}

Ninguna sección se omite: si no hay material, escribila igual con una sola línea ("Sin novedades en el período").

## Convenciones de formato
- **Inferencia:** párrafo que arranca con \`**Inferencia**\` y sigue con la lectura. Toda lectura que no sea dato medido va así: la inferencia va en un párrafo suelto, nunca como ítem de lista.
- **Advertencia:** párrafo que arranca con \`**Advertencia**\` para declaraciones no verificadas, acusaciones y rumores.
- **KPIs:** bloque cercado que abre con \`\`\`kpi y cierra con tres backticks, una línea por número: \`valor | etiqueta | nota\`, máximo 4 líneas. Solo en la sección 02.
${electoral ? "- **Cuenta regresiva:** No escribas ningún bloque \`\`\`countdown: el sistema lo inserta al inicio de la sección 01. Si lo escribís, se descarta. Vos narrá los hitos en días." : "- **Cuenta regresiva:** este proyecto no tiene calendario: no escribas cuentas regresivas ni fechas de hitos, ni ningún bloque \`\`\`countdown."}
- **Tablas:** Markdown normal, con encabezado y línea de guiones; las tablas abren y cierran cada fila con \`|\`, encabezado y filas por igual.
- No uses ningún otro bloque cercado además de \`\`\`kpi y el \`\`\`json final.

Si casi no hay menciones nuevas, decilo sin inflar y sugerí ajustes de fuentes o keywords dentro de la sección ${estructura.find((x) => /Vigilancia/.test(x.heading))?.id ?? "de vigilancia"}.

## Bloque interno de cierre
Cerrá con un bloque \`\`\`json con este esquema exacto:
{ "nuevosActores": [{ "handle": "", "platform": "instagram|x|facebook|tiktok", "category": "organizacion|medio|individual|institucional|opera", "direccion": "A|B|?", "evidencia": "url de la mención", "razon": "por qué vale seguirla" }], "briefUpdates": [{ "seccion": "número o nombre de la sección del brief maestro", "texto": "el hecho nuevo, redactado para pegar en el brief" }], "notaOperativa": "" }
El bloque es interno (el operador lo revisa aparte): no lo menciones ni lo describas en el cuerpo del informe.
En "nuevosActores", solo cuentas que aparecen en las menciones de arriba y NO están en el plan${monitor.accounts.length ? ` (plan: ${monitor.accounts.map((a) => "@" + a.handle.replace(/^@/, "")).join(", ")})` : ""}. Si no hay, dejá el array vacío.
En "briefUpdates", hasta 8 propuestas de actualización del brief maestro: cuenta nueva con seguidores, hito confirmado, hallazgo que se rompió (anotá que se rompió, no lo borres), error propio detectado redactado como regla. Si no hay, dejá el array vacío.
En "notaOperativa" (opcional, hasta 600 caracteres, para el operador y no para el lector del informe), lo que observaste sobre la herramienta, la configuración o la calidad del dato: cuentas cargadas con 0 seguidores, handles que no coinciden con el brief, fuentes sin menciones, keywords que no traen nada, métricas faltantes. Toda observación de este tipo va ACÁ y solo acá: nunca en el cuerpo del informe. Si no tenés nada que señalar, omití el campo.`;

  const result = await generateText({
    apiKey,
    system,
    prompt,
    maxTokens: MAX_REPORT_TOKENS,
  });
  await incrementUsage(CLAUDE_ID, result.inputTokens + result.outputTokens, projectId);

  // Cortado por límite de tokens: el informe llega sin Fuentes y con el json a
  // medias. Se guarda igual, pero queda registrado por qué salió incompleto.
  if (result.stopReason === "max_tokens") {
    log.warn("daily_report.truncated", { projectId, maxTokens: MAX_REPORT_TOKENS, outputTokens: result.outputTokens });
  }
  const { markdown: cuerpo, nuevosActores, briefUpdates, notaOperativa } = splitReport(result.text);
  const faltantes = missingSections(cuerpo, electoral);
  if (faltantes.length > 0) log.warn("daily_report.structure_missing", { projectId, faltantes });
  const markdown = withCountdown(cuerpo, countdownBlock(monitor.calendar));
  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    pull,
    notaOperativa,
    origen: "tronador",
    titulo: reportTitle(markdown) ?? undefined,
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
}

// Mail del informe a los owners del proyecto vía Resend (si está configurado).
export async function emailDailyReport(
  projectId: string,
  report: DailyReport,
): Promise<{ sent: number }> {
  const cfg = await getConnectorConfig("resend", projectId);
  if (!cfg.RESEND_API_KEY || !cfg.RESEND_FROM) return { sent: 0 };
  const project = await getProject(projectId);
  const owners = (await listMembers(projectId)).filter((m) => m.role === "owner");
  if (owners.length === 0) return { sent: 0 };

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
}
