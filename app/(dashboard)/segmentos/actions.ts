"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  SegmentFilterSchema,
  formToObject,
  summarizeZodError,
} from "@/lib/schemas";
import { z } from "zod";
import {
  deleteSegment,
  getSavedSegment,
  saveSegment,
} from "@/lib/segments-store";
import { logAudit } from "@/lib/audit";
import { requireMember } from "@/lib/workspace";
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateText } from "@/lib/anthropic";
import { incrementUsage } from "@/lib/quota";
import { barriosDisponibles, loadContacts, applySegment, parseManualList } from "@/lib/segments";

const GuardarSegmentoSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido").max(120),
  filtros: SegmentFilterSchema,
});

export async function guardarSegmento(formData: FormData) {
  const raw = formToObject(formData);
  const bands = formData.getAll("healthBands").map(String);
  const parsed = GuardarSegmentoSchema.safeParse({
    nombre: raw.nombre,
    filtros: {
      sexo: raw.sexo,
      edadMin: raw.edadMin,
      edadMax: raw.edadMax,
      barrio: raw.barrio,
      circuito: raw.circuito,
      mesa: raw.mesa,
      healthMin: raw.healthMin,
      healthBands: bands.length > 0 ? bands : undefined,
      respondedWithinDays: raw.respondedWithinDays,
      notContactedDays: raw.notContactedDays,
      hasEmail: raw.hasEmail === "1" ? true : raw.hasEmail === "0" ? false : undefined,
      hasTelefono: raw.hasTelefono === "1" ? true : raw.hasTelefono === "0" ? false : undefined,
      preferredChannel: raw.preferredChannel,
    },
  });
  if (!parsed.success) {
    const qs = new URLSearchParams({
      error: "validacion",
      detalle: summarizeZodError(parsed.error),
    });
    redirect(`/segmentos?${qs}`);
  }

  const { id: projectId } = await requireMember("editor");
  const session = await auth();
  const email = session?.user?.email ?? null;
  const saved = await saveSegment(
    projectId,
    parsed.data.nombre,
    parsed.data.filtros,
    email ?? undefined,
  );
  await logAudit({
    action: "segment.save",
    projectId,
    actor: email,
    entity_type: "segment",
    entity_id: saved.id,
    details: { nombre: saved.nombre },
  });
  revalidatePath("/segmentos");
  redirect("/segmentos?guardado=1");
}

