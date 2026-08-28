// Las 10 tools del servidor MCP por proyecto (spec §3), como funciones puras:
// nombre, descripción, schema zod y un handler que devuelve TEXTO. El envoltorio
// del protocolo ({ content: [{ type: "text", text }] }) lo pone la ruta, así que
// acá no se importa nada de mcp-handler ni del SDK y los tests llaman a los
// handlers directo.
//
// Ninguna tool recibe projectId: el proyecto lo resuelve el token de la URL y
// viaja por el closure de makeTools(). Ninguna tool ejecuta barridos ni edita
// la configuración del monitor: el escenario se sigue aplicando desde el panel.
import { z } from "zod";
import { getProject } from "@/lib/projects";
import { getListeningConfig } from "@/lib/listening-config";
import { getMonitorConfig } from "@/lib/monitor-config";
import {
  commentsSection,
  countdownItems,
  metricsLine,
  readDailyReports,
  type DailyReport,
} from "@/lib/daily-report";
import { accountMetrics } from "@/lib/monitor-metrics";
import { readCachedItems } from "@/lib/listening-cache";
import { readExtensionRun } from "@/lib/extension-run";
import {
  briefHash,
  briefText,
  getClientBrief,
  mergeBriefUpdates,
  saveClientBrief,
} from "@/lib/client-brief";
import { isClaudeConversationUrl, readClaudeLink, saveClaudeLink } from "@/lib/claude-link";
import { importReport } from "@/lib/report-import";
import { reportTitle } from "@/lib/report-markdown";

