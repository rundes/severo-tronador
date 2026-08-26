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

const MAX_CANDIDATES = 60;
const MAX_SAMPLES = 3;
const HANDLE_RE = /^[a-z0-9._-]{1,80}$/;
// Rutas de plataforma que la extensión puede confundir con un handle.
const RESERVED_HANDLES = new Set([
  "profile.php", "permalink.php", "story.php", "people", "pages", "groups",
  "watch", "reel", "i", "home", "explore", "search",
]);

function isHttpUrl(u: string): boolean {
  try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; }
}

const SampleSchema = z.object({
  url: z.string().max(600),
  text: z.string().transform((t) => t.slice(0, 500)),
  at: z.string().optional(),
});
const CandidateSchema = z.object({
  platform: z.enum(["instagram", "x", "facebook", "tiktok"]),
  handle: z.string().trim().transform((h) => h.replace(/^@/, "").trim().toLowerCase())
    .refine((h) => HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h), "handle inválido"),
  displayName: z.string().transform((s) => s.slice(0, 120)).optional(),
  followers: z.number().int().nonnegative().optional(),
  bio: z.string().transform((s) => s.slice(0, 300)).optional(),
  // Una muestra con url rara no tira el candidato: se filtra.
  sample: z.array(z.unknown()).default([]).transform((arr) =>
    arr.map((s) => SampleSchema.safeParse(s)).flatMap((r) => (r.success && isHttpUrl(r.data.url) ? [r.data] : [])).slice(0, MAX_SAMPLES),
  ),
  query: z.string().optional(),
});
const BodySchema = z.object({
  candidates: z.array(z.unknown()).max(MAX_CANDIDATES),
  searches: z.unknown().optional(),
});

function parseCandidates(raw: unknown[]): { valid: Candidate[]; dropped: number } {
  const valid: Candidate[] = [];
  let dropped = 0;
  for (const item of raw) {
    const r = CandidateSchema.safeParse(item);
    if (r.success) valid.push(r.data);
    else dropped += 1;
  }
  return { valid, dropped };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!projectId) return new Response("Forbidden", { status: 403 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  const { valid, dropped } = parseCandidates(parsed.data.candidates);

  const [brief, monitor] = await Promise.all([getClientBrief(projectId), getMonitorConfig(projectId)]);
  const known = new Set<string>([
    ...monitor.accounts.map((a) => suggestionId(a.platform, a.handle)),
    ...brief.suggestions.map((s) => s.id),
  ]);
  const fresh = valid.filter((c) => !known.has(suggestionId(c.platform, c.handle)));
  if (fresh.length === 0) return NextResponse.json({ ok: true, evaluated: 0, suggested: 0, dropped });

  try {
    const relevant = await classifyCandidates(projectId, fresh);
    // La IA tarda segundos: se relee el brief para no pisar cambios del operador.
    const current = await getClientBrief(projectId);
    const merged = mergeSuggestions(current, relevant, monitor.accounts);
    const suggested = merged.suggestions.length - current.suggestions.length;
    if (suggested > 0) await saveClientBrief(projectId, merged);
    log.info("extension.candidates", { projectId, received: parsed.data.candidates.length, dropped, evaluated: fresh.length, suggested });
    return NextResponse.json({ ok: true, evaluated: fresh.length, suggested, dropped });
  } catch (e) {
    log.error("extension.candidates.ai_failed", { projectId, error: (e as Error).message });
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
