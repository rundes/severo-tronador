// Bloque Prensa: medios RSS/portadas/YouTube + fuentes automáticas (Google
// News, GDELT) + toggles de los conectores de prensa.
import { guardarPrensa } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Bloque } from "@/components/escucha/bloque";
import { Field, SourceRows, AutoRow, type SourceStatus } from "@/components/escucha/source-rows";
import { controlClassName as inputCls } from "@/components/ui/field";
import type { ListeningConfig } from "@/lib/listening-config";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";
import { partitionFeeds } from "@/lib/escucha-fuentes";

const PRENSA_IDS = ["gdelt", "rss-medios", "meta-content-library"];

export function BloquePrensa({
  cfg,
  sources,
  summary,
  counts,
  now,
  persistOk,
  params,
}: {
  cfg: ListeningConfig;
  sources: SourceStatus[];
  summary: PullSummary | null;
  counts: SourceCounts;
  now: number;
  persistOk: boolean;
  params: Record<string, string | undefined>;
}) {
  const parts = partitionFeeds(cfg.rssFeeds);
  const toggles = sources.filter((s) => PRENSA_IDS.includes(s.id));
  const gdeltOn = cfg.fuentes.length === 0 || cfg.fuentes.includes("gdelt");
  return (
    <Bloque
      id="prensa"
      titulo="Prensa"
      resumen={`${parts.medios.length} medios · GDELT ${gdeltOn ? "activo" : "apagado"}`}
      params={params}
    >
      <form action={guardarPrensa} className="space-y-5">
        <div className="space-y-2">
          <Field
            label="Medios y sitios de noticias"
            hint={
              <>
                Una URL por línea. Sirve el <strong>feed RSS</strong>, la{" "}
                <strong>portada del sitio</strong> o un <strong>canal de YouTube</strong> (
                <code>youtube.com/feeds/videos.xml?channel_id=…</code>).
              </>
            }
          >
            <textarea
              name="rssFeeds"
              rows={4}
              defaultValue={parts.medios.join("\n")}
              placeholder={"https://analisisdigital.com.ar\nhttps://lacalle.com.ar"}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <SourceRows urls={parts.medios} counts={counts} summary={summary} now={now} />
        </div>
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <AutoRow
            label="Google News"
            detail="prensa por búsqueda de zona y keywords"
            stat={counts.bySource["news.google.com"]}
            now={now}
          />
          <AutoRow
            label="GDELT"
            detail="prensa mundial geo-codificada (worker cada 3 h)"
            stat={counts.byConnector["gdelt"]}
            error={summary?.bySource["gdelt"]?.error}
            now={now}
          />
        </ul>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <legend className="sr-only">Conectores de prensa</legend>
          {toggles.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                name="fuentesPrensa"
                value={s.id}
                defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes(s.id)}
                className="h-3.5 w-3.5"
              />
              {s.label}
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{s.reason}</span>
            </label>
          ))}
        </fieldset>
        <SubmitButton variant="accent" disabled={!persistOk} pendingLabel="Guardando…">
          Guardar prensa
        </SubmitButton>
      </form>
    </Bloque>
  );
}
