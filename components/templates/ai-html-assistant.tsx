"use client";

import { useState, useTransition } from "react";
import type { AiHtmlState } from "@/app/(dashboard)/templates/actions";
import { buttonClass } from "@/components/ui/button";

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
//
// IMPORTANTE: NO usa <form> porque este componente vive DENTRO del <form> de
// la plantilla; un form anidado es HTML inválido y haría submit del externo.
// Llama a la server action directamente con useTransition.
export function AiHtmlAssistant({
  action,
  current,
  onApply,
}: {
  action: AiAction;
  current: string;
  onApply: (html: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "" });
  const [pending, start] = useTransition();

  function generar() {
    if (!prompt.trim() || pending) return;
    const fd = new FormData();
    fd.set("prompt", prompt);
    fd.set("current", current);
    start(async () => {
      const res = await action({ ok: null, html: "", msg: "" }, fd);
      if (res.ok && res.html) onApply(res.html);
      setMsg({ ok: res.ok, text: res.msg });
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        placeholder="Describí el email que querés. Ej: «Invitación a la encuesta con un botón grande a {{encuesta_url}} y un tono cercano». Podés pedir cambios sobre lo ya generado."
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generar} disabled={pending || !prompt.trim()} className={buttonClass("accent")}>
          {pending ? "Generando…" : current.trim() ? "✦ Generar / refinar" : "✦ Generar HTML"}
        </button>
        <span className="text-[11px] text-zinc-400">
          Usa tu cuenta de Claude (conector Claude API).
        </span>
      </div>

      {msg.ok !== null && (
        <p
          className={`text-xs ${
            msg.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {msg.text}
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
    </div>
  );
}
