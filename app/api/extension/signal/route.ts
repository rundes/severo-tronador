// POST: el plugin reporta una señal anti-bloqueo (429, checkpoint, captcha…)
// y el servidor enfría esa plataforma para el proyecto. El plugin corta la
// plataforma inmediatamente y no reintenta; el cooldown lo maneja el server.
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExtensionToken } from "@/lib/extension-token";
import { tripBreaker } from "@/lib/monitor-breaker";

const Schema = z.object({
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  signal: z.enum([
    "http_429",
    "http_401_403",
    "checkpoint",
    "try_later",
    "captcha",
    "empty_streak",
  ]),
});

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  await tripBreaker(projectId, parsed.data.platform, parsed.data.signal);
  return NextResponse.json({ ok: true });
}
