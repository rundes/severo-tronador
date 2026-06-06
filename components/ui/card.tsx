import * as React from "react";

// Contenedor de contenido del sistema: superficie sutilmente elevada, borde
// 1px, esquinas 8px. Reemplaza el patrón repetido `rounded-lg border ...`.
export function Card({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 bg-white p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
