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
}: {
  encuestaId: string;
  channels: SendChannel[];
  segments: { id: string; nombre: string }[];
  grupos: { id: string; nombre: string; count: number }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [channel, setChannel] = useState<Channel>(channels[0].id);
  const current = channels.find((c) => c.id === channel) ?? channels[0];

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
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

      <SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton>
    </form>
  );
}
