// Configuración de escucha: dónde escuchar, qué buscar y qué fuentes.
// Cada tipo de fuente tiene su propio campo con instrucciones de qué pegar y,
// al lado de cada fuente cargada, sus números reales (menciones 7d, última,
// error del último pull). Al guardar corre una carga inicial en background.
import { guardarEscucha } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { MapPicker } from "@/components/escucha/map-picker";
import { MonitorHelp } from "@/components/escucha/monitor-help";
import { RadioConfig } from "@/components/escucha/radio-config";
import { RefreshOnSave } from "@/components/escucha/refresh-on-save";
import { partitionFeeds, statsKeyFor } from "@/lib/escucha-fuentes";
import type { ListeningConfig } from "@/lib/listening-config";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";
import { controlClassName } from "@/components/ui/field";

const inputCls = controlClassName;
export interface SourceStatus {
  id: string;
  label: string;
  real: boolean;
  reason: string;
  countIds?: string[];
}

interface ConfigFormProps {
  cfg: ListeningConfig;
  sources: SourceStatus[];
  persistOk: boolean;
  params: Record<string, string | undefined>;
  lastXUpdate: string | null;
  summary: PullSummary | null;
  counts: SourceCounts;
  // Reloj del server render (react-hooks/purity prohíbe Date.now() acá).
  now: number;
  // Keywords propuestas por la IA (brief del cliente) pendientes de aplicar.
  proposedKeywords?: string[];
}

