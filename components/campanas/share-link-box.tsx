"use client";

import { useState } from "react";

// Caja con el link generado + botón copiar. Solo client porque necesita
// navigator.clipboard.
export function ShareLinkBox({ url, exp }: { url: string; exp: number }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const expDate = new Date(exp);

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
        Link público generado
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-xs text-zinc-800 dark:border-emerald-900/50 dark:bg-zinc-900 dark:text-zinc-200"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
        >
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      <div className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
        Expira el{" "}
        <strong className="font-mono">
          {expDate.toLocaleString("es-AR")}
        </strong>
        . Cualquiera con el link ve el reporte read-only sin login.
      </div>
    </div>
  );
}
