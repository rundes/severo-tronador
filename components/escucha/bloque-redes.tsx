// Bloque Redes: Facebook / Telegram / X (feeds sociales), toggle del conector
// X, y el plan de colecta (cuentas + búsquedas A/B) que baja el plugin. Con
// propuesta de IA sin aplicar en `redes`, cuentas y búsquedas se prellenan.
import { guardarRedes } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { MonitorHelp } from "@/components/escucha/monitor-help";
import { Field, SourceRows, AutoRow, type SourceStatus } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import { partitionFeeds } from "@/lib/escucha-fuentes";
import { accLine, diffLabel } from "@/lib/escenario-diff";
import type { ListeningConfig } from "@/lib/listening-config";
import type { MonitorConfig } from "@/lib/monitor-config";
import type { ScenarioProposal } from "@/lib/client-brief";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";

const REDES_IDS = ["x-api"];
const monoCls = `${inputCls} font-mono`;

export function BloqueRedes({
  cfg,
  monitor,
  proposal,
  sources,
  summary,
  counts,
  now,
  lastXUpdate,
  persistOk,
  params,
}: {
  cfg: ListeningConfig;
  monitor: MonitorConfig;
  proposal?: ScenarioProposal;
  sources: SourceStatus[];
  summary: PullSummary | null;
  counts: SourceCounts;
  now: number;
  lastXUpdate?: string | null;
  persistOk: boolean;
  params: Record<string, string | undefined>;
}) {
  const parts = partitionFeeds(cfg.rssFeeds);
  const toggles = sources.filter((s) => REDES_IDS.includes(s.id));
  // Solo se prellena si la propuesta no se aplicó todavía en este bloque.
  const p = proposal && !proposal.applied.redes ? proposal : undefined;
  const accounts = { cur: monitor.accounts.map(accLine), pro: p?.accounts.map(accLine) };
  const sA = { cur: monitor.searchesA, pro: p?.searchesA };
  const sB = { cur: monitor.searchesB, pro: p?.searchesB };
  const val = (x: { cur: string[]; pro?: string[] }) => (x.pro ?? x.cur).join("\n");

  return (
    <Bloque
      id="redes"
      titulo="Redes"
      resumen={`${parts.facebook.length} FB · ${cfg.xHandles.length} X · ${monitor.accounts.length} cuentas del plan`}
      pendiente={Boolean(p)}
      params={params}
    >
      <form key={p?.at ?? "vigente"} action={guardarRedes} className="space-y-5">
        <div className="space-y-2">
          <Field
            label="Facebook · páginas y grupos públicos"
            hint={
              <>
                Una URL por línea: <code>facebook.com/&lt;página&gt;</code> o{" "}
                <code>facebook.com/groups/&lt;grupo&gt;</code>. Solo contenido{" "}
                <strong>público</strong>; se trae 2 veces por día (no en cada carga). En
                comunidades chicas suele ser la fuente principal.
              </>
            }
          >
            <textarea
              name="fbUrls"
              rows={3}
              defaultValue={parts.facebook.join("\n")}
              placeholder={"https://www.facebook.com/MunicipioIbicuy\nhttps://www.facebook.com/groups/vecinosibicuy"}
              className={monoCls}
            />
          </Field>
          <SourceRows
            urls={parts.facebook}
            counts={counts}
            summary={summary}
            emptyNote="sin datos aún · corre 2×/día"
            now={now}
          />
        </div>

        <div className="space-y-2">
          <Field
            label="Telegram · canales públicos"
            hint={
              <>
                Uno por línea: <code>@canal</code>, <code>canal</code> o <code>t.me/canal</code>.
                Solo canales públicos (lo que se ve sin cuenta).
              </>
            }
          >
            <textarea
              name="tgChannels"
              rows={2}
              defaultValue={parts.telegram.join("\n")}
              placeholder={"@municipioibicuy\nt.me/noticiasentrerios"}
              className={monoCls}
            />
          </Field>
          <SourceRows urls={parts.telegram} counts={counts} summary={summary} now={now} />
        </div>

        <div className="space-y-2">
          <Field
            label="X · handles públicos"
            hint={
              <>
                Uno por línea, con o sin <code>@</code>. Funciona con cuentas públicas activas
                (municipio, medios, referentes). Si queda vacío se usan los handles cargados en el
                padrón.
              </>
            }
          >
            <textarea
              name="xHandles"
              rows={3}
              defaultValue={cfg.xHandles.join("\n")}
              placeholder={"@municipioibicuy\n@mediolocal"}
              className={monoCls}
            />
          </Field>
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <AutoRow
              label="X"
              detail="posts de los handles monitoreados"
              stat={counts.byConnector["x-api"]}
              error={summary?.bySource["x-api"]?.error}
              now={now}
            />
          </ul>
          {toggles.length > 0 && (
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <legend className="sr-only">Conectores de redes</legend>
              {toggles.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    name="fuentesRedes"
                    value={s.id}
                    defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes(s.id)}
                    className="h-3.5 w-3.5"
                  />
                  {s.label}
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.reason}</span>
                </label>
              ))}
            </fieldset>
          )}
          {lastXUpdate !== undefined && <MonitorHelp lastUpdate={lastXUpdate} />}
        </div>

        <div className="space-y-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <Field
            label="Cuentas a monitorear (una por línea)"
            diff={diffLabel(accounts.cur, accounts.pro)}
            hint={
              <>
                Formato: <code>handle, plataforma, categoría[, vínculo]</code>. Plataforma:
                instagram/x/facebook/tiktok. Categoría: organizacion/medio/individual/institucional/opera.
                El plugin baja estas cuentas como plan de colecta.
              </>
            }
          >
            <textarea
              name="accounts"
              rows={6}
              defaultValue={val(accounts)}
              placeholder={"listaverde, instagram, organizacion\ndiariodelclub, x, medio, lista azul\nmuni, facebook, institucional"}
              className={monoCls}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Búsquedas dirección A" diff={diffLabel(sA.cur, sA.pro)} hint="Términos de un lado del conflicto.">
              <textarea name="searchesA" rows={3} defaultValue={val(sA)} className={monoCls} />
            </Field>
            <Field
              label="Búsquedas dirección B"
              diff={diffLabel(sB.cur, sB.pro)}
              hint="Términos simétricos del otro lado (spec §7.5)."
            >
              <textarea name="searchesB" rows={3} defaultValue={val(sB)} className={monoCls} />
            </Field>
          </div>
        </div>

        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">
          Guardar redes
        </SubmitButton>
      </form>
    </Bloque>
  );
}
