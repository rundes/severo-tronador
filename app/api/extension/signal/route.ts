// POST: dos payloads. (1) señal anti-bloqueo (429, checkpoint, captcha…): el
// servidor enfría esa plataforma para el proyecto; el plugin corta y no
// reintenta. (2) resumen de la corrida (kind:"run-summary"): se guarda para
// que el panel muestre cuántas cuentas se relevaron y qué falló.
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExtensionToken } from "@/lib/extension-token";
import { tripBreaker } from "@/lib/monitor-breaker";
import { saveExtensionRun } from "@/lib/extension-run";

const BreakerSchema = z.object({
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

const MAX_ERRORES = 50;
const count = z.number().int().nonnegative();
const RunSummarySchema = z.object({
  kind: z.literal("run-summary"),
  cuentas: count,
  busquedas: count,
  items: count,
  candidatos: count,
  sugeridos: count,
  errores: z
    .array(
      z.object({
        platform: z.string().max(20),
        handle: z.string().max(120).optional(),
        step: z.string().max(40),
        detail: z.string().max(300),
      }),
    )
    .default([])
    // 51 errores no son un payload inválido: se recorta, no se rechaza.
    .transform((a) => a.slice(0, MAX_ERRORES)),
});

const Schema = z.union([RunSummarySchema, BreakerSchema]);

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  if ("kind" in parsed.data) {
    const { cuentas, busquedas, items, candidatos, sugeridos, errores } = parsed.data;
    await saveExtensionRun(projectId, { cuentas, busquedas, items, candidatos, sugeridos, errores });
    return NextResponse.json({ ok: true });
  }
  await tripBreaker(projectId, parsed.data.platform, parsed.data.signal);
  return NextResponse.json({ ok: true });
}
