"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";

// Borra TODAS las respuestas de una encuesta (sin eliminar la encuesta).
// Modal: ofrece exportar los datos antes y exige confirmación explícita.
export function ResetResponsesButton({
  id,
  total,
  exportHref,
  action,
}: {
  id: string;
  total: number;
  exportHref: string;
  action: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const disabled = total === 0;
  const plural = total === 1 ? "" : "s";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        Borrar respuestas
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Borrar todas las respuestas"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <form action={action}>
              <input type="hidden" name="id" value={id} />
              <SubmitButton pendingLabel="Borrando…" variant="danger">
                Borrar {total} respuesta{plural}
              </SubmitButton>
            </form>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Se eliminarán las{" "}
            <strong className="text-zinc-800 dark:text-zinc-100">
              {total} respuesta{plural}
            </strong>{" "}
            de esta encuesta. La encuesta se mantiene: podés volver a arrancar
            desde cero. Esta acción no se puede deshacer.
          </p>

          <a
            href={exportHref}
            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden>↓</span> Exportar datos a CSV antes de borrar
          </a>
        </div>
      </Modal>
    </>
  );
}
