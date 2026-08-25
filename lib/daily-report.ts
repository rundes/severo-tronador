// Informe diario de escucha: barrido con la config vigente + síntesis con
// Claude sobre el historial del proyecto (items 24h/7d + informe anterior
// como memoria). El contexto vive en la DB — no hay que re-explicarle el
// cliente a Claude en cada corrida: config del panel + historial alcanzan.
//
// Persistencia sin DDL: fila sintética de conector_config
// daily-report:<projectId> = { latest, history[] } (historial capado).
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getListeningConfig } from "@/lib/listening-config";
import { readCachedItems, pullAllSources, type PullSummary } from "@/lib/listening-cache";
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateText } from "@/lib/anthropic";
import { incrementUsage } from "@/lib/quota";
import { getProject, listMembers } from "@/lib/projects";
import { log } from "@/lib/logger";

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
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      config: { latest: report, history },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id" },
  );
  if (error) log.warn("daily_report.save_failed", { error: error.message });
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

  const [items24, items7] = await Promise.all([
    readCachedItems(projectId, 1),
    readCachedItems(projectId, 7),
  ]);

  const claudeCfg = await getConnectorConfig(CLAUDE_ID);
  const apiKey = claudeCfg.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Conector claude-api sin ANTHROPIC_API_KEY");

  const previous = (await readDailyReports(projectId)).latest;

  const system =
    "Sos analista de opinión pública de un centro de estudios. Escribís " +
    "informes diarios de escucha social para operadores: sobrios, densos en " +
    "dato, sin marketing. Español rioplatense. Formato Markdown.";

  const prompt = `## Contexto del cliente (config del panel)
Proyecto: ${project?.nombre ?? projectId}
Zona: ${cfg.zona || "sin definir"} (${cfg.pais})
Keywords monitoreadas: ${cfg.keywords.join(", ") || "ninguna"}

## Informe anterior (para continuidad; puede no existir)
${previous ? previous.markdown.slice(0, 3000) : "(primer informe)"}

## Menciones de las últimas 24 horas (${items24.length})
${fmtItems(items24, 120) || "(sin menciones nuevas)"}

## Muestra de los últimos 7 días (${items7.length} total, para baseline)
${fmtItems(items7.slice(items24.length), 60)}

## Tarea
Escribí el informe diario de temas relevantes para este cliente:
1. **Resumen ejecutivo** (3-5 líneas: qué importa hoy).
2. **Temas del día** — cada tema con: volumen aproximado, fuentes donde aparece, tono, y si es nuevo / crece / decrece respecto del informe anterior.
3. **Menciones destacadas** — 3-5 citas textuales cortas con fuente.
4. **Señales a vigilar** — temas incipientes o cambios de tono.
5. **Sugerencia operativa** — 1-2 acciones concretas (ej: pregunta para encuesta, keyword a agregar).
Si casi no hay menciones nuevas, decilo sin inflar, y sugerí ajustes de fuentes/keywords.`;

  const result = await generateText({
    apiKey,
    system,
    prompt,
    maxTokens: 3000,
  });
  await incrementUsage(CLAUDE_ID, result.inputTokens + result.outputTokens, projectId);

  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown: result.text,
    items24h: items24.length,
    items7d: items7.length,
    pull,
  };
  await saveReport(projectId, report);
  log.info("daily_report.generated", {
    projectId,
    items24h: items24.length,
    tokens: result.inputTokens + result.outputTokens,
  });
  return report;
}

// Mail del informe a los owners del proyecto vía Resend (si está configurado).
export async function emailDailyReport(
  projectId: string,
  report: DailyReport,
): Promise<{ sent: number }> {
  const cfg = await getConnectorConfig("resend");
  if (!cfg.RESEND_API_KEY || !cfg.RESEND_FROM) return { sent: 0 };
  const project = await getProject(projectId);
  const owners = (await listMembers(projectId)).filter((m) => m.role === "owner");
  if (owners.length === 0) return { sent: 0 };
  const fecha = new Date(report.at).toLocaleDateString("es-AR");
  // Markdown como <pre> estilado: suficiente para un mail interno de operación.
  const html = `<div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;color:#18181b;max-width:720px">${report.markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</div>`;
  let sent = 0;
  for (const o of owners) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.RESEND_FROM,
        to: o.email,
        subject: `Informe de escucha · ${project?.nombre ?? ""} · ${fecha}`,
        html,
      }),
    });
    if (res.ok) sent++;
    else log.warn("daily_report.email_failed", { to: o.email, status: res.status });
  }
  return { sent };
}
