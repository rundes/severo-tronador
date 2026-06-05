// Respuestas de encuestas: persistencia + agregación para el dashboard.
// Supabase directo + memory fallback. Espeja a Google Sheet (pestaña
// encuesta_respuestas) vía enqueueSheetSync, igual que lib/survey.ts.
import { randomUUID } from "crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { enqueueSheetSync } from "@/lib/db/mirror";
import {
  type Answer,
  type Encuesta,
  type EncuestaResponse,
  type Question,
  type ResponseSource,
  scaleBounds,
} from "@/lib/encuestas/types";

interface RespRow {
  id: string;
  project_id: string;
  encuesta_id: string;
  source: ResponseSource;
  dni: string | null;
  token: string | null;
  answers: Answer[];
  created_at: string;
}

const g = globalThis as unknown as { __encRespuestas?: RespRow[] };
const mem = (g.__encRespuestas ??= []);

function rowToResponse(r: RespRow): EncuestaResponse {
  return {
    id: r.id,
    projectId: r.project_id,
    encuestaId: r.encuesta_id,
    source: r.source,
    dni: r.dni,
    token: r.token,
    answers: Array.isArray(r.answers) ? r.answers : [],
    at: r.created_at,
  };
}

export interface AddResponseInput {
  projectId: string;
  encuestaId: string;
  source: ResponseSource;
  dni?: string | null;
  token?: string | null;
  answers: Answer[];
}

// Devuelve la respuesta guardada, o null si fue duplicada (token ya respondió).
export async function addEncuestaResponse(
  input: AddResponseInput,
): Promise<EncuestaResponse | null> {
  const base: Omit<RespRow, "id"> = {
    project_id: input.projectId,
    encuesta_id: input.encuestaId,
    source: input.source,
    dni: input.dni ?? null,
    token: input.token ?? null,
    answers: input.answers,
    created_at: new Date().toISOString(),
  };

  if (!dbConfigured()) {
    if (base.token && mem.some((r) => r.token === base.token)) return null;
    const row: RespRow = { id: randomUUID(), ...base };
    mem.unshift(row);
    return rowToResponse(row);
  }

  const { data, error } = await getSupabase()
    .from("encuesta_respuestas")
    .insert(base)
    .select()
    .single();
  if (error) {
    // 23505 = unique_violation (token ya usado). Dedupe por destinatario.
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
  await enqueueSheetSync("encuesta_respuestas", "upsert", data);
  return rowToResponse(data as RespRow);
}

export async function hasRespondedToken(token: string): Promise<boolean> {
  if (!dbConfigured()) return mem.some((r) => r.token === token);
  const { data } = await getSupabase()
    .from("encuesta_respuestas")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  return Boolean(data);
}

export async function listEncuestaResponses(
  projectId: string,
  encuestaId: string,
): Promise<EncuestaResponse[]> {
  if (!dbConfigured()) {
    return mem
      .filter((r) => r.project_id === projectId && r.encuesta_id === encuestaId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(rowToResponse);
  }
  const { data, error } = await getSupabase()
    .from("encuesta_respuestas")
    .select("*")
    .eq("project_id", projectId)
    .eq("encuesta_id", encuestaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as RespRow[]).map(rowToResponse);
}

// ---- Agregación para el dashboard ----

export interface ChoiceAgg {
  questionId: string;
  label: string;
  type: "single" | "multi" | "boolean";
  counts: { option: string; n: number; pct: number }[];
  total: number;
}
export interface ScaleAgg {
  questionId: string;
  label: string;
  type: "scale";
  min: number;
  max: number;
  average: number;
  distribution: { value: number; n: number }[];
  total: number;
}
export interface TextAgg {
  questionId: string;
  label: string;
  type: "text" | "paragraph";
  values: string[];
  total: number;
}
export type QuestionAgg = ChoiceAgg | ScaleAgg | TextAgg;

function answerFor(
  resp: EncuestaResponse,
  qid: string,
): Answer | undefined {
  return resp.answers.find((a) => a.questionId === qid);
}

export function aggregate(
  encuesta: Encuesta,
  responses: EncuestaResponse[],
): QuestionAgg[] {
  return encuesta.preguntas.map((q) => aggregateQuestion(q, responses));
}

function aggregateQuestion(
  q: Question,
  responses: EncuestaResponse[],
): QuestionAgg {
  if (q.type === "text" || q.type === "paragraph") {
    const values = responses
      .map((r) => answerFor(r, q.id)?.value)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "");
    return { questionId: q.id, label: q.label, type: q.type, values, total: values.length };
  }

  if (q.type === "scale") {
    const { min, max } = scaleBounds(q);
    const nums = responses
      .map((r) => answerFor(r, q.id)?.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const total = nums.length;
    const average = total ? nums.reduce((s, n) => s + n, 0) / total : 0;
    const distribution: { value: number; n: number }[] = [];
    for (let v = min; v <= max; v++) {
      distribution.push({ value: v, n: nums.filter((n) => n === v).length });
    }
    return { questionId: q.id, label: q.label, type: "scale", min, max, average, distribution, total };
  }

  // single | multi | boolean → conteo por opción. Opciones trimeadas para
  // matchear los valores guardados (que parseAnswers trimea).
  const options =
    q.type === "boolean" ? ["Sí", "No"] : (q.options ?? []).map((o) => o.trim());
  const tally = new Map<string, number>(options.map((o) => [o, 0]));
  let total = 0;
  for (const r of responses) {
    const v = answerFor(r, q.id)?.value;
    if (v === undefined || v === null) continue;
    const picked =
      q.type === "boolean"
        ? [v === true || v === "Sí" || v === "true" ? "Sí" : "No"]
        : Array.isArray(v)
          ? v.map((x) => String(x).trim())
          : [String(v).trim()];
    let counted = false;
    for (const p of picked) {
      if (tally.has(p)) {
        tally.set(p, (tally.get(p) ?? 0) + 1);
        counted = true;
      }
    }
    if (counted) total++;
  }
  const counts = [...tally.entries()].map(([option, n]) => ({
    option,
    n,
    pct: total ? Math.round((n / total) * 100) : 0,
  }));
  return {
    questionId: q.id,
    label: q.label,
    type: q.type as "single" | "multi" | "boolean",
    counts,
    total,
  };
}

export function _clearEncRespuestasMem() {
  mem.length = 0;
}
