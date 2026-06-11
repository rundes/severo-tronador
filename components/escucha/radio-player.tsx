"use client";

import { useRef, useState } from "react";
import { firmarAudioRadio } from "@/app/(dashboard)/escucha/actions";

// Reproductor de una mención de radio: la mención con ±10s de contexto, o el
// programa completo. La URL del audio (GCS) se firma on-demand al primer play.
export function RadioPlayer({ meta }: { meta: Record<string, unknown> }) {
  const audioObject = String(meta.audioObject ?? "");
  const start = Number(meta.start ?? 0);
  const end = Number(meta.end ?? start);

  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function ensureLoaded(): Promise<boolean> {
    if (urlRef.current && audioRef.current) return true;
    setBusy(true);
    setErr(false);
    const r = await firmarAudioRadio(audioObject);
    setBusy(false);
    if (!r.url || !audioRef.current) {
      setErr(true);
      return false;
    }
    urlRef.current = r.url;
    audioRef.current.src = r.url; // imperativo: evita la carrera del re-render
    return true;
  }

  async function playFrom(from: number, until: number | null) {
    if (!(await ensureLoaded()) || !audioRef.current) return;
    stopAt.current = until;
    audioRef.current.currentTime = Math.max(0, from);
    void audioRef.current.play();
  }

  function onTime() {
    const a = audioRef.current;
    if (stopAt.current != null && a && a.currentTime >= stopAt.current) {
      a.pause();
      stopAt.current = null;
    }
  }

  if (!audioObject) return null;
  const btn =
    "rounded border border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => playFrom(start - 10, end + 10)} disabled={busy} className={btn}>
        {busy ? "…" : "▶ mención ±10s"}
      </button>
      <button type="button" onClick={() => playFrom(0, null)} disabled={busy} className={btn}>
        programa completo
      </button>
      {err && <span className="text-[10px] text-red-500">sin audio</span>}
      <audio ref={audioRef} onTimeUpdate={onTime} controls preload="none" className="h-7 max-w-[220px]" />
    </span>
  );
}
