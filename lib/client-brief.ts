// Brief acumulativo del cliente + propuesta de escenario + actores sugeridos.
//
// El operador describe al cliente en lenguaje natural, en aportes fechados y
// append-only; la IA propone el escenario de monitoreo a partir de ese brief
// (lib/scenario-ai.ts) y cada informe diario sugiere actores nuevos
// (lib/daily-report.ts). Lo VIGENTE sigue en listening_config (keywords) y
// monitor-config (resto): acá vive el contexto y lo pendiente de aplicar.
//
// Persistencia sin DDL: fila sintética conector_config brief:<projectId>.
import { createHash, randomUUID } from "node:crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";
import type { CalendarEvent, Category, MonitorAccount, Platform } from "@/lib/monitor-config";

export interface BriefEntry {
  id: string;
  at: string; // ISO
  by: string; // email del operador
  text: string;
}

export interface ScenarioProposal {
  at: string;
  briefHash: string; // hash del brief usado; si difiere del actual, la propuesta quedó vieja
  tipo: "electoral" | "territorial";
  resumen: string;
  keywords: string[];
  searchesA: string[];
  searchesB: string[];
  accounts: MonitorAccount[];
  entidades: Record<string, string>;
  calendar: CalendarEvent[];
  appliedKeywordsAt?: string;
  appliedMonitorAt?: string;
}

export interface ActorSuggestion {
  id: string; // `${platform}:${handle}` normalizado
  handle: string;
  platform: Platform;
  category: Category;
  direccion: "A" | "B" | "?";
  evidencia?: string;
  razon: string;
  suggestedAt: string;
  status: "pending" | "accepted" | "dismissed";
}

export interface ClientBrief {
  entries: BriefEntry[];
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}

export const EMPTY_BRIEF: ClientBrief = { entries: [], suggestions: [] };

const key = (projectId: string) => `brief:${projectId}`;

// ── Helpers puros (inmutables) ──────────────────────────────────────────

export function addEntry(
  brief: ClientBrief,
  input: { by: string; text: string; at?: string },
): ClientBrief {
  const text = input.text.trim();
  if (!text) throw new Error("El aporte está vacío");
  const entry: BriefEntry = {
    id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    by: input.by,
    text,
  };
  return { ...brief, entries: [...brief.entries, entry] };
}

export function removeEntry(brief: ClientBrief, id: string): ClientBrief {
  return { ...brief, entries: brief.entries.filter((e) => e.id !== id) };
}

// Texto del brief tal como lo lee el modelo: una línea por aporte, en orden.
export function briefText(brief: ClientBrief): string {
  return brief.entries
    .map((e) => `[${e.at.slice(0, 10)} · ${e.by}] ${e.text}`)
    .join("\n");
}

export function briefHash(brief: ClientBrief): string {
  return createHash("sha256").update(briefText(brief)).digest("hex").slice(0, 16);
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function suggestionId(platform: Platform, handle: string): string {
  return `${platform}:${normalizeHandle(handle)}`;
}

// Suma sugerencias de una barrida. Fuera: las que ya están en el plan, las
// aceptadas/descartadas antes y los duplicados dentro de la misma tanda.
export function mergeSuggestions(
  brief: ClientBrief,
  incoming: Omit<ActorSuggestion, "id" | "status" | "suggestedAt">[],
  accounts: { handle: string; platform: Platform }[],
  at = new Date().toISOString(),
): ClientBrief {
  const known = new Set<string>([
    ...brief.suggestions.map((s) => s.id),
    ...accounts.map((a) => suggestionId(a.platform, a.handle)),
  ]);
  const added: ActorSuggestion[] = [];
  for (const s of incoming) {
    const id = suggestionId(s.platform, s.handle);
    if (known.has(id)) continue;
    known.add(id);
    added.push({ ...s, handle: normalizeHandle(s.handle), id, suggestedAt: at, status: "pending" });
  }
  return { ...brief, suggestions: [...brief.suggestions, ...added] };
}

export function setSuggestionStatus(
  brief: ClientBrief,
  id: string,
  status: ActorSuggestion["status"],
): ClientBrief {
  return {
    ...brief,
    suggestions: brief.suggestions.map((s) => (s.id === id ? { ...s, status } : s)),
  };
}

// ── Persistencia ────────────────────────────────────────────────────────

export async function getClientBrief(projectId: string): Promise<ClientBrief> {
  if (!dbConfigured()) return EMPTY_BRIEF;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const cfg = data?.config as Partial<ClientBrief> | undefined;
  if (!cfg) return EMPTY_BRIEF;
  return {
    entries: cfg.entries ?? [],
    proposal: cfg.proposal,
    suggestions: cfg.suggestions ?? [],
  };
}

export async function saveClientBrief(projectId: string, brief: ClientBrief): Promise<void> {
  try {
    await upsertConectorConfig(key(projectId), brief);
  } catch (error) {
    log.warn("client_brief.save_failed", { error: (error as Error).message });
    throw error;
  }
}
