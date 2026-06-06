"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { importPadron, parsePadronCsv, addPadronContact } from "@/lib/db/padron";
import { createGrupo, grupoExiste } from "@/lib/grupos";
import type { Contact } from "@/lib/connectors/types";
import {
  readPadronPreview,
  readPadronMapped,
} from "@/lib/connectors/google-sheets";
import { dbConfigured } from "@/lib/db/supabase";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { log } from "@/lib/logger";
import { enqueueXHandles } from "@/lib/x-timeline";
import { requireMember } from "@/lib/workspace";

// Encola los handles de X importados para que el cron de timelines traiga
// los últimos posteos de cada uno (escucha activa). Best-effort: un fallo
// acá no rompe el import.
async function enqueueImportedHandles(
  projectId: string,
  rows: { x_handle?: string }[],
) {
  try {
    await enqueueXHandles(projectId, rows.map((r) => r.x_handle));
  } catch (e) {
    log.warn("contactos.enqueue_x.failed", { error: (e as Error).message });
  }
}

export async function crearGrupo(formData: FormData) {
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) redirect("/contactos?error=grupo_nombre");
  const { id: projectId } = await requireMember("editor");
  const grupo = await createGrupo(projectId, nombre);
  await logAudit({
    action: "group.create",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "grupo",
    entity_id: grupo.id,
    details: { nombre },
  });
  revalidatePath("/contactos");
  redirect("/contactos?ok=grupo");
}

export async function agregarContacto(formData: FormData) {
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  const dni = String(formData.get("dni") ?? "").trim();
  if (!dni) redirect("/contactos?error=manual_dni");
  const { id: projectId } = await requireMember("editor");

  const grupoId = String(formData.get("grupo_id") ?? "").trim() || null;
  if (grupoId && !(await grupoExiste(projectId, grupoId))) {
    redirect("/contactos?error=manual_grupo");
  }

  const field = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  const contact = {
    dni,
    nombre: field("nombre"),
    apellido: field("apellido"),
    email: field("email"),
    telefono: field("telefono"),
    fecha_nac: field("fecha_nac"),
    sexo: field("sexo"),
    barrio: field("barrio"),
    x_handle: field("x_handle"),
  } as Contact;

  await addPadronContact(projectId, contact, grupoId);
  await logAudit({
    action: "contact.create",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "contacto",
    entity_id: dni,
    details: { manual: true, grupo_id: grupoId },
  });
  revalidatePath("/contactos");
  redirect("/contactos?ok=manual");
}

export async function importarCsv(formData: FormData) {
  const file = formData.get("csv");
  if (!(file instanceof File)) {
    redirect("/contactos?error=no_file");
  }
  const text = await (file as File).text();
  const rows = parsePadronCsv(text);
  if (!rows.length) {
    redirect("/contactos?error=empty_csv");
  }
  if (!dbConfigured()) {
    redirect("/contactos?error=no_db");
  }
  const { id: projectId } = await requireMember("editor");
  const n = await importPadron(projectId, rows, "csv");
  await enqueueImportedHandles(projectId, rows as { x_handle?: string }[]);
  const session = await auth();
  await logAudit({
    action: "campaign.create", // reuse existing enum; entity_type discriminates
    actor: session?.user?.email ?? null,
    entity_type: "contactos.csv",
    details: { rows: n },
  });
  revalidatePath("/contactos");
  redirect(`/contactos?ok=csv&n=${n}`);
}

// Step 1 del sync: leer headers + sample rows. Redirige a /contactos
// con preview encoded para que la UI muestre el mapper.
export async function previewGoogleSheet() {
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  try {
    const preview = await readPadronPreview(2);
    if (preview.headers.length === 0) {
      redirect("/contactos?error=empty_sheet");
    }
    const encoded = Buffer.from(JSON.stringify(preview), "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    log.info("contactos.preview.gsheet", {
      headers: preview.headers.length,
      total_rows: preview.totalRows,
    });
    redirect(`/contactos?preview=${encoded}`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("NEXT_REDIRECT")) throw err;
    log.error("contactos.preview.gsheet.failed", { msg });
    redirect(
      `/contactos?error=gsheet&msg=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }
}

// Step 2: con el mapeo enviado en formData, leer todo el sheet aplicando
// la asignación de columnas y persistir.
export async function importarConMapeo(formData: FormData) {
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  const mapping: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("map_")) continue;
    const field = k.slice(4);
    const headerName = String(v).trim();
    if (headerName) mapping[field] = headerName;
  }
  if (!mapping.dni) {
    redirect(`/contactos?error=mapping_dni_required`);
  }
  try {
    const rows = await readPadronMapped(mapping);
    const filtered = rows.filter((r) => r.dni && String(r.dni).trim() !== "");
    if (filtered.length === 0) {
      redirect("/contactos?error=empty_after_mapping");
    }
    const { id: projectId } = await requireMember("editor");
    const n = await importPadron(projectId, filtered, "google-sheets");
    await enqueueImportedHandles(projectId, filtered as { x_handle?: string }[]);
    const session = await auth();
    await logAudit({
      action: "campaign.create",
      actor: session?.user?.email ?? null,
      entity_type: "contactos.gsheet",
      details: { rows: n, fields: Object.keys(mapping) },
    });
    log.info("contactos.sync.gsheet.mapped", {
      rows: n,
      mapped_fields: Object.keys(mapping).length,
    });
    revalidatePath("/contactos");
    redirect(`/contactos?ok=gsheet&n=${n}`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("NEXT_REDIRECT")) throw err;
    log.error("contactos.sync.gsheet.mapped.failed", { msg });
    redirect(
      `/contactos?error=gsheet&msg=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }
}
