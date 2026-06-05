import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import { dbConfigured } from "@/lib/db/supabase";
import { requireProject } from "@/lib/workspace";
import { guardarEscucha } from "./actions";
import { TagCloud } from "@/components/escucha/tag-cloud";
import { AuthorRankingList } from "@/components/escucha/author-ranking";
import { Feed } from "@/components/escucha/feed";
import { MapPicker } from "@/components/escucha/map-picker";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";

// Revalida cada 60s para el "tiempo real" sin sobrecargar las APIs externas.
export const revalidate = 60;

export const metadata = { title: "Escucha · Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

// Cada fuente declara si está corriendo real o mock. Se evalúa con env vars
// porque getConnectorConfig agregaría DB y queremos status para mostrar
// ANTES de tocar Supabase.
interface SourceStatus {
  id: string;
  label: string;
  real: boolean;
  reason: string;
  // Algunos conectores agregan varias sub-fuentes en items (ej. Meta CL
  // emite meta-ig y meta-fb). countIds suma el total mostrado.
  countIds?: string[];
}

function sourceStatuses(rssCount = 0): SourceStatus[] {
  const xToken = Boolean(process.env.X_API_BEARER_TOKEN);
  const reddit = Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
  const metaCl = Boolean(process.env.META_CL_TOKEN);
  return [
    { id: "gdelt", label: "GDELT", real: true, reason: "sin auth" },
    {
      id: "rss-medios",
      label: "RSS medios",
      real: rssCount > 0,
      reason: rssCount > 0 ? `${rssCount} feed(s)` : "agregá feeds abajo",
    },
    {
      id: "x-api",
      label: "X",
      real: true,
      reason: xToken ? "API paga" : "sindicación (gratis, timelines de handles)",
    },
    {
      id: "reddit-api",
      label: "Reddit",
      real: reddit,
      reason: reddit ? "creds presentes" : "OAuth pendiente",
    },
    {
      id: "meta-content-library",
      label: "Meta CL (FB + IG)",
      real: metaCl,
      reason: metaCl ? "token research presente" : "aprobación pendiente",
      countIds: ["meta-fb", "meta-ig"],
    },
  ];
}

function countFor(s: SourceStatus, bySource: Record<string, number>): number {
  const ids = s.countIds ?? [s.id];
  return ids.reduce((sum, id) => sum + (bySource[id] ?? 0), 0);
}

export default async function EscuchaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const [result, cfg] = await Promise.all([
    runListening(projectId),
    getListeningConfig(projectId),
  ]);
  const {
    totalItems,
    bySource,
    bySentiment,
    topics,
    positiveTags,
    negativeTags,
    topPositive,
    topNegative,
    feed,
  } = result;
  const emerging = topics.filter((t) => t.emerging);
  const persistOk = dbConfigured();
  const sources = sourceStatuses(cfg.rssFeeds.length);
  const realCount = sources.filter((s) => s.real).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Escucha
        </h1>
        <p className="text-sm text-zinc-500">
          Qué se dice de {TERRITORY} en prensa y redes. Descubrí temas{" "}
          <em>antes</em> de diseñar una encuesta.
        </p>
      </header>

      {/* Bloque de estado — la fineprint vieja, ahora visible y accionable. */}
      <section
        aria-labelledby="estado-titulo"
        className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <div className="flex items-center justify-between">
          <h2
            id="estado-titulo"
            className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
          >
            Estado
          </h2>
          <span className="font-mono text-[11px] text-zinc-400">
            {realCount}/{sources.length} fuentes reales · persistencia{" "}
            {persistOk ? "ok" : "off"}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {sources.map((s) => (
            <div key={s.id} className="contents">
              <dt className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <span
                  aria-hidden
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    s.real
                      ? "bg-emerald-500"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                />
                {s.label}
              </dt>
              <dd className="flex items-center justify-between gap-2 text-xs">
                <span
                  className={
                    s.real
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-zinc-500"
                  }
                >
                  {s.real ? "real" : "sin conectar"} · {s.reason}
                </span>
                <span className="font-mono text-zinc-400">
                  {countFor(s, bySource)} menciones
                </span>
              </dd>
            </div>
          ))}
          <div className="contents">
            <dt className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  persistOk ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              Supabase
            </dt>
            <dd className="text-xs text-zinc-500">
              {persistOk ? (
                "configurado · guardar persiste y la escucha usa tu config"
              ) : (
                <>
                  no configurado · guardar no funciona y la escucha corre con
                  defaults
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>


      <form
        action={guardarEscucha}
        className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Configurar escucha
          </h2>
          {!persistOk && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              solo preview
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zona">
              <input
                name="zona"
                defaultValue={cfg.zona}
                placeholder="ej: La Plata"
                className={inputCls}
              />
            </Field>
            <Field label="País">
              <input
                name="pais"
                defaultValue={cfg.pais}
                maxLength={2}
                className={`${inputCls} uppercase`}
              />
            </Field>
          </div>
          <MapPicker
            defaultLat={cfg.lat}
            defaultLng={cfg.lng}
            defaultRadio={cfg.radioKm}
          />
          <p className="text-xs text-zinc-500">
            Click en el mapa o usá el buscador para fijar lat/lng. X API
            usa esas coordenadas con el radio como filtro{" "}
            <code>point_radius</code>; GDELT usa <code>sourcecountry</code>;
            Reddit ignora geo.
          </p>
        </div>

        <Field label="Keywords (una por línea)">
          <textarea
            name="keywords"
            rows={3}
            defaultValue={cfg.keywords.join("\n")}
            placeholder={"transporte\nseguridad\nsalud"}
            className={`${inputCls} font-mono`}
          />
        </Field>

        <Field label="Feeds RSS de medios locales (una URL por línea)">
          <textarea
            name="rssFeeds"
            rows={4}
            defaultValue={cfg.rssFeeds.join("\n")}
            placeholder={"https://medio-local.com/feed\nhttps://otro-diario.com.ar/rss"}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <p className="text-xs text-zinc-500">
          Fuente gratuita sin API key. Pegá las URLs de RSS/Atom de diarios y
          portales locales; la escucha trae sus últimas notas y las filtra por
          tus keywords. (Buscá &quot;RSS&quot; en el sitio del medio.)
        </p>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Fuentes
          </legend>
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
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    s.real
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-400"
                  }`}
                >
                  {s.real ? "real" : "sin conectar"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <SubmitButton
              disabled={!persistOk}
              pendingLabel="Guardando…"
            >
              {persistOk ? "Guardar escucha" : "Guardar (deshabilitado)"}
            </SubmitButton>
            {!persistOk && (
              <span className="text-xs text-zinc-400">
                SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en env
              </span>
            )}
          </div>
          <FormStatus
            ok={params.guardado === "1" ? "Configuración guardada. La próxima escucha usa estos parámetros." : null}
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

      {/* Resumen totales + sentiment. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat
          label="Menciones totales"
          value={totalItems}
          accent="zinc"
        />
        <Stat
          label="Positivas"
          value={bySentiment.positive}
          accent="emerald"
        />
        <Stat
          label="Negativas"
          value={bySentiment.negative}
          accent="red"
        />
        <Stat
          label="Neutras"
          value={bySentiment.neutral}
          accent="zinc"
        />
      </section>

      {emerging.length > 0 && (
        <div className="space-y-2">
          {emerging.map((t) => {
            const sourceBreakdown = Object.entries(t.bySource ?? {})
              .filter(([, v]) => v.recent > 0)
              .sort(([, a], [, b]) => b.recent - a.recent);
            return (
              <div
                key={t.label}
                className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      Tema emergente: <strong>{t.label}</strong>
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      {t.recent} esta semana vs {t.prior} la previa.
                    </div>
                  </div>
                  <Link
                    href={`/campanas/nueva?tema=${encodeURIComponent(t.label)}`}
                    className="shrink-0 rounded bg-amber-900 px-3 py-1.5 text-sm text-amber-50 hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
                  >
                    Diseñar encuesta →
                  </Link>
                </div>
                {sourceBreakdown.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    {sourceBreakdown.map(([src, v]) => (
                      <span
                        key={src}
                        className="rounded bg-amber-100 px-1.5 py-0.5 font-mono uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        title={`${v.recent} recent · ${v.prior} prior`}
                      >
                        {src} · {v.recent}
                        {v.prior > 0 && (
                          <span className="opacity-60"> / {v.prior}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tag clouds pos/neg. */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel
          title="Tags positivos"
          accent="emerald"
          right={`${bySentiment.positive}`}
        >
          <TagCloud tags={positiveTags} tone="positive" />
        </Panel>
        <Panel
          title="Tags negativos"
          accent="red"
          right={`${bySentiment.negative}`}
        >
          <TagCloud tags={negativeTags} tone="negative" />
        </Panel>
      </section>

      {/* Rankings de autores. */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Conversan en positivo" accent="emerald">
          <AuthorRankingList authors={topPositive} tone="positive" />
        </Panel>
        <Panel title="Conversan en negativo" accent="red">
          <AuthorRankingList authors={topNegative} tone="negative" />
        </Panel>
      </section>

      {/* Feed scroll. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Feed · últimas 50
          </h3>
          <span className="font-mono text-[10px] text-zinc-400">
            actualiza cada 60s
          </span>
        </div>
        <Feed items={feed} />
      </section>

      {/* Topics (existing). */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Temas detectados (semana vs baseline)
        </h3>
        <ul className="space-y-2">
          {topics.map((t) => (
            <li
              key={t.label}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {t.label}
                  {t.emerging && <span className="ml-2 text-amber-600">↑</span>}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {t.recent}{" "}
                  <span className="text-zinc-300 dark:text-zinc-600">/</span>{" "}
                  {t.prior}
                </span>
              </div>
              {t.examples.slice(0, 2).map((ex, i) => (
                <p key={i} className="mt-1 text-xs text-zinc-500">
                  {ex}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>

      {!persistOk && bySource && Object.keys(bySource).length > 0 && (
        <p className="text-xs text-amber-600">
          Corrida con defaults: no se aplicó tu config (sin Supabase). Las
          fuentes reales (GDELT/X) sí trajeron lo que pudieron.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "red" | "zinc";
}) {
  const colors =
    accent === "emerald"
      ? "border-emerald-200 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-400"
      : accent === "red"
        ? "border-red-200 text-red-700 dark:border-red-900/40 dark:text-red-400"
        : "border-zinc-200 text-zinc-800 dark:border-zinc-800 dark:text-zinc-100";
  return (
    <div className={`rounded-lg border p-3 ${colors}`}>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function Panel({
  title,
  right,
  accent,
  children,
}: {
  title: string;
  right?: string;
  accent: "emerald" | "red";
  children: React.ReactNode;
}) {
  const dot =
    accent === "emerald" ? "bg-emerald-500" : "bg-red-500";
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            {title}
          </h3>
        </div>
        {right && (
          <span className="font-mono text-[11px] text-zinc-400">{right}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
      {label}
      {children}
    </label>
  );
}

