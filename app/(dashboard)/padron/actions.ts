"use server";
import { revalidatePath } from "next/cache";
import { importPadron, parsePadronCsv } from "@/lib/db/padron";

export async function importarCsv(formData: FormData) {
  const file = formData.get("csv");
  if (!(file instanceof File)) return;
  const text = await file.text();
  const rows = parsePadronCsv(text);
  if (rows.length) await importPadron(rows, "csv");
  revalidatePath("/padron");
}
