"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:hover:bg-red-950/30"
      >
        Borrar respuestas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Borrar todas las respuestas
              </h3>
              <p className="text-sm text-zinc-500">
                Se eliminarán las{" "}
                <strong className="text-zinc-700 dark:text-zinc-200">
                  {total} respuesta{total === 1 ? "" : "s"}
                </strong>{" "}
                de esta encuesta. La encuesta se mantiene: podés volver a
                arrancar desde cero. Esta acción no se puede deshacer.
              </p>
            </div>

            <a
              href={exportHref}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              ↓ Exportar datos a CSV antes de borrar
            </a>

            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
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
                  Borrar {total} respuesta{total === 1 ? "" : "s"}
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
