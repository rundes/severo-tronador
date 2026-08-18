"use client";

import * as React from "react";

// Modal del sistema.
//
// Los modales de la app eran un `fixed inset-0` con un panel adentro: sin
// `role="dialog"`, sin `aria-modal`, sin título asociado, sin trampa de foco, y
// sin cerrar con Escape. Para un lector de pantalla eso no es un diálogo — es
// contenido más abajo en la página, y el resto del documento sigue siendo
// navegable con Tab por detrás del overlay.
//
// Acá:
//   - `role="dialog" aria-modal="true"` + `aria-labelledby` al título.
//   - El foco entra al panel al abrir y VUELVE al elemento que lo abrió al
//     cerrar (sin eso, el foco cae al principio del documento).
//   - Tab y Shift+Tab circulan dentro del panel.
//   - Escape cierra. Click en el overlay también, pero no en el panel.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  // El diálogo de confirmación es angosto; un editor necesita ancho.
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Quién tenía el foco antes de abrir, para devolverlo al cerrar.
  const openerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    // Foco al panel, no al primer control: leer el título antes de operar.
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        // Sin nada enfocable adentro, el foco se queda en el panel en vez de
        // saltar al documento de atrás.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-lg";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // El overlay cierra; el panel para la propagación. Sin onKeyDown acá: el
      // listener del documento cubre el caso en que el foco se escape.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative z-10 w-full ${width} rounded-lg border border-zinc-200 bg-white p-5 shadow-[var(--shadow-raised)] dark:border-zinc-800 dark:bg-zinc-900`}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            // Botón de sólo ícono: necesita nombre accesible propio.
            aria-label="Cerrar"
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        {children}
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Confirmación de una acción destructiva.
//
// El patrón anterior era `window.confirm`, que además de no poder estilarse
// bloquea el hilo y —en el contexto de esta app— aparece sin decir qué se va a
// borrar exactamente.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"
            }`}
          >
            {pending ? "Un momento…" : confirmLabel}
          </button>
        </>
      }
    />
  );
}
