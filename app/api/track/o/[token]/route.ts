// Pixel de apertura de email (1x1 GIF transparente). Público (lo abre el
// destinatario, sin sesión). Registra 'open' best-effort y siempre devuelve
// el pixel.
import { recordEvent } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GIF transparente 1x1 (43 bytes).
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  await recordEvent("open", token, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
