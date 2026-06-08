import Link from "next/link";
import {
  importarCsv,
  previewGoogleSheet,
  importarConMapeo,
  crearGrupo,
  agregarContacto,
  asignarGrupoMasivo,
} from "./actions";
import { dbConfigured } from "@/lib/db/supabase";
import { padronCount, readPadronPage } from "@/lib/db/padron";
import { listGrupos } from "@/lib/grupos";
import type { Contact } from "@/lib/connectors/types";
import { getConnectorConfig } from "@/lib/connectors/config";
import { requireProject } from "@/lib/workspace";
import {
  SubmitButton,
  FormStatus,
} from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";

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

  // Tabla paginada de contactos cargados (100 por página).
  const PAGE_SIZE = 100;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const cpage = Math.min(
    totalPages,
    Math.max(1, Number(params.cpage) || 1),
  );
  const rows: Contact[] =
    persistOk && count > 0
      ? await readPadronPage(projectId, (cpage - 1) * PAGE_SIZE, PAGE_SIZE)
      : [];

  const grupos = persistOk ? await listGrupos(projectId) : [];

  // Detectar si Google Sheets está configurado para habilitar el botón.
  const gsCfg = persistOk
    ? await getConnectorConfig("google-sheets-padron")
    : ({} as Record<string, string>);
  const gsConfigured = Boolean(
    gsCfg.GOOGLE_SHEETS_SHEET_ID && gsCfg.GOOGLE_SERVICE_ACCOUNT_KEY,
  );

  const okMap: Record<string, string> = {
    csv: `CSV importado: ${params.n ?? "?"} contactos`,
    gsheet: `Google Sheet sincronizado: ${params.n ?? "?"} contactos`,
    grupo: "Grupo creado.",
    manual: "Contacto cargado.",
    bulk: `Grupo asignado a ${params.n ?? "?"} contactos.`,
  };
  const okMsg = params.ok ? okMap[params.ok] ?? null : null;
  const errMap: Record<string, string> = {
    no_db: "Supabase no configurado — no se puede persistir.",
    no_file: "Adjuntá un archivo CSV.",
    empty_csv: "El CSV no tiene filas válidas. Revisá los encabezados.",
    empty_sheet: "El Google Sheet está vacío.",
    mapping_dni_required: "Tenés que asignar una columna a 'dni' (requerida).",
    empty_after_mapping:
      "Ninguna fila tenía DNI luego del mapeo. Revisá la columna asignada.",
    gsheet: `Error sincronizando: ${params.msg ?? ""}`,
    grupo_nombre: "El nombre del grupo es obligatorio.",
    manual_dni: "El DNI / identificador es obligatorio.",
    manual_grupo: "El grupo elegido no existe.",
    bulk_grupo: "El grupo elegido no existe.",
    bulk_dnis: "Pegá al menos un DNI para asignar a algunos contactos.",
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
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Contactos"
        subtitle="Base de personas con las que trabaja la herramienta. Importá desde CSV o sincronizá con un Google Sheet."
      />

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

      {/* ── Grupos ────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          👥 Grupos de contactos
        </h2>
        <p className="text-xs text-zinc-500">
          Colecciones con nombre para organizar contactos (ej. &ldquo;Referentes
          barriales&rdquo;). Asignás un grupo al cargar contactos a mano.
        </p>
        {grupos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {grupos.map((gr) => (
              <li
                key={gr.id}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {gr.nombre}{" "}
                <span className="font-mono text-zinc-400">· {gr.count}</span>
              </li>
            ))}
          </ul>
        )}
        <form action={crearGrupo} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre del grupo"
            disabled={!persistOk}
            className={`${inputCls} w-56`}
          />
          <SubmitButton pendingLabel="Creando…" disabled={!persistOk}>
            Crear grupo
          </SubmitButton>
        </form>
        <FormStatus
          ok={params.ok === "grupo" ? okMsg : null}
          error={params.error === "grupo_nombre" ? errMap.grupo_nombre : null}
        />

        {/* Asignación masiva de grupo: a todos o a algunos (por DNI). */}
        {grupos.length > 0 && (
          <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Asignar grupo en masa
            </h3>
            <form action={asignarGrupoMasivo} className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Grupo destino
                  <select name="grupo_id" defaultValue="" disabled={!persistOk} className={inputCls}>
                    <option value="">— quitar grupo —</option>
                    {grupos.map((gr) => (
                      <option key={gr.id} value={gr.id}>{gr.nombre}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="flex flex-col gap-1 text-xs text-zinc-500">
                  <span>Alcance</span>
                  <div className="flex items-center gap-3 pt-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="modo" value="todos" defaultChecked />
                      Todos los contactos ({count.toLocaleString()})
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="modo" value="dnis" />
                      Algunos (por DNI)
                    </label>
                  </div>
                </fieldset>
              </div>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                DNIs (solo si elegís «Algunos») — separados por coma, espacio o salto de línea
                <textarea
                  name="dnis"
                  rows={2}
                  placeholder="30123456, 28987654, 41222333"
                  disabled={!persistOk}
                  className={`${inputCls} font-mono`}
                />
              </label>
              <SubmitButton pendingLabel="Asignando…" disabled={!persistOk}>
                Asignar grupo
              </SubmitButton>
              <FormStatus
                ok={params.ok === "bulk" ? okMsg : null}
                error={
                  params.error === "bulk_grupo"
                    ? errMap.bulk_grupo
                    : params.error === "bulk_dnis"
                      ? errMap.bulk_dnis
                      : null
                }
              />
            </form>
          </div>
        )}
      </section>

      {/* ── Agregar contacto a mano ───────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          ➕ Agregar contacto a mano
        </h2>
        <form action={agregarContacto} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              DNI / ID <span className="text-red-500">*</span>
              <input name="dni" required disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Nombre
              <input name="nombre" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Apellido
              <input name="apellido" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Email
              <input name="email" type="email" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Teléfono
              <input name="telefono" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Año nac.
              <input name="fecha_nac" placeholder="ej 1985" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Sexo
              <select name="sexo" defaultValue="" disabled={!persistOk} className={inputCls}>
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Barrio
              <input name="barrio" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Cuenta de X
              <input name="x_handle" placeholder="@usuario" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Afiliación política
              <input name="afiliacion" placeholder="ej. independiente / partido" disabled={!persistOk} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Grupo
              <select name="grupo_id" defaultValue="" disabled={!persistOk} className={inputCls}>
                <option value="">— sin grupo —</option>
                {grupos.map((gr) => (
                  <option key={gr.id} value={gr.id}>{gr.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <SubmitButton pendingLabel="Guardando…" disabled={!persistOk}>
            Agregar contacto
          </SubmitButton>
          <FormStatus
            ok={params.ok === "manual" ? okMsg : null}
            error={
              params.error === "manual_dni"
                ? errMap.manual_dni
                : params.error === "manual_grupo"
                  ? errMap.manual_grupo
                  : null
            }
          />
        </form>
      </section>

      {/* ── Sync con Google Sheet ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
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
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
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

      {/* ── Contactos cargados (tabla paginada) ───────────────────────── */}
      {count > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Contactos cargados
            </h2>
            <span className="font-mono text-[11px] text-zinc-400">
              {((cpage - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(cpage * PAGE_SIZE, count).toLocaleString()} de{" "}
              {count.toLocaleString()}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
                <tr>
                  {["DNI", "Apellido", "Nombre", "Sexo", "Nac.", "Barrio", "Teléfono", "Email"].map(
                    (h) => (
                      <th key={h} className="px-2.5 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((c) => (
                  <tr key={c.dni} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <td className="px-2.5 py-1.5 font-mono">
                      <Link
                        href={`/contactos/${c.dni}`}
                        className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
                      >
                        {c.dni}
                      </Link>
                    </td>
                    <td className="px-2.5 py-1.5">{c.apellido ?? ""}</td>
                    <td className="px-2.5 py-1.5">{c.nombre ?? ""}</td>
                    <td className="px-2.5 py-1.5">{c.sexo ?? ""}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{c.fecha_nac ?? ""}</td>
                    <td className="px-2.5 py-1.5">{c.barrio ?? ""}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{c.telefono ?? ""}</td>
                    <td className="px-2.5 py-1.5">{c.email ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              {cpage > 1 ? (
                <Link
                  href={`/contactos?cpage=${cpage - 1}`}
                  className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="font-mono text-xs text-zinc-500">
                Página {cpage} / {totalPages}
              </span>
              {cpage < totalPages ? (
                <Link
                  href={`/contactos?cpage=${cpage + 1}`}
                  className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Siguiente →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </section>
      )}
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
  { key: "afiliacion", label: "Afiliación política" },
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
    afiliacion: [
      "afiliacion",
      "afiliacionpolitica",
      "partido",
      "partidopolitico",
      "political",
      "politicalaffiliation",
      "espacio",
      "fuerza",
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
