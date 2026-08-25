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
import { addEntry, getClientBrief, markApplied, removeEntry, saveClientBrief, setSuggestionStatus, type ProposalBlock } from "@/lib/client-brief";
import { proposeScenario } from "@/lib/scenario-ai";

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

export async function guardarEscucha(formData: FormData) {
  // Sin Supabase la config no puede persistir. Redirigimos con flag para que
  // la UI muestre el estado en banner, en vez de throw → error boundary.
  if (!dbConfigured()) redirect("/escucha?error=no_db");
  const { id: projectId } = await requireMember("editor");

  const raw = formToObject(formData);
  const keywords = String(formData.get("keywords") ?? "")
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);
  const fuentes = formData.getAll("fuentes").map(String);
  // La UI separa medios / Facebook / Telegram en tres campos; el storage
  // sigue siendo la lista única rss_feeds (se re-particiona al renderizar).
  const medios = String(formData.get("rssFeeds") ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const fbUrls = String(formData.get("fbUrls") ?? "")
    .split("\n")
    .map((u) => normalizeFbUrl(u))
    .filter((u): u is string => Boolean(u));
  const tgChannels = String(formData.get("tgChannels") ?? "")
    .split(/[\n,]/)
    .map((u) => normalizeTgChannel(u))
    .filter((u): u is string => Boolean(u));
  const rssFeeds = [...new Set([...medios, ...fbUrls, ...tgChannels])];
  const xHandles = Array.from(
    new Set(
      String(formData.get("xHandles") ?? "")
        .split(/[\n,]/)
        .map((h) => normalizeHandle(h))
        .filter(Boolean),
    ),
  );
  // Programas de radio: la UI los manda como JSON en un campo oculto.
  let radioStreams: unknown = [];
  try {
    radioStreams = JSON.parse(String(formData.get("radioStreams") ?? "[]"));
  } catch {
    radioStreams = [];
  }

  const parsed = GuardarEscuchaSchema.safeParse({
    zona: raw.zona,
    pais: raw.pais,
    radioKm: raw.radioKm,
    lat: raw.lat,
    lng: raw.lng,
    keywords,
    fuentes,
    rssFeeds,
    xHandles,
    radioStreams,
  });
  if (!parsed.success) redirect("/escucha?error=validacion");

  await saveListeningConfig(projectId, parsed.data);
  // Si había propuesta de IA pendiente, este Guardar aplica las keywords.
  const brief = await getClientBrief(projectId);
  if (brief.proposal && !brief.proposal.applied.territorio) {
    await saveClientBrief(projectId, { ...brief, proposal: markApplied(brief.proposal, "territorio") });
  }
  // Encola la watchlist ya mismo (refresh inmediato): sin esto los handles
  // recién cargados esperaban al próximo tick del cron para entrar a la cola.
  if (parsed.data.xHandles.length > 0) {
    await enqueueXHandles(projectId, parsed.data.xHandles);
  }
  // Carga inicial: corre después de responder (after → no bloquea el submit).
  // El resumen queda persistido y la pestaña de config lo muestra por fuente.
  after(async () => {
    try {
      const summary = await pullAllSources(projectId);
      await savePullSummary(projectId, summary);
      log.info("listening.initial_pull.done", {
        projectId,
        total: summary.total,
        errors: summary.errors.length,
      });
    } catch (e) {
      log.error("listening.initial_pull.failed", { error: (e as Error).message });
    }
  });
  revalidatePath("/escucha");
  redirect("/escucha?tab=config&guardado=1");
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
// app/(dashboard)/escucha/page.tsx). Los que no aparecen acá (por ahora
// ninguno) quedan intactos en cfg.fuentes sea cual sea su bloque.
const PRENSA_IDS = ["gdelt", "rss-medios", "meta-content-library"] as const;
const REDES_IDS = ["x-api"] as const;
const AUDIO_IDS = ["radio"] as const;
const ALL_SOURCE_IDS: string[] = [...PRENSA_IDS, ...REDES_IDS, ...AUDIO_IDS];

// Pisa en cfg.fuentes solo los ids del bloque: quita los que gobierna y suma
// los marcados. `fuentes` vacío significa "todas": si el usuario desmarca
// todo un bloque partiendo de vacío, materializamos la lista completa.
function mergeFuentes(current: string[], owned: readonly string[], checked: string[], allIds: string[]): string[] {
  const base = current.length === 0 ? allIds : current;
  return [...base.filter((id) => !owned.includes(id)), ...checked.filter((id) => owned.includes(id))];
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
  const fuentes = mergeFuentes(cur.fuentes, AUDIO_IDS, formData.getAll("fuentesAudio").map(String), ALL_SOURCE_IDS);
  await saveListeningConfig(projectId, { ...cur, radioStreams: programs, fuentes });
  await applyBlock(projectId, "audio");
  okRedirect("audio");
}

export async function guardarReglas(formData: FormData) {
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

// Compat: monitor-editor.tsx (Task 4 lo reemplaza por bloque-redes.tsx) sigue
// usando el nombre viejo como `action` de su <form>.
export const guardarMonitor = guardarRedes;

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
