// Conector de auth: Google OAuth. Categoría `auth`.
// El login real lo maneja NextAuth (lib/auth.ts); este conector es el
// descriptor que aparece en el panel y reporta si la auth está configurada.
import type { Connector, ConnectorStatus, TestResult } from "./types";

function authConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
  );
}

export const googleOAuthConnector: Connector = {
  id: "google-oauth",
  name: "Google OAuth",
  vendor: "Google LLC",
  category: "auth",
  description: "Login de voluntarios con cuenta Google + allowlist por email.",
  docsUrl: "https://authjs.dev/getting-started/providers/google",
  iconEmoji: "🔑",

  capabilities: [{ id: "auth.login", label: "Login con Google" }],

  configSchema: [
    {
      key: "GOOGLE_OAUTH_CLIENT_ID",
      label: "OAuth Client ID",
      type: "text",
      required: true,
    },
    {
      key: "GOOGLE_OAUTH_CLIENT_SECRET",
      label: "OAuth Client Secret",
      type: "secret",
      required: true,
    },
    {
      key: "ALLOWED_EMAILS",
      label: "Emails autorizados (coma-separados)",
      type: "textarea",
      required: false,
      help: "Allowlist. Vacío = cualquier cuenta Google entra (solo dev).",
    },
  ],

  async test(): Promise<TestResult> {
    return authConfigured()
      ? { ok: true, message: "OAuth configurado." }
      : {
          ok: true,
          message: "Sin configurar — auth deshabilitada (modo dev local).",
        };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return authConfigured() ? "enabled" : "configuring";
  },
};
