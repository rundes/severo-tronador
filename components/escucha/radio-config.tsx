"use client";

import { useState } from "react";
import type { RadioProgram } from "@/lib/radio";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const NEW: RadioProgram = {
  url: "",
  station: "",
  programa: "",
  days: [1, 2, 3, 4, 5],
  start: "07:00",
  end: "09:00",
};

// Editor de programas de radio. Serializa a un input oculto `radioStreams`
// (JSON) que el server action parsea + valida.
export function RadioConfig({ initial }: { initial: RadioProgram[] }) {
  const [programs, setPrograms] = useState<RadioProgram[]>(initial);

  function patch(i: number, p: Partial<RadioProgram>) {
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
      <input type="hidden" name="radioStreams" value={JSON.stringify(programs)} />
      {programs.length === 0 && (
        <p className="text-xs text-zinc-400">
          Sin programas. Agregá uno con la URL del stream y su franja horaria.
        </p>
      )}
      {programs.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Estación (ej. Radio Maipú)" value={p.station} onChange={(e) => patch(i, { station: e.target.value })} />
            <input className={inputCls} placeholder="Programa (ej. Primera Mañana)" value={p.programa} onChange={(e) => patch(i, { programa: e.target.value })} />
          </div>
          <input className={`${inputCls} w-full font-mono`} placeholder="URL del stream (https://…/stream.mp3)" value={p.url} onChange={(e) => patch(i, { url: e.target.value })} />
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
              className="ml-auto text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
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
        + Programa de radio
      </button>
    </div>
  );
}
