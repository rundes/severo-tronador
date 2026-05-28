import { google } from "googleapis";

// Mapea entidad → nombre de hoja en el Sheet de preservación.
const SHEET_BY_ENTITY: Record<string, string> = {
  padron: "padron", segmentos: "segmentos", templates: "templates",
  campanas: "campañas", envios: "envios", respuestas: "respuestas",
  opt_outs: "opt_outs", llamadas: "llamadas",
};

function sheetsClient() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  const credentials = JSON.parse(Buffer.from(keyB64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function canExportSheets(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.SHEETS_PRESERVATION_SHEET_ID);
}

// Append de una fila (op upsert) a la hoja de la entidad. Prepende
// _mirror_id (UUID de la fila en sheets_sync_queue) cuando lo recibe — sirve
// de idempotency key para correr dedupe off-band si el cron crashea entre
// el append y el mark done (#17 STABILIZATION). Supabase queda como source
// of truth y el sheet se reconcilia comparando contra sheets_sync_queue.id.
export async function appendRow(
  entity: string,
  payload: Record<string, unknown>,
  mirrorId?: string,
) {
  const sheet = SHEET_BY_ENTITY[entity];
  if (!sheet) return;
  const fullPayload: Record<string, unknown> = mirrorId
    ? { _mirror_id: mirrorId, ...payload }
    : payload;
  const values = [
    Object.values(fullPayload).map((v) =>
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
    ),
  ];
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: process.env.SHEETS_PRESERVATION_SHEET_ID!,
    range: `${sheet}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}
