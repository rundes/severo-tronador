// Las 10 tools del servidor MCP por proyecto (spec §3), como funciones puras:
// nombre, descripción, schema zod y un handler que devuelve TEXTO. El envoltorio
// del protocolo ({ content: [{ type: "text", text }] }) lo pone la ruta, así que
// acá no se importa nada de mcp-handler ni del SDK y los tests llaman a los
// handlers directo.
//
// El proyecto lo resuelve el token de la URL. Con alcance PROYECTO (conector
// clásico) viaja por el closure y ninguna tool recibe projectId. Con alcance
// CUENTA (conector multiproyecto) cada tool acepta `project` (nombre, slug o
// id): OBLIGATORIO en las de escritura —save_report manda mails y
// link_conversation pisa el vínculo, un default silencioso escribiría en el
// proyecto equivocado— y opcional en las de lectura, donde cae al default del
// conector. La autorización es por membresía del email en cada llamada:
// lectura exige ser miembro, escritura exige editor u owner.
// Ninguna tool ejecuta barridos ni edita la configuración del monitor: el
// escenario se sigue aplicando desde el panel.
import { z } from "zod";
import { getProject, listProjectsForEmail, roleAllows, type ProjectWithRole } from "@/lib/projects";
import type { McpScope } from "@/lib/mcp-token";
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

// list_projects existe solo en el alcance cuenta: en el conector por proyecto
// no hay nada que listar.
export type ToolName = (typeof TOOL_NAMES)[number] | "list_projects";

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

// Tools del alcance proyecto: el projectId viaja por el closure, ninguna
// recibe `project`. Es el cuerpo histórico de makeTools, intacto.
function projectTools(projectId: string): McpToolDef[] {
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

export interface McpToolsOptions {
  // Telemetría del vínculo (touchClaudeLink): la ruta la agenda desde acá con
  // el proyecto YA resuelto — en alcance cuenta puede ser otro en cada llamada.
  onUse?: (projectId: string) => void;
}

// Escritura = manda mails, pisa el vínculo o encola propuestas. Estas exigen
// `project` explícito en alcance cuenta y rol editor u owner.
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "propose_brief_updates",
  "save_report",
  "link_conversation",
]);

const ProjectRefRequired = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe("Proyecto destino (OBLIGATORIO): nombre, slug o id — ver list_projects");
const ProjectRefOptional = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .optional()
  .describe("Proyecto a leer: nombre, slug o id (ver list_projects); sin esto usa el default del conector");

// Resuelve la referencia de proyecto contra las membresías del email. La misma
// consulta hace de autorización: lo que el email no integra no existe para el
// conector. Los mensajes de error listan slugs porque los lee el modelo y
// tiene que poder autocorregirse en la llamada siguiente.
async function resolveProjectRef(
  email: string,
  ref: string | undefined,
  defaultProjectId: string | null,
  write: boolean,
): Promise<ProjectWithRole> {
  const projects = await listProjectsForEmail(email);
  if (projects.length === 0) {
    throw new Error("El email de este conector no es miembro de ningún proyecto");
  }
  const slugs = projects.map((p) => p.slug).join(", ");
  let match: ProjectWithRole | undefined;
  if (ref) {
    const needle = ref.trim().toLowerCase();
    const porIdOSlug = projects.filter((p) => p.id === ref.trim() || p.slug.toLowerCase() === needle);
    const porNombre = projects.filter((p) => p.nombre.trim().toLowerCase() === needle);
    const hits = porIdOSlug.length > 0 ? porIdOSlug : porNombre;
    if (hits.length === 0) {
      throw new Error(`Ningún proyecto del conector coincide con "${ref}". Disponibles: ${slugs}`);
    }
    if (hits.length > 1) {
      throw new Error(`"${ref}" es ambiguo (${hits.map((p) => p.slug).join(", ")}): usá el slug o el id`);
    }
    match = hits[0];
  } else {
    if (write) {
      throw new Error(
        'Falta "project": las tools de escritura lo exigen SIEMPRE en el conector multiproyecto (llamá list_projects para ver los disponibles)',
      );
    }
    match = defaultProjectId ? projects.find((p) => p.id === defaultProjectId) : undefined;
    if (!match) {
      throw new Error(`Este conector no tiene proyecto default utilizable: pasá "project". Disponibles: ${slugs}`);
    }
  }
  if (write && !roleAllows(match.role, "editor")) {
    throw new Error(`Tu rol en ${match.slug} es ${match.role}: escribir exige editor u owner`);
  }
  return match;
}