// Crea un segmento a partir de una descripción en lenguaje natural usando la
// cuenta de Claude (conector claude-api). Claude devuelve un SegmentFilter
// JSON que validamos; luego redirige a /segmentos con esos filtros aplicados
// (el form y el contador se prellenan desde la URL) para revisar y guardar.
export async function crearSegmentoIA(formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim();
  const fail = (detalle: string) =>
    redirect(`/segmentos?error=ia&detalle=${encodeURIComponent(detalle)}`);

  if (!prompt) fail("Describí el segmento que querés.");
  const { id: projectId } = await requireMember("editor");

  const cfg = await getConnectorConfig("claude-api");
  const apiKey = cfg.ANTHROPIC_API_KEY;
  if (!apiKey) fail("Falta la API key de Claude. Cargala en Conectores → Claude API.");

  const all = await loadContacts(projectId);
  const barrios = barriosDisponibles(all).slice(0, 200);

  const system = [
    "Convertís una descripción en español de una audiencia en un filtro de",
    "segmento JSON para una base de contactos. Devolvé SOLO el JSON (sin",
    "explicaciones ni bloque de código).",
    "",
    "Esquema (todas las claves opcionales; omití las que no apliquen):",
    "- sexo: \"F\" | \"M\"",
    "- edadMin, edadMax: enteros 0..120",
    "- barrio: string EXACTO de la lista de barrios provista",
    "- circuito, mesa: string",
    "- healthMin: entero 0..100 (salud de la relación)",
    "- healthBands: array de \"green\"|\"yellow\"|\"red\"",
    "- respondedWithinDays: entero (respondió en últimos N días)",
    "- notContactedDays: entero (sin contacto hace >= N días)",
    "- hasEmail, hasTelefono: boolean",
    "- preferredChannel: \"email\"|\"whatsapp\"|\"sms\"|\"voice\"",
    "",
    "Reglas: mapeá edades (\"jóvenes\"≈18-29, \"adultos mayores\"≈65+) con",
    "criterio. Para barrio usá SOLO un valor de la lista (si no hay match claro,",
    "omitilo). No inventes claves fuera del esquema.",
    "",
    "Barrios disponibles: " + (barrios.length ? barrios.join(", ") : "(ninguno)"),
  ].join("\n");

  let text: string | null = null;
  let apiErr: string | null = null;
  try {
    const r = await generateText({ apiKey, system, prompt: `Descripción: ${prompt}`, maxTokens: 1024 });
    text = r.text;
    await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
  } catch (e) {
    apiErr = (e as Error).message;
  }
  if (apiErr || !text) fail(`Error al generar: ${apiErr ?? "sin respuesta"}`);

  const stripped = (text as string)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    fail("El asistente no devolvió un filtro válido. Probá reformular.");
  }
  const parsed = SegmentFilterSchema.safeParse(obj);
  if (!parsed.success) {
    fail(`Filtro inválido: ${summarizeZodError(parsed.error)}`);
  }
  const f = parsed.data!;

  const qs = new URLSearchParams();
  const setStr = (k: string, v: string | number | undefined) => {
    if (v != null && String(v) !== "") qs.set(k, String(v));
  };
  setStr("sexo", f.sexo);
  setStr("edadMin", f.edadMin);
  setStr("edadMax", f.edadMax);
  setStr("barrio", f.barrio);
  setStr("circuito", f.circuito);
  setStr("mesa", f.mesa);
  setStr("healthMin", f.healthMin);
  if (f.healthBands && f.healthBands.length > 0) qs.set("healthBands", f.healthBands.join(","));
  setStr("respondedWithinDays", f.respondedWithinDays);
  setStr("notContactedDays", f.notContactedDays);
  if (f.hasEmail !== undefined) qs.set("hasEmail", f.hasEmail ? "1" : "0");
  if (f.hasTelefono !== undefined) qs.set("hasTelefono", f.hasTelefono ? "1" : "0");
  setStr("preferredChannel", f.preferredChannel);
  qs.set("ia", "ok");

  redirect(`/segmentos?${qs.toString()}`);
}

// Crea un segmento a partir de una lista pegada a mano de DNIs y/o emails.
// El segmento queda como el conjunto explícito de esos contactos (los que
// existan en el padrón). Guarda directo (la lista no entra en la URL).
export async function guardarSegmentoLista(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const raw = String(formData.get("lista") ?? "");
  if (!nombre) {
    redirect(`/segmentos?error=lista&detalle=${encodeURIComponent("Poné un nombre al segmento.")}`);
  }
  const { dnis, emails } = parseManualList(raw);
  if (dnis.length === 0 && emails.length === 0) {
    redirect(`/segmentos?error=lista&detalle=${encodeURIComponent("Pegá al menos un DNI o email.")}`);
  }

  const { id: projectId } = await requireMember("editor");
  const filtros = { dnis, emails };
  // Contamos cuántos de la lista existen realmente en el padrón.
  let matched = 0;
  try {
    const all = await loadContacts(projectId);
    matched = applySegment(all, filtros).length;
  } catch {
    // si falla el conteo, igual guardamos
  }

  const session = await auth();
  const saved = await saveSegment(projectId, nombre, filtros, session?.user?.email ?? undefined);
  await logAudit({
    action: "segment.save",
    projectId,
    actor: session?.user?.email ?? null,
    entity_type: "segment",
    entity_id: saved.id,
    details: { nombre: saved.nombre, lista: true, dnis: dnis.length, emails: emails.length, matched },
  });
  revalidatePath("/segmentos");
  redirect(`/segmentos?lista_ok=${matched}&pedidos=${dnis.length + emails.length}`);
}

export async function borrarSegmento(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const { id: projectId } = await requireMember("editor");
  const seg = await getSavedSegment(projectId, id);
  if (!seg) return;
  await deleteSegment(projectId, id);
  const session = await auth();
  await logAudit({
    action: "segment.delete",
    projectId,
    actor: session?.user?.email ?? null,
    entity_type: "segment",
    entity_id: id,
    details: { nombre: seg.nombre },
  });
  revalidatePath("/segmentos");
}
