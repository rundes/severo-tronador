import * as React from "react";

// Estado vacío del sistema.
//
// El patrón anterior era un `<p className="text-sm text-zinc-500">No hay
// nada</p>` distinto en cada módulo: no distingue "todavía no cargaste datos"
// de "el filtro no matcheó nada" —que piden acciones opuestas— y nunca ofrece
// la salida. Un vacío es un momento de decisión, no un aviso.
export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: {
  title: string;
  description?: string;
  // La salida concreta: "Importar padrón", "Limpiar filtros".
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700 ${className}`}
    >
      {icon && (
        <div aria-hidden className="text-2xl text-zinc-400 dark:text-zinc-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
