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
import { getMonitorConfig, nextCountdown } from "@/lib/monitor-config";
import { accountMetrics } from "@/lib/monitor-metrics";
import { log } from "@/lib/logger";
import { z } from "zod";
import { getClientBrief, briefText, mergeSuggestions, saveClientBrief } from "@/lib/client-brief";
import { renderReportEmail } from "@/lib/report-html";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";
import { reportFilename } from "@/lib/report-file";

const HISTORY_CAP = 14;
const CLAUDE_ID = "claude-api";

export interface DailyReport {
  at: string;
  markdown: string;
  items24h: number;
  items7d: number;
  pull?: PullSummary;
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

async function saveReport(projectId: string, report: DailyReport): Promise<void> {
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

export function splitReport(text: string): { markdown: string; nuevosActores: NuevoActor[] } {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const m = matches.at(-1);
  if (!m || m.index === undefined) return { markdown: text.trim(), nuevosActores: [] };
  const markdown = text.slice(0, m.index).trim();
  try {
    const raw = JSON.parse(m[1]) as { nuevosActores?: unknown[] };
    const actores = (raw.nuevosActores ?? [])
      .map((a) => ActorSchema.safeParse(a))
      .filter((r): r is { success: true; data: NuevoActor } => r.success)
      .map((r) => r.data);
    return { markdown, nuevosActores: actores };
  } catch {
    log.warn("daily_report.actors_parse_failed", { head: m[1].slice(0, 200) });
    return { markdown, nuevosActores: [] };
  }
}

function fmtItems(items: { source: string; text: string; publishedAt?: string; author?: string }[], cap: number): string {
  return items
    .slice(0, cap)
    .map((i) => `- [${i.source}${i.author ? ` · ${i.author}` : ""}] ${i.text.slice(0, 220)}`)
    .join("\n");
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
  const countdown = nextCountdown(monitor);
  const isElectoral = monitor.accounts.length > 0;

  const claudeCfg = await getConnectorConfig(CLAUDE_ID, projectId);
  const apiKey = claudeCfg.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Conector claude-api sin ANTHROPIC_API_KEY");

  const previous = (await readDailyReports(projectId)).latest;

  const brief = await getClientBrief(projectId);
  const briefSection = brief.entries.length
    ? `## Brief del cliente (aportes del operador, en orden)\n${briefText(brief)}\n\n`
    : "";

  const system =
    "Sos analista de opinión pública de un centro de estudios. Escribís " +
    "informes diarios para operadores: sobrios, densos en dato, sin marketing. " +
    "Español rioplatense, Markdown. Reglas editoriales innegociables: separá " +
    "hecho verificado de inferencia y etiquetá la inferencia; una acusación de " +
    "un usuario es una declaración pública, no un hecho; nunca atribuyas una " +
    "operación a una organización sin evidencia (dos cuentas contra el mismo " +
    "blanco, o creadas el mismo mes, no prueban coordinación); la tracción de " +
    "una pieza se mide a las 24 h, por debajo es provisoria; el informe no " +
    "habla de sí mismo ni de la herramienta; no publiques nómina de " +
    "particulares, sí agregados y cuentas con relevancia organizativa.";

  const prompt = `${briefSection}## Contexto del cliente (config del panel)
Proyecto: ${project?.nombre ?? projectId}
Zona: ${cfg.zona || "sin definir"} (${cfg.pais})
Keywords monitoreadas: ${cfg.keywords.join(", ") || "ninguna"}

## Informe anterior (para continuidad; puede no existir)
${previous ? previous.markdown.slice(0, 3000) : "(primer informe)"}

## Menciones de las últimas 24 horas (${items24.length})
${fmtItems(items24, 120) || "(sin menciones nuevas)"}

## Muestra de los últimos 7 días (${items7.length} total, para baseline)
${fmtItems(items7.slice(items24.length), 60)}
${isElectoral ? `
## Escenario electoral
${countdown ? `Cuenta regresiva: faltan ${countdown.days} días para ${countdown.label}.` : "Sin fecha clave cargada."}
Cuentas monitoreadas por categoría (no se comparan entre categorías):
${monitor.accounts.map((a) => `- [${a.category}] @${a.handle.replace(/^@/, "")} (${a.platform})${a.vinculo ? ` · vínculo: ${a.vinculo}` : ""}`).join("\n")}

## Métricas por cuenta (ventana 7 días; amplificación=vistas/seg, adhesión=likes/seg, densidad=comentaristas recurrentes)
${metrics.map((m) => `- @${m.handle.replace(/^@/, "")} [${m.category}] seg:${m.followers} amp:${m.amplificacion ?? "s/d"} adh:${m.adhesion ?? "s/d"} dens:${m.densidad ?? "s/d"} piezas:${m.piezas} hist:${m.historiasVivas} última:${m.ultimaActividad?.slice(0, 10) ?? "s/d"}${m.ultimaPieza ? ` última pieza: "${m.ultimaPieza.text.slice(0, 60)}" (${m.ultimaPieza.likeCount ?? "s/d"} likes)` : ""}`).join("\n")}

## Memoria de errores (no repetir)
${monitor.noRepetir.length ? monitor.noRepetir.map((e) => `- ${e}`).join("\n") : "(sin correcciones registradas)"}

## Definiciones (lugares/personas/cargos)
${Object.entries(monitor.entidades).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "(ninguna)"}
` : ""}

## Tarea
Escribí el informe diario de temas relevantes para este cliente:
1. **Resumen ejecutivo** (3-5 líneas: qué importa hoy).
2. **Temas del día** — cada tema con: volumen aproximado, fuentes donde aparece, tono, y si es nuevo / crece / decrece respecto del informe anterior.
3. **Menciones destacadas** — 3-5 citas textuales cortas con fuente.
4. **Señales a vigilar** — temas incipientes o cambios de tono.
5. **Sugerencia operativa** — 1-2 acciones concretas (ej: pregunta para encuesta, keyword a agregar).
${isElectoral ? `
Además, por ser monitoreo electoral:
6. **Mapa por categorías** — ordená las cuentas DENTRO de cada categoría por amplificación/adhesión/densidad (no compares categorías entre sí); notá cuando el orden por estructura difiere del orden por tamaño.
7. **Cuentas que operan y cuentas nuevas** — declarando cuántas nuevas de cada dirección del conflicto aparecieron.
8. **Cuenta regresiva** — expresá los hitos en días que faltan, no en fechas.` : ""}
Si casi no hay menciones nuevas, decilo sin inflar, y sugerí ajustes de fuentes/keywords.

Cerrá el informe con un bloque \`\`\`json\`\`\` con este esquema exacto:
{ "nuevosActores": [{ "handle": "", "platform": "instagram|x|facebook|tiktok", "category": "organizacion|medio|individual|institucional|opera", "direccion": "A|B|?", "evidencia": "url de la mención", "razon": "por qué vale seguirla" }] }
El bloque es interno (el operador lo revisa aparte): no lo menciones ni lo describas en el cuerpo del informe.
Solo cuentas que aparecen en las menciones de arriba y NO están en el plan${monitor.accounts.length ? ` (plan: ${monitor.accounts.map((a) => "@" + a.handle.replace(/^@/, "")).join(", ")})` : ""}. Si no hay, "nuevosActores": [].`;

  const result = await generateText({
    apiKey,
    system,
    prompt,
    maxTokens: 3500,
  });
  await incrementUsage(CLAUDE_ID, result.inputTokens + result.outputTokens, projectId);

  const { markdown, nuevosActores } = splitReport(result.text);
  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    pull,
  };
  await saveReport(projectId, report);
  if (nuevosActores.length > 0) {
    try {
      const merged = mergeSuggestions(brief, nuevosActores, monitor.accounts, report.at);
      if (merged.suggestions.length !== brief.suggestions.length) {
        await saveClientBrief(projectId, merged);
      }
    } catch (e) {
      // El informe ya está guardado: una falla acá no puede frenar el mail.
      log.warn("daily_report.suggestions_save_failed", { projectId, error: (e as Error).message });
    }
  }
  log.info("daily_report.generated", {
    projectId,
    items24h: items24.length,
    nuevosActores: nuevosActores.length,
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
