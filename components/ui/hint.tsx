"use client";

import { useSyncExternalStore } from "react";

// Sugerencia "cómo seguir" descartable. Se cierra con ✕ y recuerda la decisión
// en localStorage por `id` (no vuelve a aparecer). useSyncExternalStore para
// leer el store externo sin setState-en-effect; un set de listeners fuerza el
// re-render al cerrar.
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

export function Hint({
  id,
  title,
  children,
  cta,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  const key = `hint.dismiss.${id}`;
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
    () => false,
  );
  if (dismissed) return null;

  function close() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // sin localStorage: ocultamos solo en esta vista
    }
    notify();
  }

  return (
    <aside className="relative flex gap-3 rounded-xl border border-[oklch(90%_0.03_255)] bg-[oklch(97.5%_0.02_255)] p-4 pr-9 dark:border-[oklch(40%_0.05_255)] dark:bg-[oklch(28%_0.04_255)]">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(52%_0.13_255)] dark:text-[oklch(78%_0.1_255)]" fill="none" aria-hidden>
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2A6 6 0 0 0 12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-[oklch(30%_0.04_255)] dark:text-[oklch(90%_0.03_255)]">{title}</p>
        <div className="mt-1 leading-relaxed text-[oklch(45%_0.03_255)] dark:text-[oklch(80%_0.03_255)]">
          {children}
        </div>
        {cta && (
          <a
            href={cta.href}
            className="mt-2 inline-block font-medium text-[oklch(52%_0.13_255)] underline-offset-4 hover:underline dark:text-[oklch(80%_0.1_255)]"
          >
            {cta.label} →
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar sugerencia"
        className="absolute right-2 top-2 rounded p-1 text-[oklch(60%_0.03_255)] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}
