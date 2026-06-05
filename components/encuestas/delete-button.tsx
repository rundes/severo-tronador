"use client";

// Botón de eliminar encuesta con confirmación de seguridad. Envía la server
// action solo si el usuario confirma (la acción borra también respuestas).
export function DeleteEncuestaButton({
  id,
  titulo,
  action,
}: {
  id: string;
  titulo: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `¿Eliminar la encuesta "${titulo}"?\n\nSe borran también todas sus respuestas. Esta acción no se puede deshacer.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
      >
        Eliminar encuesta
      </button>
    </form>
  );
}
