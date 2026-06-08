import Link from "next/link";
import { ORG_NAME } from "@/lib/config";

// Shell público para páginas legales (privacidad, términos, eliminación de
// datos). Tema claro, legible, sin sidebar ni auth. Las URLs se entregan a
// Meta / Google para revisión de la app.
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[oklch(98.5%_0.006_95)] px-4 py-10 text-[oklch(28%_0.02_265)] sm:py-14">
      <main className="mx-auto w-full max-w-3xl">
        <header className="mb-8 border-b border-[oklch(90%_0.01_95)] pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[oklch(52%_0.13_255)]">
            {ORG_NAME}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[oklch(22%_0.03_265)]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[oklch(55%_0.02_265)]">
            Última actualización: {updated}
          </p>
        </header>

        <article className="space-y-5 text-[15px] leading-relaxed [&_a]:text-[oklch(48%_0.13_255)] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[oklch(26%_0.02_265)] [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </article>

        <footer className="mt-10 flex flex-wrap gap-4 border-t border-[oklch(90%_0.01_95)] pt-5 text-sm text-[oklch(55%_0.02_265)]">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/eliminacion-datos">Eliminación de datos</Link>
        </footer>
      </main>
    </div>
  );
}

// Email de contacto para temas de datos (dominio verificado).
export const CONTACT_EMAIL = "relevamiento@tronador.net.ar";
