// Hook de Next.js que corre una vez al inicio del server (build + runtime).
// Aborta el boot en prod si OAuth no está configurado y warning si falta
// allowlist. Detectado automáticamente por Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertAuthConfiguredInProd, assertAllowlistConfiguredInProd } =
    await import("@/lib/auth-guards");
  assertAuthConfiguredInProd();
  assertAllowlistConfiguredInProd();
}
