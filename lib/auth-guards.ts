// Guards de configuración de auth. Modulo independiente sin import de
// NextAuth para que pueda ejecutarse en instrumentation y tests sin arrastrar
// el runtime de Auth.js.

export const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authConfigured = Boolean(
  process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
);

// En producción, OAuth es obligatorio. Llamar al inicio del proceso para
// abortar el boot si falta cualquier credencial. En dev no hace nada.
export function assertAuthConfiguredInProd(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (authConfigured) return;
  throw new Error(
    "AUTH_NOT_CONFIGURED: NODE_ENV=production requiere " +
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y NEXTAUTH_SECRET.",
  );
}

// En producción, allowlist vacía permite cualquier cuenta Google. No aborta,
// solo loguea warning en stderr.
export function assertAllowlistConfiguredInProd(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!authConfigured) return;
  if (allowedEmails.length === 0) {
    console.warn(
      "[auth] ALLOWED_EMAILS vacío en producción: cualquier cuenta Google " +
        "podrá ingresar.",
    );
  }
}
