"use client";

// Genera el token de la extensión de Chrome y lo muestra UNA vez para copiar.
// Regenerarlo invalida el anterior (solo owner).

import { useState, useTransition } from "react";
import { generarTokenExtension } from "@/app/(dashboard)/escucha/actions";

export function ExtensionTokenButton() {
  const [token, setToken] = useState<string | null>(null);
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
              const r = await generarTokenExtension();
              setToken(r.token);
            } catch {
              setError("No se pudo generar (¿sos owner del proyecto?)");
            }
          })
        }
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {pending ? "Generando…" : token ? "Regenerar token" : "Generar token de extensión"}
      </button>
      {token && (
        <div className="space-y-1">
          <code className="block break-all rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {token}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Copialo ahora: no se vuelve a mostrar. Pegalo en las opciones de la
            extensión junto con la URL de la app.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
