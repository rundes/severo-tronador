"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { pullAllSources, savePullSummary } from "@/lib/listening-cache";
import { normalizeFbUrl, normalizeTgChannel } from "@/lib/escucha-fuentes";
import { log } from "@/lib/logger";
import { issueExtensionToken } from "@/lib/extension-token";
import { generateDailyReport, emailDailyReport } from "@/lib/daily-report";
import { saveListeningConfig } from "@/lib/listening-config";
import { normalizeHandle } from "@/lib/padron-handles";
import { enqueueXHandles } from "@/lib/x-timeline";
import { dbConfigured } from "@/lib/db/supabase";
import { requireMember } from "@/lib/workspace";
import { GuardarEscuchaSchema, formToObject } from "@/lib/schemas";
import { listMarcas, toggleMarca } from "@/lib/escucha-marcas";
import { listDescartes, toggleDescarte } from "@/lib/escucha-descartes";
import { signedReadUrl } from "@/lib/gcs";
import { projectOwnsAudio } from "@/lib/radio-runs";

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
