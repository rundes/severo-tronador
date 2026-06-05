"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Question, QuestionType } from "@/lib/encuestas/types";

const TYPE_LABEL: Record<QuestionType, string> = {
  text: "Texto corto",
  paragraph: "Párrafo",
  single: "Opción única",
  multi: "Opción múltiple",
  scale: "Escala",
  boolean: "Sí / No",
};

const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

function newQuestion(): Question {
  return { id: crypto.randomUUID(), type: "text", label: "", required: false };
}

export function QuestionEditor({
  encuestaId,
  titulo,
  descripcion,
  initial,
  readOnly,
  action,
}: {
  encuestaId: string;
  titulo: string;
  descripcion: string;
  initial: Question[];
  readOnly: boolean;
  action: (formData: FormData) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(initial);

  function patch(id: string, p: Partial<Question>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...p } : q)));
  }
  function remove(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setQuestions((qs) => {
      const i = qs.findIndex((q) => q.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={encuestaId} />
      <input type="hidden" name="preguntas" value={JSON.stringify(questions)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Título
          </span>
          <input name="titulo" defaultValue={titulo} disabled={readOnly} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Descripción
          </span>
          <input name="descripcion" defaultValue={descripcion} disabled={readOnly} className={inputCls} />
        </label>
      </div>

      <ol className="space-y-3">
        {questions.map((q, idx) => (
          <li
            key={q.id}
            className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-center font-mono text-xs text-zinc-400">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={q.label}
                  onChange={(e) => patch(q.id, { label: e.target.value })}
                  placeholder="Enunciado de la pregunta"
                  disabled={readOnly}
                  className={inputCls}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={q.type}
                    onChange={(e) =>
                      patch(q.id, { type: e.target.value as QuestionType })
                    }
                    disabled={readOnly}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {Object.entries(TYPE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => patch(q.id, { required: e.target.checked })}
                      disabled={readOnly}
                    />
                    Obligatoria
                  </label>
                </div>

                {(q.type === "single" || q.type === "multi") && (
                  <textarea
                    value={(q.options ?? []).join("\n")}
                    onChange={(e) =>
                      patch(q.id, {
                        options: e.target.value.split("\n").map((s) => s.replace(/\r$/, "")),
                      })
                    }
                    placeholder="Una opción por línea"
                    rows={3}
                    disabled={readOnly}
                    className={`${inputCls} font-mono text-xs`}
                  />
                )}

                {q.type === "scale" && (
                  <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <span>De</span>
                    <input
                      type="number"
                      value={q.min ?? 1}
                      onChange={(e) => patch(q.id, { min: Number(e.target.value) })}
                      disabled={readOnly}
                      className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <span>a</span>
                    <input
                      type="number"
                      value={q.max ?? 5}
                      onChange={(e) => patch(q.id, { max: Number(e.target.value) })}
                      disabled={readOnly}
                      className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </div>
                )}
              </div>

              {!readOnly && (
                <div className="flex shrink-0 flex-col gap-1 text-zinc-400">
                  <button type="button" onClick={() => move(q.id, -1)} aria-label="Subir" className="hover:text-zinc-700 dark:hover:text-zinc-200">↑</button>
                  <button type="button" onClick={() => move(q.id, 1)} aria-label="Bajar" className="hover:text-zinc-700 dark:hover:text-zinc-200">↓</button>
                  <button type="button" onClick={() => remove(q.id)} aria-label="Quitar" className="hover:text-red-600">✕</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
            className="rounded border border-dashed border-zinc-400 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            + Agregar pregunta
          </button>
          <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
        </div>
      )}
    </form>
  );
}