// Tools del alcance cuenta: las mismas del proyecto más list_projects, con
// `project` agregado al schema y el proyecto resuelto EN CADA llamada.
// projectTools(id) son closures puros sin IO, así que reconstruirlas por
// llamada con el id resuelto es más barato que enhebrar el id por parámetro.
function accountTools(
  scope: Extract<McpScope, { kind: "account" }>,
  opts: McpToolsOptions,
): McpToolDef[] {
  const listProjects: McpToolDef = {
    name: "list_projects",
    title: "Proyectos del conector",
    description:
      "Lista los proyectos a los que este conector tiene acceso (los del email del operador): nombre, slug, id, rol y cuál es el default de lectura. El parámetro `project` de las demás tools acepta cualquiera de los tres.",
    inputSchema: Empty,
    handler: async () => {
      const projects = await listProjectsForEmail(scope.email);
      if (projects.length === 0) return "(el email de este conector no es miembro de ningún proyecto)";
      return projects
        .map(
          (p) =>
            `- ${p.nombre} · slug: ${p.slug} · id: ${p.id} · rol: ${p.role}${p.id === scope.defaultProjectId ? " · default de lectura" : ""}`,
        )
        .join("\n");
    },
  };
  // Base solo para nombres/títulos/schemas/descripciones: sus handlers no se
  // llaman nunca (el projectId real se resuelve por llamada).
  const base = projectTools("__account__");
  const tools = base.map((t): McpToolDef => {
    const write = WRITE_TOOLS.has(t.name);
    return {
      ...t,
      description: `${t.description} Parámetro \`project\` (${write ? "OBLIGATORIO: nombre, slug o id" : "opcional: nombre, slug o id; sin él usa el proyecto default del conector"}).`,
      inputSchema: t.inputSchema.extend({
        project: write ? ProjectRefRequired : ProjectRefOptional,
      }),
      handler: async (raw) => {
        const { project, ...rest } = (raw ?? {}) as Record<string, unknown>;
        const ref = typeof project === "string" && project.trim() ? project : undefined;
        const destino = await resolveProjectRef(scope.email, ref, scope.defaultProjectId, write);
        opts.onUse?.(destino.id);
        const tool = projectTools(destino.id).find((x) => x.name === t.name)!;
        const out = await tool.handler(rest);
        // El prefijo dice SIEMPRE sobre qué proyecto se operó: es la defensa
        // barata contra leer datos de un proyecto creyendo que son de otro.
        return `[proyecto: ${destino.nombre} (${destino.slug})]\n${out}`;
      },
    };
  });
  return [listProjects, ...tools];
}

// Punto de entrada de la ruta. Acepta el projectId pelado (alcance proyecto,
// compatibilidad con los llamadores históricos) o un McpScope.
export function makeTools(scope: string | McpScope, opts: McpToolsOptions = {}): McpToolDef[] {
  const s: McpScope = typeof scope === "string" ? { kind: "project", projectId: scope } : scope;
  if (s.kind === "project") {
    return projectTools(s.projectId).map((t) => ({
      ...t,
      handler: async (args) => {
        opts.onUse?.(s.projectId);
        return t.handler(args);
      },
    }));
  }
  return accountTools(s, opts);
}