// Orden y nombres exactos: la ruta los registra en este orden y el panel los
// documenta con estos nombres. Cambiar uno acá obliga a cambiar el texto de
// ayuda de components/escucha/claude-link-card.tsx.
export const TOOL_NAMES = [
  "get_project",
  "get_brief",
  "propose_brief_updates",
  "get_metrics",
  "get_recent_items",
  "get_run_status",
  "list_reports",
  "get_report",
  "save_report",
  "link_conversation",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface McpToolDef {
  name: ToolName;
  title: string;
  description: string;
  // Schema completo (no raw shape): mcp-handler 2.x / MCP SDK v2 lo exigen así.
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const HORAS_MAX = 24 * 30;
const ITEMS_MAX = 200;

const Empty = z.object({});
const MetricsArgs = z.object({
  days: z.number().int().min(1).max(30).default(7).describe("Ventana en días"),
});
const RecentItemsArgs = z.object({
  hours: z.number().int().min(1).max(HORAS_MAX).default(24).describe("Ventana en horas"),
  limit: z.number().int().min(1).max(ITEMS_MAX).default(100).describe("Máximo de menciones"),
  source: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .describe("Filtro por fuente (plataforma o colector: \"instagram\", \"x\", \"extension\"); no filtra por autor"),
});
const ListReportsArgs = z.object({
  limit: z.number().int().min(1).max(15).default(10),
});
const GetReportArgs = z.object({
  at: z.string().trim().min(1).optional().describe("ISO exacto del informe; sin esto, el último"),
});
const BriefUpdatesArgs = z.object({
  updates: z
    .array(z.object({ seccion: z.string().trim().min(1).max(120), texto: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(8),
});
const LinkArgs = z.object({
  conversationUrl: z.string().trim().min(1).max(500),
});
const SaveReportArgs = z.object({
  markdown: z.string().max(400_000).optional(),
  html: z.string().max(400_000).optional(),
  titulo: z.string().trim().max(200).optional(),
  at: z.string().trim().min(1).optional().describe("ISO del informe; sin esto, ahora"),
  notaOperativa: z.string().trim().max(600).optional(),
  briefUpdates: z
    .array(z.object({ seccion: z.string().trim().min(1).max(120), texto: z.string().trim().min(1).max(2000) }))
    .max(8)
    .optional(),
  enviarMail: z.boolean().default(true),
});

const fecha = (iso: string): string => (iso ? iso.slice(0, 10) : "s/d");
const origenDe = (r: DailyReport): string => r.origen ?? "tronador";
// Los informes previos al campo `titulo` no lo tienen guardado: la tesis se
// recupera del h1 del markdown, igual que hace el PDF y el mail.
const tituloDe = (r: DailyReport): string => r.titulo ?? reportTitle(r.markdown) ?? "(sin título)";

export function makeTools(projectId: string): McpToolDef[] {
  return [
    {
      name: "get_project",
      title: "Proyecto",
      description:
        "Contexto del proyecto: nombre, zona, keywords monitoreadas, conversación de Claude vinculada, hitos del calendario en días que faltan, cuentas del plan agrupadas por categoría, versión del brief y fecha del último informe.",
      inputSchema: Empty,
      handler: async () => {
        const [project, cfg, monitor, brief, store, link] = await Promise.all([
          getProject(projectId),
          getListeningConfig(projectId),
          getMonitorConfig(projectId),
          getClientBrief(projectId),
          readDailyReports(projectId),
          readClaudeLink(projectId),
        ]);
        const hitos = countdownItems(monitor.calendar);
        const porCategoria = new Map<string, string[]>();
        for (const a of monitor.accounts) {
          const list = porCategoria.get(a.category) ?? [];
          list.push(`@${a.handle.replace(/^@/, "")} (${a.platform})${a.vinculo ? ` · vínculo: ${a.vinculo}` : ""}`);
          porCategoria.set(a.category, list);
        }
        const cuentas = [...porCategoria.entries()]
          .map(([cat, hs]) => `- [${cat}] ${hs.join(", ")}`)
          .join("\n");
        return [
          `Proyecto: ${project?.nombre ?? projectId}`,
          `Zona: ${cfg.zona || "sin definir"} (${cfg.pais})`,
          `Keywords: ${cfg.keywords.join(", ") || "(ninguna)"}`,
          `Conversación vinculada: ${link.conversationUrl ?? "(sin vincular)"}`,
          "",
          "## Hitos en días",
          hitos.length
            ? hitos.map((h) => `- faltan ${h.days} días para ${h.label} (${h.detail})`).join("\n")
            : "(sin hitos cargados)",
          "",
          "## Cuentas del plan por categoría (NUNCA se comparan entre categorías)",
          cuentas || "(sin cuentas cargadas)",
          "",
          `Brief: ${brief.master ? `maestro del ${fecha(brief.master.updatedAt)}` : "sin maestro"}, ${brief.entries.length} aportes, hash ${briefHash(brief)}`,
          `Propuestas de brief pendientes: ${(brief.pendingUpdates ?? []).filter((u) => u.status === "pending").length}`,
          `Último informe: ${store.latest ? `${store.latest.at} · ${tituloDe(store.latest)} · origen ${origenDe(store.latest)}` : "(todavía no hay)"}`,
        ].join("\n");
      },
    },
    {
      name: "get_brief",
      title: "Brief del cliente",
      description:
        "Brief maestro del cliente más los aportes fechados del operador, exactamente como los lee el informe diario, y las propuestas de actualización que todavía están pendientes de revisión.",
      inputSchema: Empty,
      handler: async () => {
        const brief = await getClientBrief(projectId);
        const cuerpo = briefText(brief) || "(el brief está vacío)";
        const pendientes = (brief.pendingUpdates ?? []).filter((u) => u.status === "pending");
        return [
          cuerpo,
          "",
          `## Propuestas pendientes (${pendientes.length})`,
          pendientes.length
            ? pendientes.map((u) => `- [§${u.seccion} · informe ${fecha(u.reportAt)}] ${u.texto}`).join("\n")
            : "(ninguna)",
        ].join("\n");
      },
    },
    {
      name: "propose_brief_updates",
      title: "Proponer actualizaciones del brief",
      description:
        "Propone hechos nuevos para incorporar al brief maestro. NO edita el maestro: quedan pendientes y el operador acepta o descarta desde el panel. Hasta 8 por llamada; las repetidas se descartan.",
      inputSchema: BriefUpdatesArgs,
      handler: async (raw) => {
        const { updates } = BriefUpdatesArgs.parse(raw);
        const at = new Date().toISOString();
        const brief = await getClientBrief(projectId);
        const antes = new Set((brief.pendingUpdates ?? []).map((u) => u.id));
        const next = mergeBriefUpdates(brief, updates, at);
        const sumadas = (next.pendingUpdates ?? []).filter((u) => !antes.has(u.id)).length;
        if (sumadas > 0) await saveClientBrief(projectId, next);
        return `Propuestas recibidas: ${updates.length}. Nuevas pendientes: ${sumadas} (las repetidas se descartaron). El maestro no se tocó.`;
      },
    },
    {
      name: "get_metrics",
      title: "Métricas por cuenta",
      description:
        "Métricas medidas por cuenta del plan en la ventana pedida: seguidores, amplificación (vistas/seguidor), adhesión (likes/seguidor), comentarios, densidad de comentaristas recurrentes, piezas, historias vivas, última actividad y última pieza. Incluye una muestra de comentarios con los autores anonimizados. No se comparan cuentas de categorías distintas.",
      inputSchema: MetricsArgs,
      handler: async (raw) => {
        const { days } = MetricsArgs.parse(raw);
        const metrics = await accountMetrics(projectId, days);
        if (metrics.length === 0) return "(sin métricas: no hay cuentas cargadas o no hay piezas en la ventana)";
        return [
          `## Métricas por cuenta (ventana ${days} días)`,
          metrics.map(metricsLine).join("\n"),
          "",
          "## Comentarios recientes por cuenta (muestra, autores anonimizados c1..cN)",
          commentsSection(metrics),
        ].join("\n");
      },
    },
    {
      name: "get_recent_items",
      title: "Menciones recientes",
      description:
        "Menciones del historial del proyecto en las últimas N horas: fuente, autor, texto, URL, fecha y métricas cuando el colector las trajo. El filtro \"fuente\" compara contra la plataforma y el colector (\"instagram/extension\"), por segmento y prefijo; no busca por autor ni por texto.",
      inputSchema: RecentItemsArgs,
      handler: async (raw) => {
        const { hours, limit, source } = RecentItemsArgs.parse(raw);
        const days = Math.max(1, Math.ceil(hours / 24));
        const corte = Date.now() - hours * 3600_000;
        const q = source?.toLowerCase();
        // El source es "plataforma/colector" ("instagram/extension"): el filtro
        // compara por segmento y por prefijo, no por subcadena suelta, porque
        // "x" está adentro de "extension" y traería todo el instagram.
        const matchSource = (s: string, needle: string): boolean =>
          s
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .some((seg) => seg.startsWith(needle));
        const items = (await readCachedItems(projectId, days))
          .filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= corte)
          // Solo fuente: el parámetro se llama "fuente" y filtrar además por
          // autor devolvía menciones de otra plataforma sin avisar.
          .filter((i) => !q || matchSource(i.source, q))
          .slice(0, limit);
        if (items.length === 0) return `(sin menciones en las últimas ${hours} horas${source ? ` para "${source}"` : ""})`;
        const line = (i: (typeof items)[number]) => {
          const m = (i.meta ?? {}) as Record<string, unknown>;
          const nums = ["likeCount", "commentCount", "viewCount", "repostCount", "replyCount"]
            .filter((k) => typeof m[k] === "number")
            .map((k) => `${k}:${m[k]}`)
            .join(" ");
          return `- [${i.source}${i.author ? ` · ${i.author}` : ""}] ${i.text.slice(0, 300)}${i.url ? ` — ${i.url}` : ""}${i.publishedAt ? ` (${i.publishedAt})` : ""}${nums ? ` {${nums}}` : ""}`;
        };
        return [`## ${items.length} menciones en ${hours} h`, items.map(line).join("\n")].join("\n");
      },
    },
    {
      name: "get_run_status",
      title: "Última corrida de la extensión",
      description:
        "Resumen de la última corrida de la extensión de Chrome: cuándo fue, cuántas cuentas y búsquedas recorrió, cuántos items y candidatos trajo, y los errores por plataforma. Sirve para saber si el dato de hoy está completo antes de escribir el informe.",
      inputSchema: Empty,
      handler: async () => {
        const run = await readExtensionRun(projectId);
        if (!run) return "(todavía no corrió la extensión en este proyecto)";
        const errores = run.errores.length
          ? run.errores.map((e) => `- [${e.platform}${e.handle ? ` @${e.handle}` : ""}] ${e.step}: ${e.detail}`).join("\n")
          : "(sin errores)";
        return [
          `Última corrida: ${run.at || "s/d"}`,
          `cuentas: ${run.cuentas} · búsquedas: ${run.busquedas} · items: ${run.items} · candidatos: ${run.candidatos} · sugeridos: ${run.sugeridos}`,
          `## Errores (${run.errores.length})`,
          errores,
        ].join("\n");
      },
    },
    {
      name: "list_reports",
      title: "Informes guardados",
      description:
        "Lista los informes del historial, del más nuevo al más viejo: fecha ISO exacta (la que pide get_report), título, origen (tronador / claude-chrome / import) y menciones de las 24 h de ese día.",
      inputSchema: ListReportsArgs,
      handler: async (raw) => {
        const { limit } = ListReportsArgs.parse(raw);
        const store = await readDailyReports(projectId);
        const all = [store.latest, ...store.history].filter((r): r is DailyReport => Boolean(r)).slice(0, limit);
        if (all.length === 0) return "(todavía no hay informes)";
        return all
          .map((r) => `- ${r.at} · ${tituloDe(r)} · origen ${origenDe(r)} · ${r.items24h} menciones 24h`)
          .join("\n");
      },
    },
    {
      name: "get_report",
      title: "Leer un informe",
      description:
        "Devuelve el Markdown de un informe. Sin `at`, el último. Ojo: los informes del historial se guardan recortados a 4.000 caracteres; el completo es solo el último.",
      inputSchema: GetReportArgs,
      handler: async (raw) => {
        const { at } = GetReportArgs.parse(raw);
        const store = await readDailyReports(projectId);
        const all = [store.latest, ...store.history].filter((r): r is DailyReport => Boolean(r));
        const report = at ? all.find((r) => r.at === at) : all[0];
        if (!report) throw new Error(at ? `No hay informe con at=${at}` : "No hay informes guardados todavía");
        return [
          `at: ${report.at} · origen: ${origenDe(report)} · ${report.items24h} menciones 24h`,
          report.conversationUrl ? `conversación: ${report.conversationUrl}` : "",
          report.notaOperativa ? `nota operativa: ${report.notaOperativa}` : "",
          "",
          report.markdown,
        ]
          .filter((l) => l !== "")
          .join("\n");
      },
    },
    {
      name: "save_report",
      title: "Guardar un informe",
      description:
        "Guarda un informe escrito en esta conversación al historial del proyecto: acepta Markdown o el HTML completo de la maqueta. Dispara el mail a los owners con el PDF adjunto salvo enviarMail=false, y deja las briefUpdates como propuestas pendientes. La cuenta regresiva la escribe el sistema desde el calendario: no la incluyas.",
      inputSchema: SaveReportArgs,
      handler: async (raw) => {
        const args = SaveReportArgs.parse(raw);
        if (!args.markdown?.trim() && !args.html?.trim()) {
          throw new Error("Mandá markdown o html: llegaron los dos vacíos");
        }
        const link = await readClaudeLink(projectId);
        const r = await importReport(projectId, {
          markdown: args.markdown,
          html: args.html,
          titulo: args.titulo,
          at: args.at,
          notaOperativa: args.notaOperativa,
          briefUpdates: args.briefUpdates,
          origen: "claude-chrome",
          conversationUrl: link.conversationUrl,
          enviarMail: args.enviarMail,
        });
        return [
          `Informe guardado: ${r.at}`,
          `título: ${r.titulo}`,
          `secciones: ${r.secciones}`,
          `propuestas de brief nuevas: ${r.briefUpdates}`,
          `mail: ${r.mailSent ? "enviado con PDF adjunto" : `no enviado${r.mailError ? ` (${r.mailError})` : ""}`}`,
        ].join("\n");
      },
    },
    {
      name: "link_conversation",
      title: "Vincular esta conversación",
      description:
        "Guarda la URL de esta conversación de claude.ai en el proyecto, para que el operador pueda volver a ella desde el panel. Solo se aceptan URLs https://claude.ai/...",
      inputSchema: LinkArgs,
      handler: async (raw) => {
        const { conversationUrl } = LinkArgs.parse(raw);
        if (!isClaudeConversationUrl(conversationUrl)) {
          throw new Error("La URL tiene que ser https://claude.ai/... (no se aceptan otros dominios)");
        }
        const current = await readClaudeLink(projectId);
        await saveClaudeLink(projectId, {
          ...current,
          conversationUrl: conversationUrl.trim(),
          linkedAt: new Date().toISOString(),
        });
        return `Conversación vinculada: ${conversationUrl.trim()}`;
      },
    },
  ];
}
