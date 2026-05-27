// Encuestas tokenizadas (F6). Cada envío lleva un token único que abre la
// landing pública /encuesta/[token]. El token resuelve a {campaña, dni} sin
// exponer datos personales en la URL. Dedupe: una respuesta por token.
//
// Persistencia:
// - survey_tokens: Supabase directo (PK = token, no id) con fallback globalThis Map.
// - respuestas: Supabase directo (snake_case cols) + enqueueSheetSync mirror,
//   con fallback memoryRepo("respuestas"). Se eligió direct Supabase en vez de
//   generic repo() para evitar el mismatch camelCase↔snake_case de las columnas
//   (campaign_id, created_at). La API pública siempre devuelve SurveyResponse
//   con campaignId (camelCase).
import { randomUUID } from "crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";
import { enqueueSheetSync } from "@/lib/db/mirror";

interface TokenRef {
  campaignId: string;
  dni: string;
}

export interface SurveyResponse {
  id?: string;
  token: string;
  campaignId: string;
  dni: string;
  answers: { pregunta: string; respuesta: string }[];
  at: string;
}

// --- Token store (fallback) ---
const g = globalThis as unknown as { __tokensMem?: Map<string, TokenRef> };
const tokMem = (g.__tokensMem ??= new Map<string, TokenRef>());

// --- Response store (fallback) ---
// memoryRepo keyed by uuid id; we keep a typed reference.
const respMem = memoryRepo<SurveyResponse & { id?: string }>("respuestas");

// --- Row shape stored in Supabase (snake_case) ---
interface RespRow {
  id: string;
  token: string;
  campaign_id: string;
  dni: string;
  answers: { pregunta: string; respuesta: string }[];
  created_at: string;
}

function rowToResponse(row: RespRow): SurveyResponse {
  return {
    id: row.id,
    token: row.token,
    campaignId: row.campaign_id,
    dni: row.dni,
    answers: row.answers,
    at: row.created_at,
  };
}

// ---- Public API ----

export async function createToken(
  campaignId: string,
  dni: string,
): Promise<string> {
  const token = randomUUID();
  if (!dbConfigured()) {
    tokMem.set(token, { campaignId, dni });
    return token;
  }
  await getSupabase()
    .from("survey_tokens")
    .insert({ token, campaign_id: campaignId, dni });
  return token;
}

export async function resolveToken(
  token: string,
): Promise<TokenRef | undefined> {
  if (!dbConfigured()) return tokMem.get(token);
  const { data } = await getSupabase()
    .from("survey_tokens")
    .select("campaign_id,dni")
    .eq("token", token)
    .maybeSingle();
  if (!data) return undefined;
  return { campaignId: data.campaign_id as string, dni: data.dni as string };
}

export async function hasResponded(token: string): Promise<boolean> {
  if (!dbConfigured()) {
    const all = await respMem.list();
    return all.some((r) => r.token === token);
  }
  const { data } = await getSupabase()
    .from("respuestas")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  return Boolean(data);
}

export async function addResponse(
  token: string,
  answers: SurveyResponse["answers"],
): Promise<SurveyResponse | null> {
  const ref = await resolveToken(token);
  if (!ref) return null;
  if (await hasResponded(token)) return null; // dedupe: una respuesta por token

  if (!dbConfigured()) {
    const saved = await respMem.upsert({
      token,
      campaignId: ref.campaignId,
      dni: ref.dni,
      answers,
      at: new Date().toISOString(),
    });
    return saved;
  }

  const row: Omit<RespRow, "id"> = {
    token,
    campaign_id: ref.campaignId,
    dni: ref.dni,
    answers,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabase()
    .from("respuestas")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  const response = rowToResponse(data as RespRow);
  await enqueueSheetSync("respuestas", "upsert", data);
  return response;
}

export async function listResponses(
  campaignId?: string,
): Promise<SurveyResponse[]> {
  if (!dbConfigured()) {
    const all = await respMem.list();
    const filtered = campaignId
      ? all.filter((r) => r.campaignId === campaignId)
      : all;
    return [...filtered].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }

  let query = getSupabase()
    .from("respuestas")
    .select("*")
    .order("created_at", { ascending: false });
  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as RespRow[]).map(rowToResponse);
}
