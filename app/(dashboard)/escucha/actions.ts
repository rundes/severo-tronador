"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";
import { normalizeHandle } from "@/lib/padron-handles";
import { dbConfigured } from "@/lib/db/supabase";
import { requireMember } from "@/lib/workspace";
import { GuardarEscuchaSchema, formToObject } from "@/lib/schemas";
import { listMarcas, toggleMarca } from "@/lib/escucha-marcas";

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
  const rssFeeds = String(formData.get("rssFeeds") ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
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
  revalidatePath("/escucha");
  redirect("/escucha?guardado=1");
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
