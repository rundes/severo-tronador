import { importarCsv, sincronizarGoogleSheet } from "./actions";
import { dbConfigured } from "@/lib/db/supabase";
import { padronCount } from "@/lib/db/padron";
import { getConnectorConfig } from "@/lib/connectors/config";
import {
  SubmitButton,
  FormStatus,
} from "@/components/ui/submit-button";

export const metadata = { title: "Contactos · Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function ContactosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const persistOk = dbConfigured();
  const count = persistOk ? await padronCount() : 0;

  // Detectar si Google Sheets está configurado para habilitar el botón.
  const gsCfg = persistOk
    ? await getConnectorConfig("google-sheets-padron")
    : ({} as Record<string, string>);
  const gsConfigured = Boolean(
    gsCfg.GOOGLE_SHEETS_SHEET_ID && gsCfg.GOOGLE_SERVICE_ACCOUNT_KEY,
  );

  const okMsg =
    params.ok === "csv"
      ? `CSV importado: ${params.n ?? "?"} contactos`
      : params.ok === "gsheet"
        ? `Google Sheet sincronizado: ${params.n ?? "?"} contactos`
        : null;
  const errMap: Record<string, string> = {
    no_db: "Supabase no configurado — no se puede persistir.",
    no_file: "Adjuntá un archivo CSV.",
    empty_csv: "El CSV no tiene filas válidas. Revisá los encabezados.",
    empty_sheet: "El Google Sheet está vacío.",
    gsheet: `Error sincronizando: ${params.msg ?? ""}`,
  };
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Contactos
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Base de personas con las que trabaja la herramienta. Importá desde
          CSV o sincronizá con un Google Sheet.
        </p>
      </header>

      {!persistOk && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Supabase no configurado — operando con padrón mock de dev (100
          contactos). Cargá las env vars para persistir.
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {count.toLocaleString()}
          </span>
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            contactos cargados
          </span>
        </div>
      </div>

      {/* ── Sync con Google Sheet ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            🔄 Sincronizar con Google Sheet
          </h2>
          <span
            className={`font-mono text-[10px] uppercase tracking-wider ${
              gsConfigured ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {gsConfigured ? "conector listo" : "configurar conector"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500">
          Lee el Sheet configurado en{" "}
          <a
            href="/conectores"
            className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            Google Sheets · Padrón
          </a>{" "}
          (ID + service account) y hace upsert por DNI en la tabla de
          contactos. La hoja debe llamarse <code>padron</code> con
          encabezados en la primera fila: <code>dni, nombre, apellido,
          fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono,
          email</code>.
        </p>
        <form action={sincronizarGoogleSheet} className="space-y-2">
          <SubmitButton
            pendingLabel="Sincronizando…"
            disabled={!persistOk || !gsConfigured}
          >
            {gsConfigured
              ? "Sincronizar ahora"
              : "Configurar conector primero"}
          </SubmitButton>
          <FormStatus
            ok={params.ok === "gsheet" ? okMsg : null}
            error={params.error === "gsheet" ? errMsg : null}
          />
        </form>
      </section>

      {/* ── Importar CSV ──────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          ⬆️ Importar desde CSV
        </h2>
        <p className="text-xs leading-relaxed text-zinc-500">
          Encabezados esperados:{" "}
          <code className="break-all">
            dni, nombre, apellido, fecha_nac, sexo, domicilio, barrio,
            circuito, mesa, telefono, email
          </code>
          . Las columnas extra se ignoran.
        </p>
        <form action={importarCsv} className="space-y-2">
          <input
            type="file"
            name="csv"
            accept=".csv"
            required
            className={`${inputCls} block w-full`}
          />
          <SubmitButton pendingLabel="Importando…" disabled={!persistOk}>
            Importar CSV
          </SubmitButton>
          <FormStatus
            ok={params.ok === "csv" ? okMsg : null}
            error={
              params.error && params.error !== "gsheet"
                ? errMap[params.error] ?? null
                : null
            }
          />
        </form>
      </section>
    </div>
  );
}
