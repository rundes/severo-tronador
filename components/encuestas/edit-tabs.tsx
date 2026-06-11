"use client";

import { useState } from "react";

// Tabs client que muestran/ocultan paneles ya renderizados (server) sin
// recargar → preserva el estado del editor al cambiar de pestaña.
// initialTab: permite al servidor pre-seleccionar una pestaña (ej. estadísticas
// para encuestas publicadas).
export function EditTabs({
  items,
  initialTab,
}: {
  items: { id: string; label: string; content: React.ReactNode }[];
  initialTab?: string;
}) {
  const [active, setActive] = useState(initialTab ?? items[0]?.id);
  return (
    <div>
      <nav
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active === it.id}
            onClick={() => setActive(it.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === it.id
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {it.label}
          </button>
        ))}
      </nav>
      {items.map((it) => (
        <div key={it.id} hidden={active !== it.id} className="pt-5">
          {it.content}
        </div>
      ))}
    </div>
  );
}
