"use client";

import { useState, useTransition } from "react";
import { marcarToggle } from "@/app/(dashboard)/escucha/actions";

interface MarkButtonProps {
  itemKey: string;
  kind: "feed" | "topic";
  payload: Record<string, unknown>;
  initialMarked: boolean;
  disabled?: boolean;
}

export function MarkButton({
  itemKey,
  kind,
  payload,
  initialMarked,
  disabled = false,
}: MarkButtonProps) {
  const [marked, setMarked] = useState(initialMarked);
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (disabled) return;
    const prev = marked;
    setMarked(!prev); // optimistic
    setMsg(null);
    startTransition(async () => {
      const res = await marcarToggle({ itemKey, kind, payload });
      if (!res.ok) {
        setMarked(prev); // revert
        setMsg(res.msg);
      } else {
        setMarked(res.marked);
      }
    });
  }

  if (disabled) {
    return (
      <span
        title="Configurá Supabase para marcar y generar informes"
        className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700"
      >
        ☆ marcar
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        aria-pressed={marked}
        onClick={handleToggle}
        disabled={isPending}
        title={marked ? "Quitar del informe" : "Agregar al informe"}
        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-60 ${
          marked
            ? "border-[oklch(52%_0.13_255)] bg-[oklch(52%_0.13_255)] text-white"
            : "border-zinc-300 text-zinc-500 hover:border-[oklch(52%_0.13_255)] hover:text-[oklch(52%_0.13_255)] dark:border-zinc-700"
        }`}
      >
        {marked ? "★ marcado" : "☆ marcar"}
      </button>
      {msg && (
        <span className="text-[9px] text-red-600 dark:text-red-400">{msg}</span>
      )}
    </span>
  );
}
