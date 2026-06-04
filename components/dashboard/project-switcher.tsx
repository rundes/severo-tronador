"use client";

import Link from "next/link";
import { useState } from "react";

interface ProjectOption {
  id: string;
  nombre: string;
  role: string;
}

// Switcher de proyecto activo en el sidebar. Lista las membresías del usuario;
// elegir una postea a la server action setActiveProject (setea cookie + revalida).
export function ProjectSwitcher({
  projects,
  activeId,
  switchAction,
}: {
  projects: ProjectOption[];
  activeId: string | null;
  switchAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;

  return (
    <div className="relative px-4 pb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400">
            Proyecto
          </span>
          <span className="block truncate font-medium text-zinc-800 dark:text-zinc-100">
            {active?.nombre ?? "—"}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="absolute left-4 right-4 z-50 mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="max-h-64 overflow-y-auto py-1">
            {projects.map((p) => (
              <li key={p.id}>
                <form action={switchAction}>
                  <input type="hidden" name="project_id" value={p.id} />
                  <button
                    type="submit"
                    disabled={p.id === activeId}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${
                      p.id === activeId
                        ? "cursor-default bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="truncate">{p.nombre}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                      {p.id === activeId ? "activo" : p.role}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <Link
            href="/proyectos"
            className="block border-t border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Gestionar proyectos →
          </Link>
        </div>
      )}
    </div>
  );
}
