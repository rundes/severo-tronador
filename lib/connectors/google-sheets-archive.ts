// Conector de datos: Google Sheets — ARCHIVO DE PRESERVACIÓN.
// Espejo write-behind de las tablas operativas de Supabase
// (campanas, envios, respuestas, opt_outs, llamadas, etc.) a un Sheet
// dedicado, que sirve como copia auditable fuera de Supabase.
//
// El cron /api/cron/sheets-sync drena sheets_sync_queue → appendRow del
// helper lib/sheets-export.ts usando estas credenciales. Este connector
// expone ese estado al panel de /conectores para que el operador vea
// si está conectado, qué Sheet usa y pueda hacer test desde la UI.
//
// Categoría `data` aunque la operación es write — el modelo no tiene una
// categoría "archive" separada.

import { google } from "googleapis";
import type {
  Config,
  Connector,
  ConnectorStatus,
  Quota,
  TestResult,
} from "./types";
import { getConnectorConfig } from "./config";

const ID = "google-sheets-archive";

function getSheetsClient(keyB64: string) {
  const credentials = JSON.parse(
    Buffer.from(keyB64, "base64").toString("utf8"),
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export const googleSheetsArchiveConnector: Connector = {
  id: ID,
  name: "Google Sheets · Archivo",
  vendor: "Google LLC",
  category: "data",
  description:
    "Espejo write-behind de Supabase a un Sheet de preservación (auditoría).",
  docsUrl: "https://developers.google.com/sheets/api",
  iconEmoji: "🗃️",

  capabilities: [
    {
      id: "data.write_archive",
      label: "Escribir filas operativas para auditoría",
    },
  ],

  configSchema: [
    {
      key: "SHEETS_PRESERVATION_SHEET_ID",
      label: "ID del Spreadsheet de archivo",
      type: "text",
      required: true,
      placeholder: "1AbC…",
      help: "ID del Google Sheet donde se preservan los datos.",
    },
    {
      key: "GOOGLE_SERVICE_ACCOUNT_KEY",
      label: "Service Account (JSON base64)",
      type: "secret",
      required: true,
      help: "Misma service account del padrón sirve. Necesita permiso editor sobre el Sheet de archivo.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    const hasRealCreds = Boolean(
      cfg.GOOGLE_SERVICE_ACCOUNT_KEY && cfg.SHEETS_PRESERVATION_SHEET_ID,
    );
    if (!hasRealCreds) {
      return {
        ok: true,
        message:
          "Modo mock — sin Sheet de archivo configurado, los datos solo viven en Supabase.",
        details: { mode: "mock" },
      };
    }
    try {
      const sheets = getSheetsClient(cfg.GOOGLE_SERVICE_ACCOUNT_KEY);
      const res = await sheets.spreadsheets.get({
        spreadsheetId: cfg.SHEETS_PRESERVATION_SHEET_ID,
      });
      return {
        ok: true,
        message: "Conexión OK al Sheet de archivo.",
        details: {
          mode: "real",
          title: res.data.properties?.title ?? null,
          sheets: res.data.sheets?.length ?? 0,
        },
      };
    } catch (err) {
      return {
        ok: false,
        message: `Error conectando al Sheet de archivo: ${(err as Error).message}`,
        details: { mode: "real" },
      };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },

  async getQuota(): Promise<Quota | null> {
    return null;
  },
};
