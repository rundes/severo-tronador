"use client";

// Error boundary del segmento /(dashboard). Captura throws server-side de
// loadContacts / readPadronFromDb / queries a Supabase cuando la DB cae
// (#5 STABILIZATION). Sin esto, una falla rompe el render entero.
//
// Sugerencias UX:
// - Mensaje claro de qué pasó (no leakear stack).
// - Botón "reintentar" que rellama el server component (reset()).
// - Link a /conectores por si la causa es config rota.
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-xl font-semibold text-red-700 dark:text-red-400">
        Algo no salió bien
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        No pudimos cargar esta página. Suele pasar cuando la base de datos
        (Supabase) está caída, o cuando un conector no está configurado.
      </p>
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 font-mono text-xs text-red-700 dark:bg-red-950/30">
        {error.message}
        {error.digest && (
          <span className="ml-2 text-red-500">[ref: {error.digest}]</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Reintentar
        </button>
        <Link
          href="/conectores"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          Revisar conectores
        </Link>
      </div>
    </div>
  );
}
