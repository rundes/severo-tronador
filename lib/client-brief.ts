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
import { z } from "zod";
import type { CalendarEvent, Category, MonitorAccount, Platform } from "@/lib/monitor-config";
import type { AudioProgram } from "@/lib/audio-programs";

export interface BriefEntry {
  id: string;
  at: string; // ISO
  by: string; // email del operador
  text: string;
}

// Brief maestro: el documento que el operador mantiene (mapa de actores,
// métricas medidas, hallazgos establecidos, reglas editoriales). Es la fuente
// de verdad del prompt del informe; los `entries` son notas incrementales
// entre versiones del maestro.
export interface BriefMaster {
  text: string;
  updatedAt: string; // ISO
  by: string; // email del operador
}

export const MASTER_MAX_CHARS = 60000;

// Hecho nuevo que el informe propone incorporar al maestro (spec §5). Nunca
// se edita el maestro solo: el operador acepta (→ aporte) o descarta.
export interface BriefUpdate {
  id: string;
  seccion: string;
  texto: string;
  reportAt: string; // ISO del informe que la propuso
  status: "pending" | "accepted" | "dismissed";
}

export type ProposalBlock = "territorio" | "redes" | "audio" | "reglas";
export const PROPOSAL_BLOCKS: ProposalBlock[] = ["territorio", "redes", "audio", "reglas"];

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
  audio: AudioProgram[];
  // Fecha en que cada bloque de Escenario aplicó la propuesta con su Guardar.
  applied: Partial<Record<ProposalBlock, string>>;
}

// Bloques aplicados de 4; `faltan` en orden de la UI.
export function appliedCount(p: ScenarioProposal): { done: number; total: number; faltan: ProposalBlock[] } {
  const faltan = PROPOSAL_BLOCKS.filter((b) => !p.applied[b]);
  return { done: PROPOSAL_BLOCKS.length - faltan.length, total: PROPOSAL_BLOCKS.length, faltan };
}

export function isProposalPending(p: ScenarioProposal | undefined): p is ScenarioProposal {
  return Boolean(p) && appliedCount(p as ScenarioProposal).done < PROPOSAL_BLOCKS.length;
}

export function markApplied(p: ScenarioProposal, block: ProposalBlock, at = new Date().toISOString()): ScenarioProposal {
  return p.applied[block] ? p : { ...p, applied: { ...p.applied, [block]: at } };
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
  // "barrido": propuesta por lib/candidate-ai a partir de una cuenta vista en
  // las búsquedas A/B de la extensión; "informe": propuesta por el informe
  // diario (lib/daily-report). Sin origen: sugerencias previas a este campo.
  origen?: "informe" | "barrido";
  followers?: number;
  displayName?: string;
}

export interface ClientBrief {
  entries: BriefEntry[];
  master?: BriefMaster;
  pendingUpdates?: BriefUpdate[];
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}

export const EMPTY_BRIEF: ClientBrief = { entries: [], pendingUpdates: [], suggestions: [] };

const key = (projectId: string) => `brief:${projectId}`;

// Propuestas guardadas antes de "applied por bloque" traían
// appliedKeywordsAt (→ territorio) y appliedMonitorAt (→ redes + reglas, que
// se guardaban juntas). audio no existía.
function normalizeProposal(raw: Partial<ScenarioProposal> & { appliedKeywordsAt?: string; appliedMonitorAt?: string }): ScenarioProposal {
  const applied: Partial<Record<ProposalBlock, string>> = { ...(raw.applied ?? {}) };
  if (raw.appliedKeywordsAt && !applied.territorio) applied.territorio = raw.appliedKeywordsAt;
  if (raw.appliedMonitorAt) {
    applied.redes ??= raw.appliedMonitorAt;
    applied.reglas ??= raw.appliedMonitorAt;
  }
  return {
    at: raw.at ?? "",
    briefHash: raw.briefHash ?? "",
    tipo: raw.tipo ?? "territorial",
    resumen: raw.resumen ?? "",
    keywords: raw.keywords ?? [],
    searchesA: raw.searchesA ?? [],
    searchesB: raw.searchesB ?? [],
    accounts: raw.accounts ?? [],
    entidades: raw.entidades ?? {},
    calendar: raw.calendar ?? [],
    audio: raw.audio ?? [],
    applied,
  };
}

