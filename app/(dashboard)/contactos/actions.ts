"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { importPadron, parsePadronCsv } from "@/lib/db/padron";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";
import { dbConfigured } from "@/lib/db/supabase";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { log } from "@/lib/logger";

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
  const n = await importPadron(rows, "csv");
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

export async function sincronizarGoogleSheet() {
  if (!dbConfigured()) {
    redirect("/contactos?error=no_db");
  }
  try {
    const rows = await googleSheetsConnector.readPadron();
    if (rows.length === 0) {
      redirect("/contactos?error=empty_sheet");
    }
    const n = await importPadron(rows, "google-sheets");
    const session = await auth();
    await logAudit({
      action: "campaign.create",
      actor: session?.user?.email ?? null,
      entity_type: "contactos.gsheet",
      details: { rows: n },
    });
    log.info("contactos.sync.gsheet", { rows: n });
    revalidatePath("/contactos");
    redirect(`/contactos?ok=gsheet&n=${n}`);
  } catch (err) {
    const msg = (err as Error).message;
    // Next.js redirect throws — déjalo pasar.
    if (msg.includes("NEXT_REDIRECT")) throw err;
    log.error("contactos.sync.gsheet.failed", { msg });
    redirect(
      `/contactos?error=gsheet&msg=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }
}
