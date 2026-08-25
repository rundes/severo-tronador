// Tab Escenario: contexto del cliente (brief + IA + actores sugeridos) y los
// cinco bloques con Guardar propio: Territorio, Prensa, Redes, Audio y video,
// Reglas del informe.
import { BriefPanel } from "@/components/escucha/brief-panel";
import { ActorSuggestions } from "@/components/escucha/actor-suggestions";
import { BloqueTerritorio } from "@/components/escucha/bloque-territorio";
import { BloquePrensa } from "@/components/escucha/bloque-prensa";
import { BloqueRedes } from "@/components/escucha/bloque-redes";
import { BloqueAudio } from "@/components/escucha/bloque-audio";
import { BloqueReglas } from "@/components/escucha/bloque-reglas";
import type { SourceStatus } from "@/components/escucha/source-rows";
import type { ListeningConfig } from "@/lib/listening-config";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ClientBrief } from "@/lib/client-brief";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";
import type { RadioRun } from "@/lib/radio-runs";

export function EscenarioTab(props: {
  cfg: ListeningConfig;
  monitor: MonitorConfig;
  brief: ClientBrief;
  canGenerate: boolean;
  sources: SourceStatus[];
  summary: PullSummary | null;
  counts: SourceCounts;
  now: number;
  lastXUpdate: string | null;
  upcoming: Array<{ station: string; programa: string; startMs: number; endMs: number }>;
  runs: RadioRun[];
  persistOk: boolean;
  params: Record<string, string | undefined>;
}) {
  const { brief, params } = props;
  const proposal = brief.proposal;
  return (
    <div className="space-y-6">
      <BriefPanel
        brief={brief}
        canGenerate={props.canGenerate}
        flags={{
          saved: params.brief === "1",
          generated: params.ia === "1",
          iaError: params.ia_error,
          briefError: params.brief_error,
        }}
      />
      <ActorSuggestions suggestions={brief.suggestions} />
      <BloqueTerritorio cfg={props.cfg} proposal={proposal} persistOk={props.persistOk} params={params} />
      <BloquePrensa
        cfg={props.cfg}
        sources={props.sources}
        summary={props.summary}
        counts={props.counts}
        now={props.now}
        persistOk={props.persistOk}
        params={params}
      />
      <BloqueRedes
        cfg={props.cfg}
        monitor={props.monitor}
        proposal={proposal}
        sources={props.sources}
        summary={props.summary}
        counts={props.counts}
        now={props.now}
        lastXUpdate={props.lastXUpdate}
        persistOk={props.persistOk}
        params={params}
      />
      <BloqueAudio
        cfg={props.cfg}
        proposal={proposal}
        sources={props.sources}
        counts={props.counts}
        now={props.now}
        upcoming={props.upcoming}
        runs={props.runs}
        persistOk={props.persistOk}
        params={params}
      />
      <BloqueReglas monitor={props.monitor} proposal={proposal} params={params} />
    </div>
  );
}
