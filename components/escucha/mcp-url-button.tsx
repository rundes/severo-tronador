"use client";

// Genera la URL del conector MCP y la muestra UNA vez para copiar (contiene el
// token). Regenerarla invalida la anterior — mismo patrón que
// ExtensionTokenButton. Solo owner.
//
// Dos variantes: "proyecto" (conector clásico, atado a este proyecto) y
// "cuenta" (multiproyecto: un solo conector que llega a todos los proyectos
// del email del operador; este proyecto queda como default de lectura).
//
// Este archivo es "use client": exporta SOLO componentes, nada más, porque lo
// consume un server component.

import { useState, useTransition } from "react";
import { generarUrlMcp, generarUrlMcpCuenta } from "@/app/(dashboard)/escucha/actions";

function UrlButton({
  generar,
  labelGenerar,
  labelRegenerar,
  aviso,
}: {
  generar: () => Promise<{ url: string }>;
  labelGenerar: string;
  labelRegenerar: string;
  aviso: string;
}) {
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
              const r = await generar();
              setUrl(r.url);
            } catch {
              setError("No se pudo generar (¿sos owner del proyecto?)");
            }
          })
        }
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {pending ? "Generando…" : url ? labelRegenerar : labelGenerar}
      </button>
      {url && (
        <div className="space-y-1">
          <code className="block break-all rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {url}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-400">{aviso}</p>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function McpUrlButton() {
  return (
    <UrlButton
      generar={generarUrlMcp}
      labelGenerar="Generar URL del conector"
      labelRegenerar="Regenerar URL del conector"
      aviso="Copiala ahora: no se vuelve a mostrar. Lleva el token adentro, así que es una credencial: no la pegues en un chat compartido. Regenerarla invalida la anterior."
    />
  );
}

export function McpAccountUrlButton() {
  return (
    <UrlButton
      generar={generarUrlMcpCuenta}
      labelGenerar="Generar URL multiproyecto"
      labelRegenerar="Regenerar URL multiproyecto"
      aviso="Copiala ahora: no se vuelve a mostrar. Este conector llega a TODOS tus proyectos (lectura con project opcional, escritura siempre con project explícito). Es una credencial: regenerarla invalida la anterior; no afecta los conectores por proyecto."
    />
  );
}
