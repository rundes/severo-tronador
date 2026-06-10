// Encuestas tokenizadas (F6). Cada envío lleva un token único que abre la
// landing pública /encuesta/[token]. El token resuelve a {campaña, dni,
// proyecto} sin exponer datos personales en la URL. Dedupe: una respuesta por
// token. El proyecto se DERIVA del token (los paths públicos no tienen cookie).
//
// Persistencia:
// - survey_tokens: Supabase directo (PK = token) con fallback globalThis Map.
//   Lleva project_id para scopear la respuesta.
// - respuestas: Supabase directo (snake_case) + enqueueSheetSync mirror, con
//   fallback memoryRepo("respuestas").
import { randomUUID } from "crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";
import { enqueueSheetSync } from "@/lib/db/mirror";

interface TokenRef {
  campaignId: string;
  dni: string;
  projectId: string;
  // Si el token distribuye una encuesta del módulo nuevo, su id. Convive con
  // el flujo legacy de preguntas-en-campaña (encuestaId undefined).
  encuestaId?: string;
}

export interface SurveyResponse {
  id?: string;
  token: string;
  campaignId: string;
  dni: string;
  answers: { pregunta: string; respuesta: string }[];
  at: string;
}

const g = globalThis as unknown as { __tokensMem?: Map<string, TokenRef> };
const tokMem = (g.__tokensMem ??= new Map<string, TokenRef>());

const respMem = memoryRepo<SurveyResponse & { id?: string; project_id?: string }>(
  "respuestas",
);

interface RespRow {
  id: string;
  token: string;
  project_id: string;
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
  projectId: string,
  campaignId: string,
  dni: string,
  encuestaId?: string,
): Promise<string> {
  const token = randomUUID();
  if (!dbConfigured()) {
    tokMem.set(token, { campaignId, dni, projectId, encuestaId });
    return token;
  }
  await getSupabase()
    .from("survey_tokens")
    .insert({
      token,
      project_id: projectId,
      campaign_id: campaignId,
      dni,
      encuesta_id: encuestaId ?? null,
    });
  return token;
}

export async function resolveToken(
  token: string,
): Promise<TokenRef | undefined> {
  if (!dbConfigured()) return tokMem.get(token);
  const { data } = await getSupabase()
    .from("survey_tokens")
    .select("campaign_id,dni,project_id,encuesta_id")
    .eq("token", token)
    .maybeSingle();
  if (!data) return undefined;
  return {
    campaignId: data.campaign_id as string,
    dni: data.dni as string,
    projectId: data.project_id as string,
    encuestaId: (data.encuesta_id as string | null) ?? undefined,
  };
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
      project_id: ref.projectId,
      campaignId: ref.campaignId,
      dni: ref.dni,
      answers,
      at: new Date().toISOString(),
    });
    return saved;
  }

  const row: Omit<RespRow, "id"> = {
    token,
    project_id: ref.projectId,
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
  if (error) {
    // 23505 = unique_violation (respuestas_token_unique). Race entre POSTs.
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
  const response = rowToResponse(data as RespRow);
  await enqueueSheetSync("respuestas", "upsert", data);
  return response;
}

export async function listResponses(
  projectId: string,
  campaignId?: string,
): Promise<SurveyResponse[]> {
  if (!dbConfigured()) {
    const all = (await respMem.list()) as (SurveyResponse & {
      project_id?: string;
    })[];
    const filtered = all.filter(
      (r) =>
        r.project_id === projectId &&
        (!campaignId || r.campaignId === campaignId),
    );
    return [...filtered].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }

  let query = getSupabase()
    .from("respuestas")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const legacy = (data as RespRow[]).map(rowToResponse);

  // Respuestas del módulo nuevo de encuestas: guardan en `encuesta_respuestas`
  // por token (no por campaign_id). Para atribuirlas a una campaña, mapeamos sus
  // tokens vía `survey_tokens`. Sin esto las campañas "Encuesta:" mostraban 0.
  const enc = await listEncuestaResponsesForCampaign(projectId, campaignId);
  return [...legacy, ...enc].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

interface EncuestaRespRow {
  token: string | null;
  dni: string | null;
  answers: { label?: string; value?: unknown }[] | null;
  created_at: string;
}

// Lee encuesta_respuestas atribuibles a una campaña (o todas las del proyecto
// con token si no se pasa campaignId) y las mapea al shape SurveyResponse.
async function listEncuestaResponsesForCampaign(
  projectId: string,
  campaignId?: string,
): Promise<SurveyResponse[]> {
  const db = getSupabase();

  let tokenFilter: string[] | undefined;
  if (campaignId) {
    const { data: toks } = await db
      .from("survey_tokens")
      .select("token")
      .eq("campaign_id", campaignId);
    tokenFilter = (toks ?? []).map((t) => (t as { token: string }).token);
    if (tokenFilter.length === 0) return [];
  }

  let q = db
    .from("encuesta_respuestas")
    .select("token, dni, answers, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (tokenFilter) q = q.in("token", tokenFilter);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as EncuestaRespRow[])
    .filter((r) => r.token)
    .map((r) => ({
    token: r.token ?? "",
    campaignId: campaignId ?? "",
    dni: r.dni ?? "",
    answers: (r.answers ?? []).map((a) => ({
      pregunta: String(a.label ?? ""),
      respuesta: Array.isArray(a.value) ? a.value.join(", ") : String(a.value ?? ""),
    })),
    at: r.created_at,
  }));
}
