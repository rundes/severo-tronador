"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pullAllSources, savePullSummary } from "@/lib/listening-cache";
import { normalizeFbUrl, normalizeTgChannel, partitionFeeds } from "@/lib/escucha-fuentes";
import { log } from "@/lib/logger";
import { issueExtensionToken } from "@/lib/extension-token";
import { generateDailyReport, emailDailyReport } from "@/lib/daily-report";
import { getListeningConfig, saveListeningConfig } from "@/lib/listening-config";
import { normalizeHandle } from "@/lib/padron-handles";
import { enqueueXHandles } from "@/lib/x-timeline";
import { dbConfigured } from "@/lib/db/supabase";
import { requireMember, currentUserEmail } from "@/lib/workspace";
import { GuardarEscuchaSchema, AudioProgramSchema, formToObject } from "@/lib/schemas";
import { hasValidSlot } from "@/lib/audio-programs";
import { listMarcas, toggleMarca } from "@/lib/escucha-marcas";
import { listDescartes, toggleDescarte } from "@/lib/escucha-descartes";
import { signedReadUrl } from "@/lib/gcs";
import { projectOwnsAudio } from "@/lib/radio-runs";
import { addEntry, getClientBrief, markApplied, removeEntry, saveClientBrief, setBriefUpdateStatus, setMaster, setSuggestionStatus, MASTER_MAX_CHARS, type ProposalBlock } from "@/lib/client-brief";
import { proposeScenario } from "@/lib/scenario-ai";
import { issueMcpToken, mcpUrl } from "@/lib/mcp-token";
import { isClaudeConversationUrl, readClaudeLink, saveClaudeLink, type ClaudeLink } from "@/lib/claude-link";
import { importReport, MAX_IMPORT_CHARS } from "@/lib/report-import";

// Firma una URL de lectura para reproducir un audio de radio guardado en GCS.
//
// El path llega del cliente, así que se verifica que corresponda a una
// grabación del proyecto activo antes de firmar: el bucket es compartido y sin
// esa verificación cualquier miembro de cualquier proyecto podía pedir la firma
// de un objeto arbitrario y bajarse el audio de otro.
export async function firmarAudioRadio(audioObject: string): Promise<{ url: string | null }> {
  const { id: projectId } = await requireMember("viewer");
  if (!audioObject) return { url: null };
  if (!(await projectOwnsAudio(projectId, audioObject))) {
    log.warn("escucha.audio.forbidden", { projectId, audioObject });
    return { url: null };
  }
  return { url: await signedReadUrl(audioObject, 3600) };
}

// ── Escenario por bloque ────────────────────────────────────────────────
//
// Cada Guardar de Escenario pisa solo los campos de su bloque (territorio,
// prensa, redes, audio, reglas) y conserva el resto de listening_config /
// monitor_config tal cual estaba. Si había una propuesta de IA pendiente,
// marca applied.<bloque> para que el banner de Escenario refleje el avance.

const lines = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

// GuardarEscuchaSchema espera radioKm/lat/lng como string de formulario
// (emptyToUndef); getListeningConfig los devuelve ya tipados (number | null).
// Los bloques que no tocan esos campos igual pisan cfg entero vía spread, así
// que hay que "des-tipar" antes de volver a parsear.
const numToForm = (n: number | null): string => (n == null ? "" : String(n));

async function applyBlock(projectId: string, block: ProposalBlock) {
  const brief = await getClientBrief(projectId);
  if (brief.proposal && !brief.proposal.applied[block]) {
    await saveClientBrief(projectId, { ...brief, proposal: markApplied(brief.proposal, block) });
  }
}

function okRedirect(block: ProposalBlock | "prensa"): never {
  revalidatePath("/escucha");
  redirect(`/escucha?tab=escenario&ok=${block}`);
}

function errRedirect(block: string, motivo: string): never {
  redirect(`/escucha?tab=escenario&error=${block}:${encodeURIComponent(motivo.slice(0, 80))}`);
}

