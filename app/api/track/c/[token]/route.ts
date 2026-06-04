// Redirect de click rastreado. Público. Registra 'click' y redirige al
// destino real (validado http(s)).
import { recordEvent, decodeTarget } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const u = new URL(req.url).searchParams.get("u") ?? "";
  const target = decodeTarget(u);
  if (!target) return new Response("Link inválido", { status: 400 });
  // Anti open-redirect: los links rastreados siempre apuntan al propio app
  // (trackedLink envuelve ${NEXTAUTH_URL}/encuesta/...). Exigimos same-host
  // para que el endpoint no pueda usarse como redirect abierto a dominios
  // arbitrarios (phishing).
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  try {
    if (new URL(target).host !== new URL(base).host) {
      return new Response("Host no permitido", { status: 400 });
    }
  } catch {
    return new Response("Link inválido", { status: 400 });
  }
  await recordEvent("click", token, {
    url: target,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return Response.redirect(target, 302);
}
