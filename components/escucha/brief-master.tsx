"use client";

// Brief maestro: textarea monoespaciada con contador de caracteres, importar
// un .md (se lee en el cliente con FileReader y se pega en el textarea) y
// Guardar. No importa NADA en runtime de lib/client-brief: ese módulo usa
// node:crypto y arrastrarlo al bundle del cliente rompe el build. El límite
// llega por prop desde el componente servidor.
import { useRef, useState } from "react";
import { guardarBriefMaestro } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function BriefMaster({
  initial,
  max,
  updatedAt,
  by,
}: {
  initial: string;
  max: number;
  updatedAt?: string;
  by?: string;
}) {
  const [text, setText] = useState(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const excedido = text.length > max;

  const importar = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <form action={guardarBriefMaestro} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="brief-master" className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Brief maestro
        </label>
        <span className={`font-mono text-[11px] tabular-nums ${excedido ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
          {text.length.toLocaleString("es-AR")} / {max.toLocaleString("es-AR")}
        </span>
      </div>
      <textarea
        id="brief-master"
        name="master"
        rows={16}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pegá acá el brief maestro en Markdown: mapa de actores con seguidores y vínculos, métricas ya medidas, hallazgos establecidos, errores a no repetir, reglas editoriales y vigilancia del día."
        className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 font-mono text-[12px] leading-relaxed text-zinc-900 focus-visible:border-[oklch(52%_0.13_255)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" disabled={excedido} pendingLabel="Guardando…">
          Guardar brief maestro
        </SubmitButton>
        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="sr-only"
          onChange={(e) => {
            importar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Importar .md
        </button>
        {updatedAt && (
          <span className="text-xs text-zinc-500">
            Última versión: {new Date(updatedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            {by ? ` · ${by}` : ""}
          </span>
        )}
        {excedido && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            Supera el límite: recortá {(text.length - max).toLocaleString("es-AR")} caracteres.
          </span>
        )}
      </div>
    </form>
  );
}
