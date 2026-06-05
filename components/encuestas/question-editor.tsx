"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { scaleBounds, type Question, type QuestionType } from "@/lib/encuestas/types";
import { SURVEY_LAYOUTS } from "@/lib/encuestas/layouts";
import { ImageUpload } from "@/components/encuestas/image-upload";

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

// Vista previa no interactiva: muestra cómo verá el formulario el encuestado
// (mismos widgets mobile-first que el render público).
function PreviewField({ q }: { q: Question }) {
  if (q.type === "paragraph")
    return <div className="h-16 rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" />;
  if (q.type === "text")
    return <div className="h-10 rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" />;
  if (q.type === "single" || q.type === "multi")
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700">
            <span className={`h-4 w-4 shrink-0 border border-zinc-400 ${q.type === "single" ? "rounded-full" : "rounded"}`} />
            <span>{opt || <em className="text-zinc-400">opción vacía</em>}</span>
          </div>
        ))}
      </div>
    );
  if (q.type === "boolean")
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Sí", "No"].map((o) => (
          <div key={o} className="rounded-lg border border-zinc-300 p-3 text-center text-sm font-medium dark:border-zinc-700">{o}</div>
        ))}
      </div>
    );
  const { min, max } = scaleBounds(q);
  return (
    <div className="flex gap-2">
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
        <div key={n} className="flex h-11 min-w-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium dark:border-zinc-700">{n}</div>
      ))}
    </div>
  );
}

function Preview({ questions }: { questions: Question[] }) {
  return (
    <div className="mx-auto max-w-md space-y-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      {questions.length === 0 && (
        <p className="text-sm text-zinc-400">Agregá preguntas para ver la vista previa.</p>
      )}
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <p className="text-base font-medium leading-snug text-zinc-900 dark:text-zinc-100">
            <span className="mr-1 text-zinc-400">{i + 1}.</span>
            {q.label || <em className="text-zinc-400">sin enunciado</em>}
            {q.required && <span className="ml-0.5 text-red-500">*</span>}
          </p>
          {q.description && <p className="text-sm text-zinc-500">{q.description}</p>}
          <PreviewField q={q} />
        </div>
      ))}
      {questions.length > 0 && (
        <div className="h-12 rounded-lg bg-zinc-900 dark:bg-zinc-100" />
      )}
    </div>
  );
}

export function QuestionEditor({
  encuestaId,
  titulo,
  descripcion,
  layout,
  stepMode,
  imageUrl,
  imageEndUrl,
  mensajeFinal,
  ctaLabel,
  ctaUrl,
  initial,
  readOnly,
  action,
}: {
  encuestaId: string;
  titulo: string;
  descripcion: string;
  layout: string;
  stepMode: string;
  imageUrl: string;
  imageEndUrl: string;
  mensajeFinal: string;
  ctaLabel: string;
  ctaUrl: string;
  initial: Question[];
  readOnly: boolean;
  action: (formData: FormData) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [layoutId, setLayoutId] = useState(layout);
  const [stepModeId, setStepModeId] = useState(stepMode === "manual" ? "manual" : "one");
  const [showPreview, setShowPreview] = useState(false);

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
      <input type="hidden" name="layout" value={layoutId} />
      <input type="hidden" name="step_mode" value={stepModeId} />

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

      <ImageUpload
        name="image_url"
        value={imageUrl}
        aspect={3}
        recommend="PNG/JPG · recomendado 1200×400 (3:1)"
        label="Imagen de portada"
        disabled={readOnly}
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Diseño de la encuesta
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SURVEY_LAYOUTS.map((l) => (
            <label
              key={l.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors ${
                layoutId === l.id
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/60"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="layout_pick"
                value={l.id}
                checked={layoutId === l.id}
                onChange={() => setLayoutId(l.id)}
                disabled={readOnly}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-zinc-800 dark:text-zinc-200">{l.label}</span>
                <span className="block text-xs text-zinc-500">{l.description}</span>
              </span>
            </label>
          ))}
        </div>

        {layoutId === "stepper" && (
          <div className="mt-2 flex flex-wrap gap-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Pasos
            </span>
            {[
              { id: "one", label: "1 pregunta por paso" },
              { id: "manual", label: "Agrupar manualmente" },
            ].map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="step_mode_pick"
                  value={m.id}
                  checked={stepModeId === m.id}
                  onChange={() => setStepModeId(m.id)}
                  disabled={readOnly}
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>

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
                <input
                  value={q.description ?? ""}
                  onChange={(e) => patch(q.id, { description: e.target.value })}
                  placeholder="Descripción / contexto (opcional)"
                  disabled={readOnly}
                  className={`${inputCls} text-xs`}
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
                  {layoutId === "stepper" && stepModeId === "manual" && (
                    <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                      Paso
                      <input
                        type="number"
                        min={1}
                        value={q.step ?? 1}
                        onChange={(e) =>
                          patch(q.id, { step: Math.max(1, Number(e.target.value) || 1) })
                        }
                        disabled={readOnly}
                        className="w-14 rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                  )}
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

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <legend className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Cierre (al finalizar)
        </legend>
        <ImageUpload
          name="image_end_url"
          value={imageEndUrl}
          aspect={3}
          recommend="PNG/JPG · recomendado 1200×400 (3:1)"
          label="Imagen de cierre"
          disabled={readOnly}
        />
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Mensaje final</span>
          <textarea
            name="mensaje_final"
            defaultValue={mensajeFinal}
            placeholder="¡Gracias por responder! Tu respuesta quedó registrada."
            rows={2}
            disabled={readOnly}
            className={`${inputCls} resize-y`}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">Texto del botón</span>
            <input
              name="cta_label"
              defaultValue={ctaLabel}
              placeholder="Visitá nuestro sitio"
              disabled={readOnly}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">Link del botón (URL)</span>
            <input
              name="cta_url"
              type="url"
              defaultValue={ctaUrl}
              placeholder="https://…"
              disabled={readOnly}
              className={inputCls}
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
            className="rounded border border-dashed border-zinc-400 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            + Agregar pregunta
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {showPreview ? "Ocultar vista previa" : "Vista previa"}
        </button>
        {!readOnly && <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>}
      </div>

      {showPreview && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Vista previa (así la ve el encuestado)
          </p>
          <Preview questions={questions} />
        </div>
      )}
    </form>
  );
}
