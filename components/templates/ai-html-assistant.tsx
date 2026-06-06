"use client";

import { useActionState, useEffect } from "react";
import type { AiHtmlState } from "@/app/(dashboard)/templates/actions";

type AiAction = (prev: AiHtmlState, formData: FormData) => Promise<AiHtmlState>;

const EXAMPLES = [
  "Invitación cálida a una encuesta de opinión barrial con un botón a {{encuesta_url}} y la firma {{firma}}.",
  "Recordatorio breve y amable para quienes no respondieron todavía.",
  "Aviso con un título, dos o tres bullets y un cierre institucional de {{org}}.",
];

// Tercera vía de edición del cuerpo HTML: el usuario describe en lenguaje
// natural qué quiere y Claude (su cuenta) genera el HTML. Al aplicarse,
// actualiza cuerpoHtml → el preview se refresca en vivo. Puede iterar sobre
// el HTML actual (refinar) pasándolo como contexto.
export function AiHtmlAssistant({
  action,
  current,
  onApply,
}: {
  action: AiAction;
  current: string;
  onApply: (html: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {
    ok: null,
    html: "",
    msg: "",
  } as AiHtmlState);

  // Cuando la generación vuelve OK, aplicamos el HTML al editor/preview.
  useEffect(() => {
    if (state.ok && state.html) onApply(state.html);
    // onApply es estable (setCuerpoHtml); dependemos solo del resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="current" value={current} />
      <textarea
        name="prompt"
        rows={5}
        placeholder="Describí el email que querés. Ej: «Invitación a la encuesta con un botón grande a {{encuesta_url}} y un tono cercano». Podés pedir cambios sobre lo ya generado."
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Generando…" : current.trim() ? "✦ Generar / refinar" : "✦ Generar HTML"}
        </button>
        <span className="text-[11px] text-zinc-400">
          Usa tu cuenta de Claude (conector Claude API).
        </span>
      </div>

      {state.ok !== null && (
        <p
          className={`text-xs ${
            state.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {state.msg}
        </p>
      )}

      <div className="space-y-1 pt-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          Ejemplos
        </div>
        <ul className="space-y-1">
          {EXAMPLES.map((ex) => (
            <li key={ex} className="text-[11px] leading-snug text-zinc-500">
              · {ex}
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
