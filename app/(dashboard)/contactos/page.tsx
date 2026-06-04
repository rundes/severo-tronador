import Link from "next/link";
import { importarCsv, previewGoogleSheet, importarConMapeo } from "./actions";
import { dbConfigured } from "@/lib/db/supabase";
import { padronCount } from "@/lib/db/padron";
import { getConnectorConfig } from "@/lib/connectors/config";
import { requireProject } from "@/lib/workspace";
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
  const { id: projectId } = await requireProject();
  const persistOk = dbConfigured();
  const count = persistOk ? await padronCount(projectId) : 0;

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
    mapping_dni_required: "Tenés que asignar una columna a 'dni' (requerida).",
    empty_after_mapping:
      "Ninguna fila tenía DNI luego del mapeo. Revisá la columna asignada.",
    gsheet: `Error sincronizando: ${params.msg ?? ""}`,
  };
  const errMsg = params.error ? errMap[params.error] ?? params.error : null;

  // Decodificar preview si está presente.
  interface PreviewShape {
    headers: string[];
    sampleRows: string[][];
    totalRows: number;
  }
  let preview: PreviewShape | null = null;
  if (params.preview) {
    try {
      const padded =
        params.preview.length % 4 === 0
          ? params.preview
          : params.preview + "=".repeat(4 - (params.preview.length % 4));
      preview = JSON.parse(
        Buffer.from(padded, "base64").toString("utf8"),
      ) as PreviewShape;
    } catch {
      preview = null;
    }
  }

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
          email, x_handle</code>.
        </p>
        {preview ? (
          <ColumnMapper preview={preview} />
        ) : (
          <form action={previewGoogleSheet} className="space-y-2">
            <SubmitButton
              pendingLabel="Leyendo Sheet…"
              disabled={!persistOk || !gsConfigured}
            >
              {gsConfigured
                ? "Leer Sheet (preview de columnas)"
                : "Configurar conector primero"}
            </SubmitButton>
            <FormStatus
              ok={params.ok === "gsheet" ? okMsg : null}
              error={
                params.error === "gsheet" ||
                params.error === "mapping_dni_required" ||
                params.error === "empty_after_mapping" ||
                params.error === "empty_sheet"
                  ? errMsg
                  : null
              }
            />
          </form>
        )}
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
            circuito, mesa, telefono, email, x_handle
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

const CONTACT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "dni", label: "DNI / Identificador único", required: true },
  { key: "nombre", label: "Nombre" },
  { key: "apellido", label: "Apellido" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Teléfono" },
  { key: "fecha_nac", label: "Fecha de nacimiento" },
  { key: "sexo", label: "Sexo" },
  { key: "domicilio", label: "Domicilio" },
  { key: "barrio", label: "Barrio" },
  { key: "circuito", label: "Circuito electoral" },
  { key: "mesa", label: "Mesa electoral" },
  { key: "x_handle", label: "Cuenta de X (Twitter)" },
];

function bestGuess(field: string, headers: string[]): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const target = normalize(field);
  const aliases: Record<string, string[]> = {
    dni: ["dni", "documento", "documentonumero", "identificador", "id"],
    nombre: ["nombre", "firstname", "first", "given", "name"],
    apellido: ["apellido", "lastname", "last", "family", "surname"],
    email: ["email", "correo", "mail", "correoelectronico"],
    telefono: ["telefono", "phone", "tel", "celular", "movil", "mobile"],
    fecha_nac: ["fechanac", "nacimiento", "birth", "fechanacimiento"],
    domicilio: ["domicilio", "direccion", "address", "calle"],
    circuito: ["circuito"],
    mesa: ["mesa"],
    sexo: ["sexo", "genero", "gender", "sex"],
    barrio: ["barrio", "neighborhood", "zona"],
    x_handle: [
      "xhandle",
      "twitter",
      "twitterhandle",
      "twitteruser",
      "twitterusername",
      "usuariox",
      "usuariotwitter",
      "handlex",
      "arroba",
    ],
  };
  const aliasList = (aliases[field] ?? [target]).map(normalize);
  for (const h of headers) {
    const n = normalize(h);
    for (const a of aliasList) if (n === a) return h;
  }
  for (const h of headers) {
    const n = normalize(h);
    for (const a of aliasList) if (n.includes(a)) return h;
  }
  return "";
}

function ColumnMapper({
  preview,
}: {
  preview: { headers: string[]; sampleRows: string[][]; totalRows: number };
}) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Mapeo de columnas
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          {preview.totalRows.toLocaleString()} filas en el Sheet
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
            <tr>
              {preview.headers.map((h, i) => (
                <th key={i} className="border-r border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
                  {h || `(col ${i + 1})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.sampleRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                {preview.headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="truncate border-r border-zinc-100 px-2 py-1 dark:border-zinc-800"
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Vista previa de las primeras {preview.sampleRows.length} filas.
        Asigná a continuación qué columna corresponde a cada campo de
        Contacto. <strong>DNI es obligatorio</strong>; los demás son
        opcionales.
      </p>

      <form action={importarConMapeo} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONTACT_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800"
            >
              <span className="text-zinc-700 dark:text-zinc-200">
                {f.label}
                {f.required && (
                  <span className="ml-1 text-red-600">*</span>
                )}
              </span>
              <select
                name={`map_${f.key}`}
                defaultValue={bestGuess(f.key, preview.headers)}
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">— ignorar —</option>
                {preview.headers.map((h, i) => (
                  <option key={i} value={h}>
                    {h || `(col ${i + 1})`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton pendingLabel="Importando…">
            Importar {preview.totalRows.toLocaleString()} contactos
          </SubmitButton>
          <Link
            href="/contactos"
            className="text-xs text-zinc-500 underline-offset-4 hover:underline"
          >
            ← Reiniciar mapeo
          </Link>
        </div>
      </form>
    </div>
  );
}
