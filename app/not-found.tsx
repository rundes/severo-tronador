import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

// 404 propio. Sin esto, un link roto o un id inexistente caía en la pantalla
// genérica de Next: sin marca, sin explicación y —lo que importa— sin vuelta al
// panel. `notFound()` de las páginas de detalle (campaña, contacto, mensaje)
// aterriza acá.
export const metadata = { title: "No encontrado · Severo Tronador" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-3 px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
        Error 404
      </p>
      <h1 className="text-xl font-semibold tracking-tight">
        Esta página no existe
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        El link puede estar roto, o el registro que buscabas se borró. Si venías
        de un link compartido, puede haber vencido.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href="/dashboard" className={buttonClass("primary")}>
          Ir al panel
        </Link>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
