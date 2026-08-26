// POST cuentas vistas por la extensión en las búsquedas A/B. Se filtran las
// ya conocidas (plan y sugerencias previas, incluso descartadas), Claude
// clasifica el resto y las relevantes entran a Actores sugeridos. Nunca se
// incorporan solas (spec FERRO §9.2).
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExtensionToken } from "@/lib/extension-token";
import { classifyCandidates, type Candidate } from "@/lib/candidate-ai";
import { getClientBrief, saveClientBrief, mergeSuggestions, suggestionId } from "@/lib/client-brief";
import { getMonitorConfig } from "@/lib/monitor-config";
import { log } from "@/lib/logger";

const CandidateSchema = z.object({
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  handle: z.string().trim().min(1).max(80).transform((h) => h.replace(/^@/, "").toLowerCase()),
  displayName: z.string().max(120).optional(),
  followers: z.number().int().nonnegative().optional(),
  bio: z.string().max(300).optional(),
  sample: z.array(z.object({ url: z.string().url().max(600), text: z.string().max(500), at: z.string().optional() })).max(3).default([]),
  query: z.string().optional(),
});
const BodySchema = z.object({
  candidates: z.array(CandidateSchema).max(60),
  searches: z.object({ a: z.array(z.string()), b: z.array(z.string()) }).optional(),
});

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const [brief, monitor] = await Promise.all([getClientBrief(projectId), getMonitorConfig(projectId)]);
  const known = new Set<string>([
    ...monitor.accounts.map((a) => suggestionId(a.platform, a.handle)),
    ...brief.suggestions.map((s) => s.id),
  ]);
  const fresh: Candidate[] = parsed.data.candidates.filter((c) => !known.has(suggestionId(c.platform, c.handle)));
  if (fresh.length === 0) return NextResponse.json({ ok: true, evaluated: 0, suggested: 0 });

  try {
    const relevant = await classifyCandidates(projectId, fresh);
    const merged = mergeSuggestions(brief, relevant, monitor.accounts);
    if (merged.suggestions.length !== brief.suggestions.length) await saveClientBrief(projectId, merged);
    log.info("extension.candidates", { projectId, received: parsed.data.candidates.length, evaluated: fresh.length, suggested: relevant.length });
    return NextResponse.json({ ok: true, evaluated: fresh.length, suggested: relevant.length });
  } catch (e) {
    log.error("extension.candidates.ai_failed", { projectId, error: (e as Error).message });
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
