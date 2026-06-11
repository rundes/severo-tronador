// Registro de grabaciones de radio (tabla radio_runs): dedup (no re-grabar el
// mismo programa el mismo día) + datos para la agenda visual. Server-only.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { nextOccurrences, type RadioProgram } from "@/lib/radio";

const AR_OFFSET_MIN = -180;

// Próximas ocurrencias para la agenda. En función no-componente (usa Date.now)
// para no chocar con la regla de pureza de React en server components.
export function agendaUpcoming(
  programs: RadioProgram[],
  horizonDays = 4,
): Array<{ station: string; programa: string; startMs: number; endMs: number }> {
  return nextOccurrences(programs, Date.now(), horizonDays, AR_OFFSET_MIN);
}

export interface RadioRun {
  id: string;
  station: string;
  programa: string;
  scheduledDate: string;
  scheduledStart: string | null;
  startedAt: string;
  status: string;
  audioObject: string | null;
  durationSec: number | null;
  mentions: number;
}

interface RunRow {
  id: string;
  station: string;
  programa: string;
  scheduled_date: string;
  scheduled_start: string | null;
  started_at: string;
  status: string;
  audio_object: string | null;
  duration_sec: number | null;
  mentions: number;
}

function toRun(r: RunRow): RadioRun {
  return {
    id: r.id,
    station: r.station,
    programa: r.programa,
    scheduledDate: r.scheduled_date,
    scheduledStart: r.scheduled_start,
    startedAt: r.started_at,
    status: r.status,
    audioObject: r.audio_object,
    durationSec: r.duration_sec,
    mentions: r.mentions,
  };
}

// Crea el run del programa-día si no existe (dedup por la unique). Devuelve el
// id + si lo creó (true) o ya existía (false → no re-grabar).
export async function createRunIfAbsent(input: {
  projectId: string;
  station: string;
  programa: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledStart: string; // ISO
}): Promise<{ id: string; created: boolean } | null> {
  if (!dbConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("radio_runs")
    .insert({
      project_id: input.projectId,
      station: input.station,
      programa: input.programa,
      scheduled_date: input.scheduledDate,
      scheduled_start: input.scheduledStart,
      status: "recording",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // 23505 = unique_violation → ya existe (otro tick lo creó).
    if (error.code === "23505") return null;
    throw error;
  }
  return data ? { id: data.id as string, created: true } : null;
}

export async function markRunDone(
  runId: string,
  patch: { audioObject?: string; durationSec?: number; mentions?: number; status?: string },
): Promise<void> {
  if (!dbConfigured() || !runId) return;
  await getSupabase()
    .from("radio_runs")
    .update({
      status: patch.status ?? "done",
      ...(patch.audioObject !== undefined ? { audio_object: patch.audioObject } : {}),
      ...(patch.durationSec !== undefined ? { duration_sec: patch.durationSec } : {}),
      ...(patch.mentions !== undefined ? { mentions: patch.mentions } : {}),
    })
    .eq("id", runId);
}

export async function listRecentRuns(projectId: string, limit = 30): Promise<RadioRun[]> {
  if (!dbConfigured()) return [];
  const { data } = await getSupabase()
    .from("radio_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("scheduled_start", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []).map((r) => toRun(r as RunRow));
}
