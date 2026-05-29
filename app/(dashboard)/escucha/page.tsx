import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import { dbConfigured } from "@/lib/db/supabase";
import { guardarEscucha } from "./actions";

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
}

function sourceStatuses(): SourceStatus[] {
  const xToken = Boolean(process.env.X_API_BEARER_TOKEN);
  const reddit = Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
  return [
    { id: "gdelt", label: "GDELT", real: true, reason: "sin auth" },
    {
      id: "x-api",
      label: "X",
      real: xToken,
      reason: xToken ? "token presente" : "sin token",
    },
    {
      id: "reddit-api",
      label: "Reddit",
      real: reddit,
      reason: reddit ? "creds presentes" : "OAuth pendiente",
    },
  ];
}

export default async function EscuchaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const [{ totalItems, bySource, topics }, cfg] = await Promise.all([
    runListening(),
    getListeningConfig(),
  ]);
  const emerging = topics.filter((t) => t.emerging);
  const persistOk = dbConfigured();
  const sources = sourceStatuses();
  const realCount = sources.filter((s) => s.real).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
            {realCount}/3 fuentes reales · persistencia{" "}
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
                  {s.real ? "real" : "mock"} · {s.reason}
                </span>
                <span className="font-mono text-zinc-400">
                  {bySource[s.id] ?? 0} menciones
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

      {/* Banners de acción del form. */}
      {params.error === "no_db" && (
        <Banner tone="amber">
          No se pudo guardar: Supabase no está configurado. Editá los campos
          igual para ver cómo correría la consulta, pero los cambios no
          persisten.
        </Banner>
      )}
      {params.error === "validacion" && (
        <Banner tone="red">
          Datos inválidos. Revisá los campos.
        </Banner>
      )}
      {params.guardado === "1" && (
        <Banner tone="emerald">
          Configuración guardada. La próxima escucha usa estos parámetros.
        </Banner>
      )}

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <Field label="Radio (km)">
            <input
              name="radioKm"
              type="number"
              min={0}
              max={5000}
              defaultValue={cfg.radioKm ?? ""}
              placeholder="opcional"
              className={inputCls}
            />
          </Field>
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
                  {s.real ? "real" : "mock"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between pt-1">
          <button
            type="submit"
            disabled={!persistOk}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              persistOk
                ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            }`}
            title={
              persistOk
                ? "Guardar configuración"
                : "Necesitás Supabase configurado para persistir"
            }
          >
            {persistOk ? "Guardar escucha" : "Guardar (deshabilitado)"}
          </button>
          {!persistOk && (
            <span className="text-xs text-zinc-400">
              SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en env
            </span>
          )}
        </div>
      </form>

      {/* Resultado de la corrida actual. */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {totalItems}
          </span>
          <span className="text-sm text-zinc-500">
            menciones esta semana
            {!persistOk && (
              <span className="ml-2 text-amber-600">
                (corrida con defaults — no se aplicó tu config)
              </span>
            )}
          </span>
        </div>

        {emerging.length > 0 && (
          <div className="space-y-2">
            {emerging.map((t) => (
              <div
                key={t.label}
                className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30"
              >
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
            ))}
          </div>
        )}

        <div>
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
                    {t.emerging && (
                      <span className="ml-2 text-amber-600">↑</span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {t.recent}{" "}
                    <span className="text-zinc-300 dark:text-zinc-600">/</span>{" "}
                    {t.prior}
                  </span>
                </div>
                {t.examples.slice(0, 2).map((ex, i) => (
                  <p
                    key={i}
                    className="mt-1 text-xs text-zinc-500"
                    style={{
                      borderLeft: undefined, // explicit ban: no side-stripes
                    }}
                  >
                    {ex}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </section>
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

function Banner({
  tone,
  children,
}: {
  tone: "amber" | "red" | "emerald";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
      : tone === "red"
        ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200"
        : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200";
  return (
    <div className={`rounded-lg border p-3 text-sm ${toneCls}`}>{children}</div>
  );
}