// Conectores togglables que gobierna cada bloque (ids de sourceStatuses en
// app/(dashboard)/escucha/page.tsx). No existe un conector "radio": la
// ingesta de audio corre por fuera del pull togglable (ver cacheConnectorFilter
// en lib/listening.ts), así que Audio y video no gobierna ningún id.
const PRENSA_IDS = ["gdelt", "rss-medios", "meta-content-library"] as const;
const REDES_IDS = ["x-api"] as const;
const ALL_SOURCE_IDS: string[] = [...PRENSA_IDS, ...REDES_IDS];

// Pisa en cfg.fuentes solo los ids del bloque: quita los que gobierna y suma
// los marcados.
function mergeFuentes(current: string[], owned: readonly string[], checked: string[], allIds: string[]): string[] {
  const checkedOwned = checked.filter((id) => owned.includes(id));
  // fuentes vacío = "todas". Si el bloque sigue con todo marcado, no se
  // materializa la lista: un conector nuevo seguiría entrando por defecto.
  if (current.length === 0 && checkedOwned.length === owned.length) return current;
  const base = current.length === 0 ? allIds : current;
  return [...base.filter((id) => !owned.includes(id)), ...checkedOwned];
}

export async function guardarTerritorio(formData: FormData) {
  // Sin Supabase la config no puede persistir. Redirigimos con flag para que
  // la UI muestre el estado en banner, en vez de throw → error boundary.
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=territorio:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const raw = formToObject(formData);
  const parsed = GuardarEscuchaSchema.safeParse({
    ...cur,
    zona: raw.zona, pais: raw.pais, radioKm: raw.radioKm, lat: raw.lat, lng: raw.lng,
    keywords: lines(formData, "keywords"),
  });
  if (!parsed.success) errRedirect("territorio", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  await applyBlock(projectId, "territorio");
  // Carga inicial: corre después de responder (after → no bloquea el submit).
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
    } catch (e) {
      log.warn("listening.initial_pull.failed", { projectId, error: (e as Error).message });
    }
  });
  okRedirect("territorio");
}

export async function guardarPrensa(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=prensa:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const parts = partitionFeeds(cur.rssFeeds);
  const medios = lines(formData, "rssFeeds");
  const rssFeeds = [...new Set([...medios, ...parts.facebook, ...parts.telegram])];
  const fuentes = mergeFuentes(cur.fuentes, PRENSA_IDS, formData.getAll("fuentesPrensa").map(String), ALL_SOURCE_IDS);
  const parsed = GuardarEscuchaSchema.safeParse({
    ...cur,
    radioKm: numToForm(cur.radioKm), lat: numToForm(cur.lat), lng: numToForm(cur.lng),
    rssFeeds, fuentes,
  });
  if (!parsed.success) errRedirect("prensa", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
    } catch (e) {
      log.warn("listening.initial_pull.failed", { projectId, error: (e as Error).message });
    }
  });
  okRedirect("prensa");
}

