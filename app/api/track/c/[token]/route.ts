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
  await recordEvent("click", token, {
    url: target,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return Response.redirect(target, 302);
}
