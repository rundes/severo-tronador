"use server";
import { revalidatePath } from "next/cache";
import { importPadron, parsePadronCsv } from "@/lib/db/padron";
import { requireMember } from "@/lib/workspace";

export async function importarCsv(formData: FormData) {
  const file = formData.get("csv");
  if (!(file instanceof File)) return;
  const text = await file.text();
  const rows = parsePadronCsv(text);
  if (rows.length) {
    const { id: projectId } = await requireMember("editor");
    await importPadron(projectId, rows, "csv");
  }
  revalidatePath("/padron");
}
