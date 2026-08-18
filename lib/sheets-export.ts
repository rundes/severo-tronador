import { google } from "googleapis";
import { log } from "@/lib/logger";

// Mapea entidad → nombre de hoja en el Sheet de preservación.
const SHEET_BY_ENTITY: Record<string, string> = {
  padron: "padron", segmentos: "segmentos", templates: "templates",
  campanas: "campañas", envios: "envios", respuestas: "respuestas",
  opt_outs: "opt_outs", llamadas: "llamadas",
  encuestas: "encuestas", encuesta_respuestas: "encuesta_respuestas",
  bajas: "bajas",
};

// Orden EXPLÍCITO de columnas por entidad.
//
// Antes la fila se armaba con `Object.values(payload)`, es decir el orden de
// inserción de las claves del objeto. Agregar un campo al modelo (o cambiarlo
// de lugar) desplazaba todas las columnas de ahí en adelante, y el histórico ya
// escrito quedaba desalineado contra las filas nuevas — en un Sheet que existe
// justamente para preservar. Con el mapa explícito, un campo nuevo se agrega al
// final de esta lista y el histórico sigue leyéndose igual.
//
// `_mirror_id` va primero: es el id de la fila en sheets_sync_queue y sirve
// para reconciliar (dedupe off-band si el cron muere entre el append y el mark
// done).
const COLUMNS_BY_ENTITY: Record<string, string[]> = {
  campanas: [
    "_mirror_id", "id", "project_id", "nombre", "channel", "template_id",
    "segment_filter", "variants", "preguntas", "encuesta_id", "estado",
    "metrics", "created_at",
  ],
  envios: [
    "_mirror_id", "project_id", "campaign_id", "dni", "nombre", "destino",
    "estado", "reason", "provider_message_id", "delivery", "token",
    "variant_id", "created_at",
  ],
  respuestas: [
    "_mirror_id", "id", "project_id", "token", "campaign_id", "dni", "answers",
    "created_at",
  ],
  encuesta_respuestas: [
    "_mirror_id", "id", "project_id", "encuesta_id", "source", "dni", "token",
    "answers", "created_at",
  ],
  opt_outs: ["_mirror_id", "id", "project_id", "dni", "at", "reason"],
  // Tombstones de op=remove: el Sheet es un log append-only, así que una baja
  // no borra filas — se anota acá y el lector externo resta `bajas` de cada
  // hoja para reconstruir el estado vigente.
  bajas: ["_mirror_id", "entity", "entity_id", "removed_at"],
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

function cell(v: unknown): string {
  if (v == null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

// Convierte un payload a la fila de la hoja, en el orden declarado. Una entidad
// sin columnas declaradas cae al orden de las claves (comportamiento viejo):
// mejor espejar algo que perder el dato.
export function rowFor(
  entity: string,
  payload: Record<string, unknown>,
  mirrorId?: string,
): string[] {
  const full: Record<string, unknown> = mirrorId
    ? { _mirror_id: mirrorId, ...payload }
    : payload;
  const cols = COLUMNS_BY_ENTITY[entity];
  if (!cols) return Object.values(full).map(cell);
  return cols.map((c) => cell(full[c]));
}

// ¿Vale la pena reintentar? 429 (rate limit) y 5xx del lado de Google.
function isRetryable(err: unknown): boolean {
  const code = (err as { code?: number; status?: number })?.code
    ?? (err as { status?: number })?.status;
  return code === 429 || (typeof code === "number" && code >= 500);
}

const RETRY_DELAYS_MS = [1_000, 4_000, 10_000];

// ¿El error es "la hoja no existe"? Sheets responde 400 con "Unable to parse
// range: <hoja>!A1" cuando el range apunta a una hoja que no está en el
// spreadsheet.
function isMissingSheet(err: unknown): boolean {
  const code = (err as { code?: number; status?: number })?.code
    ?? (err as { status?: number })?.status;
  return code === 400 && String((err as Error)?.message ?? "").includes("Unable to parse range");
}

// Crea la hoja en el spreadsheet y le escribe la fila de encabezados si la
// entidad tiene columnas declaradas. Existe para que hojas nuevas (`bajas`) no
// exijan un paso manual en el Sheet de cada proyecto.
async function createSheet(entity: string, sheet: string): Promise<void> {
  const client = sheetsClient();
  const spreadsheetId = process.env.SHEETS_PRESERVATION_SHEET_ID!;
  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheet } } }] },
  });
  const header = COLUMNS_BY_ENTITY[entity];
  if (header) {
    await client.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheet}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }
  log.info("sheets.sheet_created", { sheet });
}

// Append de VARIAS filas a la hoja de la entidad, en un solo request.
//
// La API de Sheets tiene cuota por minuto: un append por fila hacía un request
// por envío (1.300 en una campaña) y en cuanto Google devolvía 429 la fila se
// contaba como fallada. Ahora va por lote y reintenta con backoff.
export async function appendRows(
  entity: string,
  rows: string[][],
): Promise<void> {
  const sheet = SHEET_BY_ENTITY[entity];
  if (!sheet || rows.length === 0) return;

  let sheetCreated = false;
  for (let attempt = 0; ; attempt++) {
    try {
      await sheetsClient().spreadsheets.values.append({
        spreadsheetId: process.env.SHEETS_PRESERVATION_SHEET_ID!,
        range: `${sheet}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
      return;
    } catch (err) {
      // La hoja no existe todavía (p. ej. `bajas` en un Sheet viejo): crearla
      // una sola vez y reintentar sin consumir un intento de backoff.
      if (isMissingSheet(err) && !sheetCreated) {
        sheetCreated = true;
        await createSheet(entity, sheet);
        attempt--;
        continue;
      }
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      const wait = RETRY_DELAYS_MS[attempt];
      log.warn("sheets.append.retry", {
        entity,
        rows: rows.length,
        attempt: attempt + 1,
        wait_ms: wait,
      });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Append de una fila. Se mantiene para los callers de a uno.
export async function appendRow(
  entity: string,
  payload: Record<string, unknown>,
  mirrorId?: string,
) {
  await appendRows(entity, [rowFor(entity, payload, mirrorId)]);
}
