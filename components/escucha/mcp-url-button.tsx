"use client";

// Genera la URL del conector MCP y la muestra UNA vez para copiar (contiene el
// token). Regenerarla invalida la anterior — mismo patrón que
// ExtensionTokenButton. Solo owner.
//
// Este archivo es "use client": exporta SOLO el componente, nada más, porque lo
// consume un server component.

import { useState, useTransition } from "react";
import { generarUrlMcp } from "@/app/(dashboard)/escucha/actions";

export function McpUrlButton() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const r = await generarUrlMcp();
              setUrl(r.url);
            } catch {
              setError("No se pudo generar (¿sos owner del proyecto?)");
            }
          })
        }
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {pending ? "Generando…" : url ? "Regenerar URL del conector" : "Generar URL del conector"}
      </button>
      {url && (
        <div className="space-y-1">
          <code className="block break-all rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {url}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Copiala ahora: no se vuelve a mostrar. Lleva el token adentro, así
            que es una credencial: no la pegues en un chat compartido.
            Regenerarla invalida la anterior.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
