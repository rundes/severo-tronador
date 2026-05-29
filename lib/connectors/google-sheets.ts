// Conector de datos: Google Sheets — IMPORTACIÓN DEL PADRÓN.
// Solo lectura. Si el Sheet con DNIs/nombres/etc no está configurado,
// sirve el padrón mock de 100 filas para iterar sin credenciales.
//
// Es uno de los dos conceptos en que se separó la integración con Sheets.
// Ver google-sheets-archive para el write-behind de preservación.
import { google } from "googleapis";
import type {
  Config,
  Contact,
  DataConnector,
  Quota,
  ConnectorStatus,
  TestResult,
} from "./types";
import { mockPadron } from "@/lib/mock/padron";
import { getConnectorConfig } from "./config";

// A1:ZZ cubre 702 columnas (26 + 26·26). El rango anterior "A1:Z" cortaba
// a la columna 26 silenciosamente y dejaba afuera los headers que estaban
// más a la derecha. Sheets con muchas columnas perdían su mapeo.
const PADRON_RANGE = "padron!A1:ZZ";

function getSheetsClient(keyB64: string) {
  const credentials = JSON.parse(
    Buffer.from(keyB64, "base64").toString("utf8"),
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

// Mapea filas crudas (matriz) a Contact usando la primera fila como headers.
function rowsToContacts(rows: string[][]): Contact[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj as unknown as Contact;
  });
}

// Preview: devuelve headers + N filas sample. Para que el UI muestre el
// shape real del Sheet y el usuario pueda mapear columnas manualmente.
export interface PadronPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

export async function readPadronPreview(
  sampleLimit = 2,
): Promise<PadronPreview> {
  const cfg = await getConnectorConfig("google-sheets-padron");
  if (!cfg.GOOGLE_SERVICE_ACCOUNT_KEY || !cfg.GOOGLE_SHEETS_SHEET_ID) {
    return { headers: [], sampleRows: [], totalRows: 0 };
  }
  const sheets = getSheetsClient(cfg.GOOGLE_SERVICE_ACCOUNT_KEY);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: cfg.GOOGLE_SHEETS_SHEET_ID,
    range: PADRON_RANGE,
  });
  const all = ((res.data.values as string[][]) ?? []).filter((r) => r.length);
  if (all.length === 0) return { headers: [], sampleRows: [], totalRows: 0 };
  const headers = all[0].map((h) => String(h ?? "").trim());
  const rest = all.slice(1);
  return {
    headers,
    sampleRows: rest.slice(0, sampleLimit),
    totalRows: rest.length,
  };
}

// Lectura con mapeo arbitrario: mapping es { contactField: sheetHeaderName }.
// Campos del Contact sin entrada en mapping quedan vacíos.
export async function readPadronMapped(
  mapping: Record<string, string>,
): Promise<Contact[]> {
  const cfg = await getConnectorConfig("google-sheets-padron");
  if (!cfg.GOOGLE_SERVICE_ACCOUNT_KEY || !cfg.GOOGLE_SHEETS_SHEET_ID) {
    return [];
  }
  const sheets = getSheetsClient(cfg.GOOGLE_SERVICE_ACCOUNT_KEY);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: cfg.GOOGLE_SHEETS_SHEET_ID,
    range: PADRON_RANGE,
  });
  const all = ((res.data.values as string[][]) ?? []).filter((r) => r.length);
  if (all.length < 2) return [];
  const headers = all[0].map((h) => String(h ?? "").trim());
  const headerIdx = new Map(headers.map((h, i) => [h, i]));
  const contactKeys = Object.keys(mapping);
  return all.slice(1).map((row) => {
    const out: Record<string, string> = {};
    for (const key of contactKeys) {
      const headerName = mapping[key];
      if (!headerName) continue;
      const idx = headerIdx.get(headerName);
      if (idx == null) continue;
      out[key] = row[idx] ?? "";
    }
    return out as unknown as Contact;
  });
}

export const googleSheetsConnector: DataConnector = {
  id: "google-sheets-padron",
  name: "Google Sheets · Padrón",
  vendor: "Google LLC",
  category: "data",
  description:
    "Lee el padrón de ciudadanos desde un Google Sheet (solo lectura).",
  docsUrl: "https://developers.google.com/sheets/api",
  iconEmoji: "📊",

  capabilities: [
    { id: "padron.read", label: "Leer padrón" },
    { id: "data.read_write", label: "Leer/escribir hojas operativas" },
  ],

  configSchema: [
    {
      key: "GOOGLE_SHEETS_SHEET_ID",
      label: "ID del Spreadsheet",
      type: "text",
      required: true,
      placeholder: "1AbC…",
      help: "ID del Google Sheet del padrón (de la URL).",
    },
    {
      key: "GOOGLE_SERVICE_ACCOUNT_KEY",
      label: "Service Account (JSON base64)",
      type: "secret",
      required: true,
      help: "JSON de la service account, codificado en base64.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig("google-sheets-padron");
    const hasRealCreds = Boolean(cfg.GOOGLE_SERVICE_ACCOUNT_KEY && cfg.GOOGLE_SHEETS_SHEET_ID);
    if (!hasRealCreds) {
      return {
        ok: true,
        message: `Modo mock — ${mockPadron.length} filas de prueba (sin credenciales reales).`,
        details: { mode: "mock", rows: mockPadron.length },
      };
    }
    try {
      const sheets = getSheetsClient(cfg.GOOGLE_SERVICE_ACCOUNT_KEY);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: cfg.GOOGLE_SHEETS_SHEET_ID,
        range: "padron!A1:A1",
      });
      return {
        ok: true,
        message: "Conexión OK al Sheet real.",
        details: { mode: "real", probe: res.data.values?.[0]?.[0] ?? null },
      };
    } catch (err) {
      return {
        ok: false,
        message: `Error conectando al Sheet: ${(err as Error).message}`,
        details: { mode: "real" },
      };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    // En F1 el conector siempre está operativo (mock o real).
    return "enabled";
  },

  async getQuota(): Promise<Quota | null> {
    // Sheets no tiene free tier consumible relevante para nosotros.
    return null;
  },

  async readPadron(_config, opts): Promise<Contact[]> {
    const limit = opts?.limit;
    const cfg = await getConnectorConfig("google-sheets-padron");
    const hasRealCreds = Boolean(cfg.GOOGLE_SERVICE_ACCOUNT_KEY && cfg.GOOGLE_SHEETS_SHEET_ID);
    if (!hasRealCreds) {
      return limit ? mockPadron.slice(0, limit) : mockPadron;
    }
    const sheets = getSheetsClient(cfg.GOOGLE_SERVICE_ACCOUNT_KEY);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: cfg.GOOGLE_SHEETS_SHEET_ID,
      range: PADRON_RANGE,
    });
    const contacts = rowsToContacts((res.data.values as string[][]) ?? []);
    return limit ? contacts.slice(0, limit) : contacts;
  },
};
