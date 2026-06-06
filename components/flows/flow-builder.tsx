"use client";

import { useState } from "react";
import type { SegmentFilter } from "@/lib/segments";
import { buttonClass } from "@/components/ui/button";

interface TemplateRef {
  id: string;
  nombre: string;
}

type TemplatesByChannel = Record<
  "email" | "whatsapp" | "sms" | "voice",
  TemplateRef[]
>;

interface StepDraft {
  delay_days: number;
  channel: "email" | "whatsapp" | "sms" | "voice";
  template_id: string;
  condition_kind: "always" | "if_no_response_to_prev" | "if_response_to_prev";
}

const CHANNEL_OPTS: StepDraft["channel"][] = ["email", "whatsapp", "sms", "voice"];
const CONDITIONS: { value: StepDraft["condition_kind"]; label: string }[] = [
  { value: "always", label: "siempre" },
  { value: "if_no_response_to_prev", label: "si no respondió antes" },
  { value: "if_response_to_prev", label: "si respondió antes" },
];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function FlowBuilder({
  action,
  templatesByChannel,
  defaultFilter,
  advancedQuery,
  advancedQueryValid,
}: {
  action: (formData: FormData) => Promise<void>;
  templatesByChannel: TemplatesByChannel;
  defaultFilter: SegmentFilter;
  advancedQuery: string | null;
  advancedQueryValid: boolean;
}) {
  const [steps, setSteps] = useState<StepDraft[]>([
    { delay_days: 0, channel: "email", template_id: "", condition_kind: "always" },
  ]);

  function update(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      if (patch.channel) next[i].template_id = ""; // reset templ al cambiar canal
      return next;
    });
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        delay_days: (prev[prev.length - 1]?.delay_days ?? 0) + 3,
        channel: "email",
        template_id: "",
        condition_kind: "if_no_response_to_prev",
      },
    ]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={action} className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Nombre del flow
          <input
            name="nombre"
            required
            maxLength={120}
            placeholder="ej: Sondeo transporte — secuencia 3 toques"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Window inicio (UTC)
          <input
            type="number"
            name="send_window_start_hour"
            min={0}
            max={23}
            placeholder="ej 12"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Window fin (UTC)
          <input
            type="number"
            name="send_window_end_hour"
            min={0}
            max={23}
            placeholder="ej 22"
            className={inputCls}
          />
        </label>
      </div>

      <SegmentSummary
        filter={defaultFilter}
        advancedQuery={advancedQuery}
        valid={advancedQueryValid}
      />

      {/* Inputs hidden para preservar el segmento. */}
      {advancedQueryValid && advancedQuery ? (
        <input type="hidden" name="q" value={advancedQuery} />
      ) : (
        <>
          <input type="hidden" name="sexo" value={defaultFilter.sexo ?? ""} />
          <input type="hidden" name="edadMin" value={defaultFilter.edadMin ?? ""} />
          <input type="hidden" name="edadMax" value={defaultFilter.edadMax ?? ""} />
          <input type="hidden" name="barrio" value={defaultFilter.barrio ?? ""} />
          <input type="hidden" name="healthMin" value={defaultFilter.healthMin ?? ""} />
        </>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Steps ({steps.length})
          </span>
          <button
            type="button"
            onClick={addStep}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            + Step
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li
              key={i}
              className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-5 dark:border-zinc-800"
            >
              <Field label={i === 0 ? "Día 0" : "Día +N"}>
                <input
                  type="number"
                  name="step_delay"
                  min={0}
                  max={365}
                  value={step.delay_days}
                  onChange={(e) =>
                    update(i, { delay_days: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Canal">
                <select
                  name="step_channel"
                  value={step.channel}
                  onChange={(e) =>
                    update(i, { channel: e.target.value as StepDraft["channel"] })
                  }
                  className={inputCls}
                >
                  {CHANNEL_OPTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plantilla">
                <select
                  name="step_template"
                  value={step.template_id}
                  required
                  onChange={(e) => update(i, { template_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="" disabled>
                    elegí…
                  </option>
                  {templatesByChannel[step.channel].map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Condición" className="sm:col-span-1">
                <select
                  name="step_condition"
                  value={step.condition_kind}
                  onChange={(e) =>
                    update(i, {
                      condition_kind: e.target.value as StepDraft["condition_kind"],
                    })
                  }
                  className={inputCls}
                  disabled={i === 0}
                >
                  {CONDITIONS.map((c) => (
                    <option
                      key={c.value}
                      value={c.value}
                      disabled={i === 0 && c.value !== "always"}
                    >
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end justify-end">
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="text-xs text-zinc-400 hover:text-red-600"
                    aria-label="Quitar step"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="submit"
        className={buttonClass("primary")}
      >
        Crear flow
      </button>
      <p className="text-xs text-zinc-400">
        El flow queda en estado <code>draft</code> hasta que apretes «Iniciar».
        Eso despacha al cron los envíos con sus <code>scheduled_at</code>.
      </p>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 ${className ?? ""}`}
    >
      {label}
      {children}
    </label>
  );
}

function SegmentSummary({
  filter,
  advancedQuery,
  valid,
}: {
  filter: SegmentFilter;
  advancedQuery: string | null;
  valid: boolean;
}) {
  if (advancedQuery && valid) {
    return (
      <div className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        Segmento: <strong>query avanzada activa</strong>. Vuelve a /segmentos
        para editarla.
      </div>
    );
  }
  const entries = Object.entries(filter).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
        Sin segmento activo. El flow va a apuntar al padrón entero. Volvé a{" "}
        <a href="/segmentos" className="underline">
          /segmentos
        </a>{" "}
        si querés recortar.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
      Segmento heredado de la URL:{" "}
      <span className="font-mono">
        {entries.map(([k, v]) => `${k}=${v}`).join(" · ")}
      </span>
    </div>
  );
}
