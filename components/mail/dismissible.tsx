"use client";

import { useSyncExternalStore } from "react";

// Banner descartable: se oculta al cerrarlo y recuerda la decisión en
// localStorage (por `id`). Para avisos informativos que el usuario ya leyó.
// Usa useSyncExternalStore para leer el store externo (localStorage) sin
// setState-en-effect; un set de listeners fuerza el re-render al cerrar.
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

export function Dismissible({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const key = `mail.dismiss.${id}`;

  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false, // server snapshot: siempre visible en SSR
  );

  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // localStorage no disponible: no podemos persistir, no hacemos nada.
    }
    notify();
  }

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="absolute right-2 top-2 rounded p-1 text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        ✕
      </button>
    </div>
  );
}
