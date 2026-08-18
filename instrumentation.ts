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

// Todo error no capturado de una ruta, server action o render del servidor
// pasa por acá. Antes se perdía en los logs de Vercel, mezclado con el resto y
// sin nadie mirando.
// La firma la fija Next (no exporta el tipo en esta versión, así que se declara
// sólo lo que se usa).
interface ErrorRequest {
  path?: string;
  method?: string;
}
interface ErrorContext {
  routeType?: string;
  routerKind?: string;
  routePath?: string;
  revalidateReason?: string;
}

export async function onRequestError(
  err: unknown,
  request: ErrorRequest,
  context: ErrorContext,
): Promise<void> {
  const { captureError } = await import("@/lib/error-sink");
  await captureError(err, {
    source: context.routeType ?? "route",
    path: request.path,
    method: request.method,
    extra: {
      router: context.routerKind,
      route: context.routePath,
      revalidate: context.revalidateReason,
    },
  });
}
