"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  importPadron,
  parsePadronCsv,
  addPadronContact,
  assignGroupToAll,
  assignGroupToDnis,
  deleteAllPadron,
} from "@/lib/db/padron";
import { createGrupo, grupoExiste } from "@/lib/grupos";
import type { Contact } from "@/lib/connectors/types";
import {
  readPadronPreview,
  readPadronMapped,
  readPickedPreview,
  readPickedMapped,
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
    afiliacion: field("afiliacion"),
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

// Asignación masiva de grupo: a TODOS los contactos o a una lista de DNIs.
// El grupo destino puede ser vacío (quita el grupo). "recursivo" = todos.
export async function asignarGrupoMasivo(formData: FormData) {
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  const { id: projectId } = await requireMember("editor");

  const grupoId = String(formData.get("grupo_id") ?? "").trim() || null;
  if (grupoId && !(await grupoExiste(projectId, grupoId))) {
    redirect("/contactos?error=bulk_grupo");
  }
  const modo = String(formData.get("modo") ?? "todos");

  let n = 0;
  if (modo === "dnis") {
    const raw = String(formData.get("dnis") ?? "");
    const dnis = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (dnis.length === 0) redirect("/contactos?error=bulk_dnis");
    n = await assignGroupToDnis(projectId, grupoId, dnis);
  } else {
    n = await assignGroupToAll(projectId, grupoId);
  }

  await logAudit({
    action: "group.assign",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "grupo",
    entity_id: grupoId ?? "(sin grupo)",
    details: { modo, asignados: n },
  });
  revalidatePath("/contactos");
  redirect(`/contactos?ok=bulk&n=${n}`);
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

// ── Import vía Google Picker (Sheet elegido por el usuario) ─────────────────
// El usuario elige un Spreadsheet de su Drive con el Picker; estas actions
// leen con SU access token (scope drive.file), no la service account. Devuelven
// datos (no redirigen) para que el componente client maneje el flujo en pantalla.
// El token es efímero y nunca se loguea ni persiste.
export type PickedPreviewResult =
  | { ok: true; preview: { headers: string[]; sampleRows: string[][]; totalRows: number } }
  | { ok: false; error: string };

export async function previewGoogleSheetPicked(
  spreadsheetId: string,
  accessToken: string,
): Promise<PickedPreviewResult> {
  if (!dbConfigured()) return { ok: false, error: "Base de datos no configurada." };
  if (!spreadsheetId || !accessToken) {
    return { ok: false, error: "Falta el archivo o la autorización de Drive." };
  }
  await requireMember("editor");
  try {
    const preview = await readPickedPreview(spreadsheetId, accessToken, 2);
    if (preview.headers.length === 0) {
      return { ok: false, error: "El Sheet elegido está vacío." };
    }
    log.info("contactos.preview.gsheet.picked", {
      headers: preview.headers.length,
      total_rows: preview.totalRows,
    });
    return { ok: true, preview };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("contactos.preview.gsheet.picked.failed", { msg });
    return { ok: false, error: `No se pudo leer el Sheet: ${msg.slice(0, 200)}` };
  }
}

export type PickedImportResult =
  | { ok: true; n: number }
  | { ok: false; error: string };

export async function importarConMapeoPicked(input: {
  spreadsheetId: string;
  accessToken: string;
  mapping: Record<string, string>;
}): Promise<PickedImportResult> {
  if (!dbConfigured()) return { ok: false, error: "Base de datos no configurada." };
  const { spreadsheetId, accessToken, mapping } = input;
  if (!spreadsheetId || !accessToken) {
    return { ok: false, error: "Falta el archivo o la autorización de Drive." };
  }
  if (!mapping?.dni) {
    return { ok: false, error: "Tenés que mapear la columna de DNI." };
  }
  try {
    const { id: projectId } = await requireMember("editor");
    const rows = await readPickedMapped(spreadsheetId, accessToken, mapping);
    const filtered = rows.filter((r) => r.dni && String(r.dni).trim() !== "");
    if (filtered.length === 0) {
      return { ok: false, error: "Ninguna fila tiene DNI tras el mapeo." };
    }
    const n = await importPadron(projectId, filtered, "google-sheets");
    await enqueueImportedHandles(projectId, filtered as { x_handle?: string }[]);
    const session = await auth();
    await logAudit({
      action: "campaign.create",
      actor: session?.user?.email ?? null,
      entity_type: "contactos.gsheet_picker",
      details: { rows: n, fields: Object.keys(mapping) },
    });
    log.info("contactos.sync.gsheet.picked.mapped", {
      rows: n,
      mapped_fields: Object.keys(mapping).length,
    });
    revalidatePath("/contactos");
    return { ok: true, n };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("contactos.sync.gsheet.picked.mapped.failed", { msg });
    return { ok: false, error: `No se pudo importar: ${msg.slice(0, 200)}` };
  }
}

// ── Eliminar TODOS los contactos del proyecto ──────────────────────────────
// Acción destructiva: requiere tipear "ELIMINAR" como confirmación.
export async function eliminarTodosLosContactos(formData: FormData) {
  "use server";
  if (!dbConfigured()) redirect("/contactos?error=no_db");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "ELIMINAR") {
    redirect("/contactos?error=delete_confirm");
  }
  const { id: projectId } = await requireMember("editor");
  try {
    const n = await deleteAllPadron(projectId);
    const session = await auth();
    await logAudit({
      action: "contact.delete_all",
      actor: session?.user?.email ?? null,
      entity_type: "contactos",
      details: { deleted: n },
    });
    log.info("contactos.delete_all", { deleted: n });
    revalidatePath("/contactos");
    redirect(`/contactos?ok=deleted&n=${n}`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("NEXT_REDIRECT")) throw err;
    log.error("contactos.delete_all.failed", { msg });
    redirect(`/contactos?error=delete_failed&msg=${encodeURIComponent(msg.slice(0, 200))}`);
  }
}
