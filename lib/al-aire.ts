// Estado "Al aire" para Monitorear: qué se está grabando ahora, qué sigue en
// la agenda y el último run terminado (con menciones si ya se transcribió).
import type { RadioRun } from "@/lib/radio-runs";

type Occ = { station: string; programa: string; startMs: number; endMs: number };

export interface AlAire {
  grabando: (Occ & { hastaMs: number }) | null;
  proximo: (Occ & { enMin: number }) | null;
  ultimo: { station: string; programa: string; status: string; mentions: number; atMs: number } | null;
}

// nowMs con default (no en el llamador): igual que agendaUpcoming, evita que
// eslint (react-hooks/purity) marque Date.now() como impuro dentro del
// render de un server component.
export function alAireState(upcoming: Occ[], runs: RadioRun[], nowMs = Date.now()): AlAire | null {
  const grabandoOcc = upcoming.find((o) => o.startMs <= nowMs && o.endMs > nowMs) ?? null;
  const proximoOcc = upcoming.filter((o) => o.startMs > nowMs).sort((a, b) => a.startMs - b.startMs)[0] ?? null;
  // scheduledStart puede venir null (fila vieja): caemos a startedAt.
  const runAt = (r: RadioRun) => +new Date(r.scheduledStart ?? r.startedAt);
  const done = runs
    .filter((r) => r.status !== "recording")
    .sort((a, b) => runAt(b) - runAt(a))[0];
  const out: AlAire = {
    grabando: grabandoOcc ? { ...grabandoOcc, hastaMs: grabandoOcc.endMs } : null,
    proximo: proximoOcc ? { ...proximoOcc, enMin: Math.round((proximoOcc.startMs - nowMs) / 60_000) } : null,
    ultimo: done ? { station: done.station, programa: done.programa, status: done.status, mentions: done.mentions ?? 0, atMs: runAt(done) } : null,
  };
  return out.grabando || out.proximo || out.ultimo ? out : null;
}
