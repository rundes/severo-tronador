// Bloque Audio y video: programas de radio / YouTube / Kick a grabar y
// transcribir, toggle del conector, menciones transcriptas y agenda.
import { guardarAudio } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { RadioConfig } from "@/components/escucha/radio-config";
import { RadioAgenda } from "@/components/escucha/radio-agenda";
import { AutoRow, type SourceStatus } from "@/components/escucha/source-rows";
import type { ListeningConfig } from "@/lib/listening-config";
import type { ScenarioProposal } from "@/lib/client-brief";
import type { RadioRun } from "@/lib/radio-runs";
import type { SourceCounts } from "@/lib/listening-cache";
import { hasValidSlot } from "@/lib/audio-programs";

export function BloqueAudio({
  cfg,
  proposal,
  sources,
  counts,
  now,
  upcoming,
  runs,
  persistOk,
  params,
}: {
  cfg: ListeningConfig;
  proposal?: ScenarioProposal;
  sources: SourceStatus[];
  counts: SourceCounts;
  now: number;
  upcoming: Array<{ station: string; programa: string; startMs: number; endMs: number }>;
  runs: RadioRun[];
  persistOk: boolean;
  params: Record<string, string | undefined>;
}) {
  const p = proposal && !proposal.applied.audio && proposal.audio.length > 0 ? proposal : undefined;
  const sinFranja = cfg.radioStreams.filter((x) => !hasValidSlot(x)).length;
  // Hoy no hay toggle "radio" en sourceStatuses; si aparece, se renderiza.
  const radioToggle = sources.find((s) => s.id === "radio");
  return (
    <Bloque
      id="audio"
      titulo="Audio y video"
      resumen={`${cfg.radioStreams.length} programas${sinFranja ? ` · ${sinFranja} sin franja` : ""}`}
      pendiente={Boolean(p)}
      params={params}
    >
      <p className="max-w-[70ch] text-xs text-zinc-500">
        Radio, YouTube y Kick con el mismo modelo: cada programa se graba en su franja, se
        transcribe con IA y se filtra por tus keywords. Un programa sin franja se guarda pero no se
        graba.
      </p>
      <form key={p?.at ?? "vigente"} action={guardarAudio} className="space-y-5">
        <RadioConfig initial={cfg.radioStreams} proposed={p?.audio} />
        {radioToggle && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              name="fuentesAudio"
              value="radio"
              defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes("radio")}
              className="h-3.5 w-3.5"
            />
            Grabar y transcribir{" "}
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{radioToggle.reason}</span>
          </label>
        )}
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AutoRow label="Menciones transcriptas" detail="radio + streaming" stat={counts.byConnector["radio"]} now={now} />
        </ul>
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">
          Guardar audio y video
        </SubmitButton>
      </form>
      <RadioAgenda upcoming={upcoming} runs={runs} />
    </Bloque>
  );
}
