// Conector de datos: Google Sheets (padrón). Categoría `data`.
// F1: si no hay credenciales reales (service account + sheet id), sirve el
// padrón mock de 100 filas. Cuando se setean las env vars, lee el Sheet real
// — el cambio es de config, no de código (ver PLAN.md §Bloqueantes).
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

const PADRON_RANGE = "padron!A1:Z";

function hasRealCreds(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_SHEETS_SHEET_ID,
  );
}

function getSheetsClient() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
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

export const googleSheetsConnector: DataConnector = {
  id: "google-sheets",
  name: "Google Sheets",
  vendor: "Google LLC",
  category: "data",
  description: "Padrón enriquecido como base de datos (lectura).",
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

  async test(): Promise<TestResult> {
    if (!hasRealCreds()) {
      return {
        ok: true,
        message: `Modo mock — ${mockPadron.length} filas de prueba (sin credenciales reales).`,
        details: { mode: "mock", rows: mockPadron.length },
      };
    }
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
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
    if (!hasRealCreds()) {
      return limit ? mockPadron.slice(0, limit) : mockPadron;
    }
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
      range: PADRON_RANGE,
    });
    const contacts = rowsToContacts((res.data.values as string[][]) ?? []);
    return limit ? contacts.slice(0, limit) : contacts;
  },
};