// Lo guardado en conector_config es JSON libre: se valida al leer y lo que no
// cumple se descarta (un maestro roto no puede tirar abajo el panel).
const MasterSchema = z.object({
  text: z.string(),
  updatedAt: z.string(),
  by: z.string(),
});

const BriefUpdateSchema = z.object({
  id: z.string().min(1),
  seccion: z.string().min(1),
  texto: z.string().min(1),
  reportAt: z.string().min(1),
  status: z.enum(["pending", "accepted", "dismissed"]),
});

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

export function setMaster(
  brief: ClientBrief,
  input: { text: string; by: string; at?: string },
): ClientBrief {
  if (input.text.length > MASTER_MAX_CHARS) {
    throw new Error(`El brief maestro supera los ${MASTER_MAX_CHARS} caracteres`);
  }
  const text = input.text.trim();
  if (!text) return { ...brief, master: undefined };
  return { ...brief, master: { text, updatedAt: input.at ?? new Date().toISOString(), by: input.by } };
}

const updateKey = (seccion: string, texto: string) =>
  `${seccion.trim().toLowerCase()}::${texto.trim().toLowerCase()}`;

// Propuestas de actualización del brief que trae un informe. Fuera: las
// vacías, las que ya se propusieron antes (en cualquier estado) y los
// duplicados dentro de la misma tanda. Máximo 8 por informe (spec §5).
export function mergeBriefUpdates(
  brief: ClientBrief,
  incoming: { seccion: string; texto: string }[],
  reportAt = new Date().toISOString(),
): ClientBrief {
  const current = brief.pendingUpdates ?? [];
  const known = new Set(current.map((u) => updateKey(u.seccion, u.texto)));
  const added: BriefUpdate[] = [];
  for (const u of incoming) {
    if (added.length >= 8) break;
    const seccion = u.seccion.trim();
    const texto = u.texto.trim();
    if (!seccion || !texto) continue;
    const k = updateKey(seccion, texto);
    if (known.has(k)) continue;
    known.add(k);
    added.push({ id: randomUUID(), seccion, texto, reportAt, status: "pending" });
  }
  return { ...brief, pendingUpdates: [...current, ...added] };
}

export function setBriefUpdateStatus(
  brief: ClientBrief,
  id: string,
  status: BriefUpdate["status"],
): ClientBrief {
  return {
    ...brief,
    pendingUpdates: (brief.pendingUpdates ?? []).map((u) => (u.id === id ? { ...u, status } : u)),
  };
}

// Texto del brief tal como lo lee el modelo: primero el maestro completo,
// después los aportes (una línea por aporte, en orden).
export function briefText(brief: ClientBrief): string {
  const parts: string[] = [];
  const master = brief.master?.text.trim();
  if (master) parts.push(master);
  const aportes = brief.entries.map((e) => `[${e.at.slice(0, 10)} · ${e.by}] ${e.text}`).join("\n");
  if (aportes) parts.push(aportes);
  return parts.join("\n\n");
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
  const master = cfg.master ? MasterSchema.safeParse(cfg.master) : null;
  return {
    entries: cfg.entries ?? [],
    master: master?.success ? master.data : undefined,
    pendingUpdates: (cfg.pendingUpdates ?? [])
      .map((u) => BriefUpdateSchema.safeParse(u))
      .filter((r): r is { success: true; data: BriefUpdate } => r.success)
      .map((r) => r.data),
    proposal: cfg.proposal ? normalizeProposal(cfg.proposal) : undefined,
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
