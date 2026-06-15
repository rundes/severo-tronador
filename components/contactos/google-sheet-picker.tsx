"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTACT_FIELDS, bestGuess } from "@/lib/contactos/mapping";
import {
  previewGoogleSheetPicked,
  importarConMapeoPicked,
} from "@/app/(dashboard)/contactos/actions";

// Importa contactos desde un Google Sheet ELEGIDO por el usuario con el Google
// Picker (busca/navega su Drive). El access token (scope drive.file) se pide al
// tocar el botón, se usa para abrir el Picker y para que el server lea el Sheet,
// y queda solo en memoria (no se persiste ni se loguea). Flujo en pantalla:
// elegir → preview + mapeo de columnas → importar.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;

type Preview = { headers: string[]; sampleRows: string[][]; totalRows: number };
type Picked = { id: string; name: string };
type Phase = "idle" | "loading" | "preview" | "importing" | "done";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`load ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`load ${src}`));
    document.head.appendChild(s);
  });
}

export function GoogleSheetPicker({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importedN, setImportedN] = useState(0);
  const tokenRef = useRef<string>("");
  const tokenClientRef = useRef<any>(null);

  const configured = Boolean(CLIENT_ID && API_KEY);

  async function getToken(): Promise<string> {
    await loadScript(GIS_SRC);
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: () => {},
      });
    }
    return new Promise((resolve, reject) => {
      const client = tokenClientRef.current;
      client.callback = (resp: any) => {
        if (resp?.error) return reject(new Error(resp.error));
        resolve(resp.access_token as string);
      };
      // prompt vacío: silencioso si ya consintió este archivo/scope.
      client.requestAccessToken({ prompt: tokenRef.current ? "" : "consent" });
    });
  }

  function openPicker(token: string): Promise<Picked | null> {
    return new Promise((resolve, reject) => {
      window.gapi.load("picker", {
        callback: () => {
          try {
            const google = window.google;
            const view = new google.picker.DocsView(
              google.picker.ViewId.SPREADSHEETS,
            )
              .setIncludeFolders(true)
              .setSelectFolderEnabled(false);
            const pickerObj = new google.picker.PickerBuilder()
              .addView(view)
              .setOAuthToken(token)
              .setDeveloperKey(API_KEY)
              .setCallback((data: any) => {
                const action = data[google.picker.Response.ACTION];
                if (action === google.picker.Action.PICKED) {
                  const doc = data[google.picker.Response.DOCUMENTS][0];
                  resolve({
                    id: doc[google.picker.Document.ID],
                    name: doc[google.picker.Document.NAME],
                  });
                } else if (action === google.picker.Action.CANCEL) {
                  resolve(null);
                }
              })
              .build();
            pickerObj.setVisible(true);
          } catch (e) {
            reject(e as Error);
          }
        },
      });
    });
  }

  async function handleChoose() {
    setError(null);
    setPhase("loading");
    try {
      await loadScript(GAPI_SRC);
      const token = await getToken();
      tokenRef.current = token;
      const choice = await openPicker(token);
      if (!choice) {
        setPhase("idle");
        return;
      }
      setPicked(choice);
      const res = await previewGoogleSheetPicked(choice.id, token);
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      setPreview(res.preview);
      setPhase("preview");
    } catch (e) {
      setError((e as Error).message || "No se pudo abrir el selector de Drive.");
      setPhase("idle");
    }
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked || !preview) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const mapping: Record<string, string> = {};
    for (const f of CONTACT_FIELDS) {
      const v = String(fd.get(`map_${f.key}`) ?? "").trim();
      if (v) mapping[f.key] = v;
    }
    if (!mapping.dni) {
      setError("Tenés que mapear la columna de DNI.");
      return;
    }
    setPhase("importing");
    try {
      // Token fresco por si el de la preview expiró (silencioso si ya consintió).
      const token = await getToken();
      tokenRef.current = token;
      const res = await importarConMapeoPicked({
        spreadsheetId: picked.id,
        accessToken: token,
        mapping,
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("preview");
        return;
      }
      setImportedN(res.n);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo importar.");
      setPhase("preview");
    }
  }

  function reset() {
    setPhase("idle");
    setPicked(null);
    setPreview(null);
    setError(null);
  }

  if (!configured) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400">
        Para elegir un Sheet de Drive, configurá{" "}
        <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> y{" "}
        <code>NEXT_PUBLIC_GOOGLE_PICKER_API_KEY</code> (Picker API + Drive API
        habilitadas en Google Cloud).
      </p>
    );
  }

  if (phase === "done") {
    return (
      <div className="space-y-2">
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400">
          {importedN.toLocaleString()} contactos importados desde{" "}
          <strong>{picked?.name}</strong>.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Importar otro Sheet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(phase === "idle" || phase === "loading") && (
        <button
          type="button"
          onClick={handleChoose}
          disabled={disabled || phase === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {phase === "loading" ? "Abriendo Drive…" : "Elegir de Google Drive"}
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {(phase === "preview" || phase === "importing") && picked && preview && (
        <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {picked.name}
            </h3>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {preview.totalRows.toLocaleString()} filas
            </span>
          </div>

          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th
                      key={i}
                      className="border-r border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                    >
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
            Asigná qué columna corresponde a cada campo.{" "}
            <strong>DNI es obligatorio</strong>; el resto, opcional.
          </p>

          <form onSubmit={handleImport} className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CONTACT_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-800"
                >
                  <span className="text-zinc-700 dark:text-zinc-200">
                    {f.label}
                    {f.required && <span className="ml-1 text-red-600">*</span>}
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
              <button
                type="submit"
                disabled={phase === "importing"}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
              >
                {phase === "importing"
                  ? "Importando…"
                  : `Importar ${preview.totalRows.toLocaleString()} contactos`}
              </button>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-zinc-500 underline-offset-4 hover:underline"
              >
                ← Elegir otro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