function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "nunca";
  const ms = now - +new Date(iso);
  if (Number.isNaN(ms)) return "?";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </span>
        {children}
      </label>
      {hint && <p className="max-w-[70ch] text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

// Estado por fuente cargada: menciones 7d + última + error del último pull.
function SourceRows({
  urls,
  counts,
  summary,
  emptyNote,
  now,
}: {
  urls: string[];
  counts: SourceCounts;
  summary: PullSummary | null;
  emptyNote?: string;
  now: number;
}) {
  if (urls.length === 0) return null;
  const errorFor = (url: string) =>
    summary?.errors.find((e) => e.source === url)?.detail;
  return (
    <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {urls.map((url) => {
        const stat = counts.bySource[statsKeyFor(url)];
        const err = errorFor(url);
        return (
          <li
            key={url}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
              {url.replace(/^https?:\/\/(www\.)?/, "")}
            </span>
            {err ? (
              <span className="text-red-600 dark:text-red-400">
                falla: {err.slice(0, 60)}
              </span>
            ) : stat ? (
              <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                {stat.count} menciones 7d
                <span className="text-zinc-500"> · última {timeAgo(stat.last, now)}</span>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                {emptyNote ?? "sin datos aún"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Fuentes automáticas (sin URL que cargar): estado por conector.
function AutoRow({
  label,
  detail,
  stat,
  error,
  now,
}: {
  label: string;
  detail: string;
  stat?: { count: number; last: string | null };
  error?: string;
  now: number;
}) {
  const count = stat?.count ?? 0;
  const last = stat?.last ?? null;
  const err = error;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-xs">
      <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">
        {label}
        <span className="text-zinc-500"> · {detail}</span>
      </span>
      {err ? (
        <span className="text-red-600 dark:text-red-400">falla: {err.slice(0, 60)}</span>
      ) : count > 0 ? (
        <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
          {count} menciones 7d
          <span className="text-zinc-500"> · última {timeAgo(last ?? null, now)}</span>
        </span>
      ) : (
        <span className="text-zinc-500">sin menciones en 7d</span>
      )}
    </li>
  );
}

export function ConfigForm({
  cfg,
  sources,
  persistOk,
  params,
  lastXUpdate,
  summary,
  counts,
  now,
  proposedKeywords,
}: ConfigFormProps) {
  const parts = partitionFeeds(cfg.rssFeeds);
  const justSaved = params.guardado === "1";
  const pullPending =
    justSaved && (!summary?.at || now - +new Date(summary.at) > 10 * 60_000);

  return (
    <div className="space-y-6">
      <RefreshOnSave active={pullPending} />

      {/* Resumen del último pull */}
      <section
        aria-label="Última carga"
        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <span className="text-sm text-zinc-700 dark:text-zinc-200">
          Última carga:{" "}
          <span className="font-mono tabular-nums">{timeAgo(summary?.at, now)}</span>
          {summary && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">{summary.total}</span> items
              {summary.errors.length > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {" · "}
                  {summary.errors.length} fuente(s) con error
                </span>
              )}
            </>
          )}
        </span>
        <span className="text-xs text-zinc-500">
          Corre sola cada hora; también al guardar esta configuración.
        </span>
      </section>

      <MonitorHelp lastUpdate={lastXUpdate} />

      <form
        action={guardarEscucha}
        className="space-y-8 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800"
      >
        {/* 1 · Dónde y qué */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            1 · Dónde y qué escuchar
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zona">
              <input
                name="zona"
                defaultValue={cfg.zona}
                placeholder="ej: Ibicuy, Entre Ríos"
                className={inputCls}
              />
            </Field>
            <Field label="País (código de 2 letras)">
              <input
                name="pais"
                defaultValue={cfg.pais}
                maxLength={2}
                className={`${inputCls} uppercase`}
              />
            </Field>
          </div>
          <Field
            label="Keywords (una por línea)"
            hint={
              proposedKeywords ? (
                <>
                  <span className="text-amber-700 dark:text-amber-300">
                    Propuesta de IA prellenada (vigente {cfg.keywords.length} → propuesto {proposedKeywords.length}). Guardar la aplica.
                  </span>{" "}
                  La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT.
                </>
              ) : (
                "Temas a rastrear en todas las fuentes. La zona + estas keywords arman también las búsquedas automáticas de Google News y GDELT."
              )
            }
          >
            <textarea
              name="keywords"
              rows={proposedKeywords ? 8 : 3}
              defaultValue={(proposedKeywords ?? cfg.keywords).join("\n")}
              placeholder={"obras\nseguridad\nsalud"}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <MapPicker
            defaultLat={cfg.lat}
            defaultLng={cfg.lng}
            defaultRadio={cfg.radioKm}
          />
        </section>

        {/* 2 · Fuentes con carga manual */}
        <section className="space-y-5">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            2 · Fuentes
          </h2>

          <div className="space-y-2">
            <Field
              label="Medios y sitios de noticias"
              hint={
                <>
                  Una URL por línea. Sirve el <strong>feed RSS</strong>, la{" "}
                  <strong>portada del sitio a secas</strong> (si no tiene RSS se
                  deriva o se leen los títulos y descripciones de las notas) o un{" "}
                  <strong>canal de YouTube</strong> (
                  <code>youtube.com/feeds/videos.xml?channel_id=…</code>).
                </>
              }
            >
              <textarea
                name="rssFeeds"
                rows={4}
                defaultValue={parts.medios.join("\n")}
                placeholder={"https://eldiariodelapaz.com.ar\nhttps://analisisdigital.com.ar"}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <SourceRows urls={parts.medios} counts={counts} summary={summary} now={now} />
          </div>

          <div className="space-y-2">
            <Field
              label="Facebook · páginas y grupos públicos"
              hint={
                <>
                  Una URL por línea: <code>facebook.com/&lt;página&gt;</code> o{" "}
                  <code>facebook.com/groups/&lt;grupo&gt;</code>. Solo contenido{" "}
                  <strong>público</strong>; se trae 2 veces por día (no en cada
                  carga). En comunidades chicas suele ser la fuente principal.
                </>
              }
            >
              <textarea
                name="fbUrls"
                rows={3}
                defaultValue={parts.facebook.join("\n")}
                placeholder={"https://www.facebook.com/MunicipioIbicuy\nhttps://www.facebook.com/groups/vecinosibicuy"}
                className={`${inputCls} font-mono`}
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
                  Uno por línea: <code>@canal</code>, <code>canal</code> o{" "}
                  <code>t.me/canal</code>. Solo canales públicos (lo que se ve
                  sin cuenta).
                </>
              }
            >
              <textarea
                name="tgChannels"
                rows={2}
                defaultValue={parts.telegram.join("\n")}
                placeholder={"@municipioibicuy\nt.me/noticiasentrerios"}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <SourceRows urls={parts.telegram} counts={counts} summary={summary} now={now} />
          </div>

          <div className="space-y-2">
            <Field
              label="X · handles públicos"
              hint={
                <>
                  Uno por línea, con o sin <code>@</code>. Funciona con cuentas
                  públicas activas (municipio, medios, referentes). Si queda
                  vacío se usan los handles cargados en el padrón.
                </>
              }
            >
              <textarea
                name="xHandles"
                rows={3}
                defaultValue={cfg.xHandles.join("\n")}
                placeholder={"@municipioibicuy\n@mediolocal"}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <Field
              label="Radios (programas a grabar y transcribir)"
              hint="Cada programa se graba en su franja, se transcribe con IA y se filtra por tus keywords. Las menciones aparecen al terminar el programa."
            >
              <RadioConfig initial={cfg.radioStreams} />
            </Field>
          </div>
        </section>

        {/* 3 · Fuentes automáticas: no requieren carga */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            3 · Automáticas (sin carga: usan zona + keywords)
          </h2>
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <AutoRow
              label="Google News"
              detail="prensa por búsqueda de zona y keywords"
              stat={counts.bySource["news.google.com"]}
              now={now}
            />
            <AutoRow
              label="GDELT"
              detail="prensa mundial geo-codificada"
              stat={counts.byConnector["gdelt"]}
              error={summary?.bySource["gdelt"]?.error}
              now={now}
            />
            <AutoRow
              label="X"
              detail="posts de los handles monitoreados"
              stat={counts.byConnector["x-api"]}
              error={summary?.bySource["x-api"]?.error}
              now={now}
            />
            <AutoRow
              label="Radio"
              detail="menciones transcriptas"
              stat={counts.byConnector["radio"]}
              now={now}
            />
          </ul>
          <fieldset className="pt-1">
            <legend className="sr-only">Activar o desactivar conectores</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {sources.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200"
                >
                  <input
                    type="checkbox"
                    name="fuentes"
                    value={s.id}
                    defaultChecked={
                      cfg.fuentes.length === 0 || cfg.fuentes.includes(s.id)
                    }
                    className="h-3.5 w-3.5"
                  />
                  {s.label}
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {s.reason}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        {/* Guardar */}
        <div className="space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <SubmitButton
              variant="accent"
              disabled={!persistOk}
              pendingLabel="Guardando…"
            >
              Guardar y traer datos
            </SubmitButton>
            <span className="text-xs text-zinc-500">
              {persistOk
                ? "Al guardar corre una carga inicial (~1 min); los números de arriba se actualizan solos."
                : "Supabase no configurado: no se puede guardar."}
            </span>
          </div>
          <FormStatus
            ok={
              justSaved
                ? pullPending
                  ? "Configuración guardada. Carga inicial corriendo, los resultados aparecen acá en un minuto…"
                  : "Configuración guardada y carga inicial completa."
                : null
            }
            error={
              params.error === "no_db"
                ? "Supabase no configurado. Los cambios no se guardaron."
                : params.error === "validacion"
                  ? "Datos inválidos. Revisá los campos."
                  : null
            }
          />
        </div>
      </form>
    </div>
  );
}
