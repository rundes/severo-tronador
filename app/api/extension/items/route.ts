// POST items capturados por la extensión de Chrome → listening_items.
// La extensión corre en el navegador del operador (su sesión, su IP): captura
// lo que ve navegando las cuentas del plan de colecta y lo aporta al
// historial del proyecto. Dedupe por (project_id, url) en el upsert.
//
// Campos de métrica (seguidores, likes, comentarios, vistas, taken_at) van a
// listening_items.meta jsonb; el cálculo de amplificación/adhesión/densidad
// (spec §8) es server-side, no en el plugin.
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExtensionToken } from "@/lib/extension-token";
import { upsertItems } from "@/lib/listening-cache";
import { log } from "@/lib/logger";

const ItemSchema = z.object({
  site: z.enum(["facebook", "instagram", "x", "tiktok", "web"]),
  text: z.string().min(1).max(2000),
  url: z.string().url().max(600),
  author: z.string().max(120).optional(),
  kind: z.enum(["post", "comment", "story", "highlight", "reel"]).optional(),
  parentUrl: z.string().url().max(600).optional(),
  publishedAt: z.string().optional(),
  // Métricas para el cálculo server-side (spec §8). Todas opcionales.
  metrics: z
    .object({
      followers: z.number().int().nonnegative().optional(),
      likeCount: z.number().int().nonnegative().optional(),
      commentCount: z.number().int().nonnegative().optional(),
      viewCount: z.number().int().nonnegative().optional(),
      repostCount: z.number().int().nonnegative().optional(),
      takenAt: z.string().optional(),
      expiringAt: z.string().optional(),
    })
    .optional(),
});
const BodySchema = z.object({ items: z.array(ItemSchema).max(200) });

const CONNECTOR_BY_SITE: Record<string, string> = {
  facebook: "fb-pages",
  instagram: "meta-ig",
  x: "x-api",
  tiktok: "tiktok",
  web: "extension",
};

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const bySite = new Map<string, typeof parsed.data.items>();
  for (const item of parsed.data.items) {
    const list = bySite.get(item.site) ?? [];
    list.push(item);
    bySite.set(item.site, list);
  }
  let inserted = 0;
  for (const [site, items] of bySite) {
    const { inserted: n } = await upsertItems(
      projectId,
      CONNECTOR_BY_SITE[site],
      items.map((i) => ({
        source: `${site}/extension`,
        text: i.text.slice(0, 400),
        url: i.url,
        author: i.author,
        publishedAt: i.publishedAt ?? i.metrics?.takenAt,
        kind: i.kind,
        parentUrl: i.parentUrl,
        meta: i.metrics ? { ...i.metrics } : undefined,
      })),
    );
    inserted += n;
  }
  log.info("extension.items", { projectId, received: parsed.data.items.length, inserted });
  return NextResponse.json({ ok: true, inserted });
}
