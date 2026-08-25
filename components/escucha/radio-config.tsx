"use client";

import { useState } from "react";
import { KIND_LABEL, type AudioProgram, type AudioKind } from "@/lib/audio-programs";
import { controlClassName } from "@/components/ui/field";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const inputCls = controlClassName;
const NEW: AudioProgram = {
  kind: "radio",
  url: "",
  station: "",
  programa: "",
  days: [1, 2, 3, 4, 5],
  start: "07:00",
  end: "09:00",
};

const URL_PLACEHOLDER: Record<AudioKind, string> = {
  radio: "URL del stream (https://…/stream.mp3)",
  youtube: "https://www.youtube.com/@canal/live",
  kick: "https://kick.com/canal",
};

// Editor de programas de audio/video (radio, YouTube, Kick). Serializa a un
// input oculto `audioPrograms` (JSON) que el server action parsea + valida.
// Si viene `proposed` (propuesta de IA sin aplicar), el estado inicial es la
// propuesta; el form padre se remonta por `key` cuando cambia la propuesta.
export function RadioConfig({ initial, proposed }: { initial: AudioProgram[]; proposed?: AudioProgram[] }) {
  const [programs, setPrograms] = useState<AudioProgram[]>(proposed ?? initial);

  function patch(i: number, p: Partial<AudioProgram>) {
    setPrograms((list) => list.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }
  function toggleDay(i: number, d: number) {
    setPrograms((list) =>
      list.map((it, idx) =>
        idx === i
          ? { ...it, days: it.days.includes(d) ? it.days.filter((x) => x !== d) : [...it.days, d].sort() }
          : it,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="audioPrograms" value={JSON.stringify(programs)} />
      {programs.length === 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Sin programas. Agregá uno con la URL de la radio, del canal de YouTube o de Kick y su franja horaria.
        </p>
      )}
      {programs.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={inputCls}
              value={p.kind}
              onChange={(e) => patch(i, { kind: e.target.value as AudioKind })}
              aria-label="Plataforma"
            >
              {(Object.keys(KIND_LABEL) as AudioKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            {p.nota && <span className="text-xs text-amber-700 dark:text-amber-300">{p.nota}</span>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Estación o canal (ej. Radio Maipú)" value={p.station} onChange={(e) => patch(i, { station: e.target.value })} />
            <input className={inputCls} placeholder="Programa (ej. Primera Mañana)" value={p.programa} onChange={(e) => patch(i, { programa: e.target.value })} />
          </div>
          <input className={`${inputCls} w-full font-mono`} placeholder={URL_PLACEHOLDER[p.kind]} value={p.url} onChange={(e) => patch(i, { url: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1">
              {DAYS.map((label, d) => (
                <label
                  key={d}
                  className={`cursor-pointer rounded px-2 py-0.5 text-[11px] ${
                    p.days.includes(d)
                      ? "bg-[oklch(52%_0.13_255)] text-white"
                      : "border border-zinc-300 text-zinc-500 dark:border-zinc-700"
                  }`}
                >
                  <input type="checkbox" checked={p.days.includes(d)} onChange={() => toggleDay(i, d)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              de <input type="time" className={inputCls} value={p.start} onChange={(e) => patch(i, { start: e.target.value })} />
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              a <input type="time" className={inputCls} value={p.end} onChange={(e) => patch(i, { end: e.target.value })} />
            </label>
            <button
              type="button"
              onClick={() => setPrograms((list) => list.filter((_, idx) => idx !== i))}
              className="ml-auto text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 dark:text-zinc-400"
            >
              Quitar
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPrograms((list) => [...list, { ...NEW }])}
        className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        + Programa
      </button>
    </div>
  );
}
