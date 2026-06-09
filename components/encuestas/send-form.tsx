"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Channel } from "@/lib/relationship";

export interface SendChannel {
  id: Channel;
  label: string;
  templates: { id: string; nombre: string }[];
}

const selectCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Form de envío de una encuesta a un segmento/grupo, por el canal elegido.
// El selector de canal filtra las plantillas disponibles (cada plantilla es
// de un canal). Postea a la server action `enviarEncuestaPorMail`.
export function EncuestaSendForm({
  encuestaId,
  channels,
  segments,
  grupos,
  action,
  testAction,
}: {
  encuestaId: string;
  channels: SendChannel[];
  segments: { id: string; nombre: string }[];
  grupos: { id: string; nombre: string; count: number }[];
  action: (formData: FormData) => void | Promise<void>;
  testAction: (formData: FormData) => void | Promise<void>;
}) {
  const [channel, setChannel] = useState<Channel>(channels[0].id);
  const [destino, setDestino] = useState("");
  const current = channels.find((c) => c.id === channel) ?? channels[0];
  const isEmail = channel === "email";

  return (
    <form action={action} className="space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={encuestaId} />

      {channels.length > 1 && (
        <label className="text-xs text-zinc-500">
          <span className="mb-1 block">Canal</span>
          <select
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className={selectCls}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {channels.length === 1 && <input type="hidden" name="channel" value={channel} />}

      <label className="text-xs text-zinc-500">
        <span className="mb-1 block">Plantilla</span>
        {/* key fuerza el reset de la opción al cambiar de canal */}
        <select key={channel} name="templateId" className={selectCls}>
          {current.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-zinc-500">
        <span className="mb-1 block">Destino</span>
        <select name="segmentId" className={selectCls}>
          {segments.length > 0 && (
            <optgroup label="Segmentos guardados">
              {segments.map((s) => (
                <option key={s.id} value={`seg:${s.id}`}>
                  {s.nombre}
                </option>
              ))}
            </optgroup>
          )}
          {grupos.length > 0 && (
            <optgroup label="Grupos de contactos">
              {grupos.map((g) => (
                <option key={g.id} value={`grupo:${g.id}`}>
                  {g.nombre} ({g.count})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <SubmitButton pendingLabel="Enviando…">Enviar a todos</SubmitButton>
    </div>

    {/* Probar envío: un solo mensaje al mail/teléfono indicado, antes del masivo. */}
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
      <label className="text-xs text-zinc-500">
        <span className="mb-1 block">
          Probar antes de enviar ({isEmail ? "mail" : "teléfono"})
        </span>
        <input
          name="destino"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          type={isEmail ? "email" : "tel"}
          inputMode={isEmail ? "email" : "tel"}
          placeholder={isEmail ? "tu@mail.com" : "+54 9 2..."}
          className={`${selectCls} min-w-52`}
        />
      </label>
      <button
        type="submit"
        formAction={testAction}
        formNoValidate
        disabled={!destino.trim()}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Enviar prueba
      </button>
      <span className="text-[11px] text-zinc-400">
        Manda 1 mensaje con la plantilla elegida. No consume el envío masivo.
      </span>
    </div>
    </form>
  );
}
