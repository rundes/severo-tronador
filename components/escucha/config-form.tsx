// Formulario de configuración de escucha extraído de escucha/page.tsx.
// Mismo markup, misma acción guardarEscucha, mismo bloque Estado + fuentes.
import { guardarEscucha } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { MapPicker } from "@/components/escucha/map-picker";
import { MonitorHelp } from "@/components/escucha/monitor-help";
import { RadioConfig } from "@/components/escucha/radio-config";
import type { ListeningConfig } from "@/lib/listening-config";

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

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
  bySource: Record<string, number>;
  params: Record<string, string | undefined>;
  lastXUpdate: string | null;
}

function countFor(s: SourceStatus, bySource: Record<string, number>): number {
  const ids = s.countIds ?? [s.id];
  return ids.reduce((sum, id) => sum + (bySource[id] ?? 0), 0);
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

export function ConfigForm({
  cfg,
  sources,
  persistOk,
  bySource,
  params,
  lastXUpdate,
}: ConfigFormProps) {
  const realCount = sources.filter((s) => s.real).length;

  return (
    <div className="space-y-6">
      {/* Bloque de estado */}
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

      {/* MonitorHelp — guía operativa del worker X */}
      <MonitorHelp lastUpdate={lastXUpdate} />

      {/* Formulario */}
      <form
        action={guardarEscucha}
        className="space-y-4 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800"
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

        <Field label="Handles públicos de X a monitorear (uno por línea)">
          <textarea
            name="xHandles"
            rows={3}
            defaultValue={cfg.xHandles.join("\n")}
            placeholder={"@intendenteMaipu\n@diariolocal\n@concejalX"}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <p className="text-xs text-zinc-500">
          La fuente X (gratis, por sindicación) trae los últimos posts de estos
          handles. Funciona con <strong>cuentas públicas activas</strong>
          (intendente, medios, concejales); las cuentas chicas de vecinos no
          devuelven datos por esta vía. Si lo dejás vacío, usa los handles del
          padrón.
        </p>

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

        <Field label="Radios (programas a grabar y transcribir)">
          <RadioConfig initial={cfg.radioStreams} />
        </Field>
        <p className="text-xs text-zinc-500">
          Cada programa se graba en su franja, se transcribe con IA (Gemini) y se
          filtra por tus keywords. La ingesta corre por GitHub Actions; las
          menciones aparecen poco después de que termina el programa.
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
    </div>
  );
}