export async function guardarRedes(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=redes:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  const parts = partitionFeeds(cur.rssFeeds);
  const fbUrls = lines(formData, "fbUrls").map(normalizeFbUrl).filter((u): u is string => Boolean(u));
  const tgChannels = String(formData.get("tgChannels") ?? "").split(/[\n,]/).map(normalizeTgChannel).filter((u): u is string => Boolean(u));
  const rssFeeds = [...new Set([...parts.medios, ...fbUrls, ...tgChannels])];
  const xHandles = Array.from(new Set(String(formData.get("xHandles") ?? "").split(/[\n,]/).map(normalizeHandle).filter(Boolean)));
  const fuentes = mergeFuentes(cur.fuentes, REDES_IDS, formData.getAll("fuentesRedes").map(String), ALL_SOURCE_IDS);
  const parsed = GuardarEscuchaSchema.safeParse({
    ...cur,
    radioKm: numToForm(cur.radioKm), lat: numToForm(cur.lat), lng: numToForm(cur.lng),
    rssFeeds, xHandles, fuentes,
  });
  if (!parsed.success) errRedirect("redes", "datos inválidos");
  await saveListeningConfig(projectId, parsed.data);
  if (parsed.data.xHandles.length > 0) await enqueueXHandles(projectId, parsed.data.xHandles);

  // Cuentas del plan + búsquedas A/B (monitor-config); entidades/calendario/
  // noRepetir son del bloque Reglas y se conservan.
  const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
  const prev = await getMonitorConfig(projectId);
  const PLAT = new Set(["instagram", "x", "facebook", "tiktok"]);
  const CAT = new Set(["organizacion", "medio", "individual", "institucional", "opera"]);
  const accounts = lines(formData, "accounts").flatMap((l) => {
    const [handle, platform, category, ...rest] = l.split(",").map((s) => s.trim());
    if (!handle || !PLAT.has(platform) || !CAT.has(category)) return [];
    return [{ handle: handle.replace(/^@/, ""), platform: platform as "instagram" | "x" | "facebook" | "tiktok", category: category as "organizacion" | "medio" | "individual" | "institucional" | "opera", vinculo: rest.join(",").trim() || undefined }];
  });
  await saveMonitorConfig(projectId, { ...prev, accounts, searchesA: lines(formData, "searchesA"), searchesB: lines(formData, "searchesB") });
  await applyBlock(projectId, "redes");
  // Carga inicial: como Territorio y Prensa (Telegram entra por el conector
  // RSS de rssFeeds, no necesita su propio disparador).
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
    } catch (e) {
      log.warn("listening.initial_pull.failed", { projectId, error: (e as Error).message });
    }
  });
  okRedirect("redes");
}

export async function guardarAudio(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=audio:no_db");
  const { id: projectId } = await requireMember("editor");
  const cur = await getListeningConfig(projectId);
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("audioPrograms") ?? "[]"));
  } catch {
    errRedirect("audio", "JSON inválido");
  }
  const list = Array.isArray(raw) ? raw : [];
  const programs = [];
  for (let i = 0; i < list.length; i++) {
    const r = AudioProgramSchema.safeParse(list[i]);
    if (!r.success) errRedirect("audio", `programa ${i + 1}: ${r.error.issues[0]?.message ?? "inválido"}`);
    const p = r.data;
    // Franja vacía se admite (queda "por completar"); franja parcial o invertida no.
    const empty = !p.start && !p.end;
    if (!empty && !hasValidSlot(p)) errRedirect("audio", `programa ${i + 1}: franja inválida (inicio < fin, HH:MM)`);
    programs.push(p);
  }
  await saveListeningConfig(projectId, { ...cur, radioStreams: programs });
  await applyBlock(projectId, "audio");
  okRedirect("audio");
}

export async function guardarReglas(formData: FormData) {
  if (!dbConfigured()) redirect("/escucha?tab=escenario&error=reglas:no_db");
  const { id: projectId } = await requireMember("editor");
  const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
  const prev = await getMonitorConfig(projectId);
  const calendar = lines(formData, "calendar").flatMap((l) => {
    const [label, date] = l.split(",").map((s) => s.trim());
    if (!label || !date || Number.isNaN(+new Date(date))) return [];
    return [{ label, date }];
  });
  const entidades: Record<string, string> = {};
  for (const l of lines(formData, "entidades")) {
    const i = l.indexOf(":");
    if (i > 0) entidades[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  await saveMonitorConfig(projectId, { ...prev, calendar, entidades, noRepetir: lines(formData, "noRepetir") });
  await applyBlock(projectId, "reglas");
  okRedirect("reglas");
}

export async function marcarToggle(input: {
  itemKey: string;
  kind: "feed" | "topic";
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; marked: boolean; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  return toggleMarca(projectId, {
    itemKey: input.itemKey,
    kind: input.kind,
    payload: input.payload,
  });
}

export async function listarMarcas(): Promise<{ itemKey: string }[]> {
  if (!dbConfigured()) return [];
  // requireProject can't be called in a no-auth context; use requireMember at
  // viewer level so read-only users can hydrate the list without a redirect.
  const { id: projectId } = await requireMember("viewer");
  const marcas = await listMarcas(projectId);
  return marcas.map((m) => ({ itemKey: m.itemKey }));
}

// Descartar/restaurar una mención del feed (ocultar reversible).
export async function descartarToggle(input: {
  itemKey: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; descartado: boolean; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  return toggleDescarte(projectId, {
    itemKey: input.itemKey,
    payload: input.payload,
  });
}

export async function listarDescartes(): Promise<string[]> {
  if (!dbConfigured()) return [];
  const { id: projectId } = await requireMember("viewer");
  return listDescartes(projectId);
}

// Token para la extensión de Chrome: lo genera un owner y se muestra una vez.
// Regenerarlo invalida el anterior.
export async function generarTokenExtension(): Promise<{ token: string }> {
  const { id: projectId } = await requireMember("owner");
  const token = await issueExtensionToken(projectId);
  return { token };
}

// Barrido + informe on-demand desde el panel (además del cron diario).
export async function generarInformeAhora(): Promise<void> {
  const { id: projectId } = await requireMember("editor");
  const report = await generateDailyReport(projectId);
  await emailDailyReport(projectId, report);
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&generado=1");
}

// ── Brief del cliente → escenario con IA ────────────────────────────────

export async function agregarAporteBrief(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const text = String(formData.get("text") ?? "");
  if (!text.trim()) redirect("/escucha?tab=escenario&brief_error=vacio");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, addEntry(brief, { by: await currentUserEmail(), text }));
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario&brief=1");
}

export async function quitarAporteBrief(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const id = String(formData.get("id") ?? "");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, removeEntry(brief, id));
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario");
}

// Brief maestro: el documento que manda sobre la config del panel para el
// contexto del informe. Se pisa entero en cada Guardar (no es append-only
// como los aportes) y no puede pasar de MASTER_MAX_CHARS.
export async function guardarBriefMaestro(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const text = String(formData.get("master") ?? "");
  if (!text.trim()) redirect("/escucha?tab=escenario&brief_error=maestro_vacio");
  if (text.length > MASTER_MAX_CHARS) redirect("/escucha?tab=escenario&brief_error=too_long");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, setMaster(brief, { by: await currentUserEmail(), text }));
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario&maestro=1");
}

// Propuesta de actualización del brief que trajo un informe: aceptar la suma
// como aporte fechado (el maestro nunca se edita solo, spec §5); descartar la
// marca y no vuelve.
export async function resolverBriefUpdate(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const id = String(formData.get("id") ?? "");
  const accepted = String(formData.get("accion") ?? "") === "aceptar";
  const brief = await getClientBrief(projectId);
  const u = (brief.pendingUpdates ?? []).find((x) => x.id === id && x.status === "pending");
  if (!u) {
    // Propuesta ya resuelta o inexistente (doble click / pestaña vieja):
    // no se vuelve a sumar el aporte ni se pisa el estado.
    revalidatePath("/escucha");
    redirect("/escucha?tab=escenario");
  }
  let next = setBriefUpdateStatus(brief, id, accepted ? "accepted" : "dismissed");
  if (accepted) {
    next = addEntry(next, {
      by: await currentUserEmail(),
      text: `[informe ${u.reportAt.slice(0, 10)} · §${u.seccion}] ${u.texto}`,
    });
  }
  await saveClientBrief(projectId, next);
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario&maestro=1");
}

export async function generarEscenarioIA() {
  const { id: projectId } = await requireMember("editor");
  const r = await proposeScenario(projectId);
  revalidatePath("/escucha");
  if (!r.ok) redirect(`/escucha?tab=escenario&ia_error=${encodeURIComponent(r.error.slice(0, 200))}`);
  redirect("/escucha?tab=escenario&ia=1");
}

export async function descartarPropuesta() {
  const { id: projectId } = await requireMember("editor");
  const brief = await getClientBrief(projectId);
  await saveClientBrief(projectId, { ...brief, proposal: undefined });
  revalidatePath("/escucha");
  redirect("/escucha?tab=escenario");
}

// Incorporar (→ plan de colecta, con nota de origen) o descartar un actor
// sugerido por una barrida. Nunca automático: spec FERRO §9.2.
export async function resolverActorSugerido(input: { id: string; accepted: boolean }) {
  const { id: projectId } = await requireMember("editor");
  const brief = await getClientBrief(projectId);
  const s = brief.suggestions.find((x) => x.id === input.id);
  if (!s) {
    // Sugerencia ya resuelta o inexistente (doble click / pestaña vieja):
    // refrescar para que la UI deje de mostrarla.
    revalidatePath("/escucha");
    return;
  }
  if (input.accepted) {
    const { getMonitorConfig, saveMonitorConfig } = await import("@/lib/monitor-config");
    const monitor = await getMonitorConfig(projectId);
    const yaEsta = monitor.accounts.some((a) => a.platform === s.platform && a.handle.toLowerCase() === s.handle);
    if (!yaEsta) {
      await saveMonitorConfig(projectId, {
        ...monitor,
        accounts: [
          ...monitor.accounts,
          { handle: s.handle, platform: s.platform, category: s.category, nota: `sugerido por barrida ${s.suggestedAt.slice(0, 10)}` },
        ],
      });
    }
  }
  await saveClientBrief(projectId, setSuggestionStatus(brief, input.id, input.accepted ? "accepted" : "dismissed"));
  revalidatePath("/escucha");
}

// -- Vínculo con Claude (MCP remoto, conversación, importación) -----------

// URL base pública de la app. Mismo default que lib/daily-report.ts: si algún
// día se separan, el mail y el conector apuntarían a hosts distintos.
function appUrl(): string {
  return (process.env.APP_URL ?? "https://severo-tronador.vercel.app").replace(/\/$/, "");
}

// URL del conector MCP del proyecto: la genera un owner y se muestra UNA vez
// (contiene el token). Regenerarla invalida la anterior.
export async function generarUrlMcp(): Promise<{ url: string }> {
  const { id: projectId } = await requireMember("owner");
  const token = await issueMcpToken(projectId);
  return { url: mcpUrl(appUrl(), token) };
}

// Conversación de claude.ai vinculada al proyecto. Vacío desvincula.
export async function vincularConversacion(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const raw = String(formData.get("conversationUrl") ?? "").trim();
  const current = await readClaudeLink(projectId);
  if (!raw) {
    // Desvincular: se van la URL y su fecha; la telemetría del canal
    // (lastToolAt/client/lastReportAt) sigue siendo cierta y se conserva.
    const resto: ClaudeLink = { ...current };
    delete resto.conversationUrl;
    delete resto.linkedAt;
    await saveClaudeLink(projectId, resto);
    revalidatePath("/escucha");
    redirect("/escucha?tab=informe&claude=1");
  }
  if (!isClaudeConversationUrl(raw)) redirect("/escucha?tab=informe&claude_error=url");
  await saveClaudeLink(projectId, { ...current, conversationUrl: raw, linkedAt: new Date().toISOString() });
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&claude=1");
}

// Importar un informe escrito afuera: archivo .md/.html o texto pegado. Se
// decide html vs markdown por la extensión del archivo y, si no hay archivo,
// por si el texto arranca con "<".
export async function importarInforme(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const archivo = formData.get("archivo");
  const pegado = String(formData.get("texto") ?? "");
  const enviarMail = formData.get("enviarMail") !== null;

  let contenido = "";
  let esHtml = false;
  if (archivo instanceof File && archivo.size > 0) {
    contenido = await archivo.text();
    esHtml = /\.html?$/i.test(archivo.name);
  } else {
    contenido = pegado;
  }
  const t = contenido.trim();
  if (!t) redirect("/escucha?tab=informe&informe_error=vacio");
  if (contenido.length > MAX_IMPORT_CHARS) redirect("/escucha?tab=informe&informe_error=grande");
  // Un HTML pegado a mano arranca con <!doctype o con una etiqueta.
  if (!esHtml && t.startsWith("<")) esHtml = true;

  try {
    const link = await readClaudeLink(projectId);
    await importReport(projectId, {
      markdown: esHtml ? undefined : t,
      html: esHtml ? contenido : undefined,
      origen: "import",
      conversationUrl: link.conversationUrl,
      enviarMail,
    });
  } catch (e) {
    log.warn("escucha.import_failed", { projectId, error: (e as Error).message });
    redirect(`/escucha?tab=informe&informe_error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&importado=1");
}
