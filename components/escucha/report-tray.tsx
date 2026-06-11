"use client";

interface ReportTrayProps {
  markedCount: number;
  disabled?: boolean;
}

export function ReportTray({ markedCount, disabled = false }: ReportTrayProps) {
  function handlePopout() {
    window.open(
      "/escucha?tab=monitor&solo=1",
      "_blank",
      "popup=yes,width=1100,height=820",
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
        <span
          className={`font-semibold ${
            markedCount > 0
              ? "text-[oklch(52%_0.13_255)]"
              : "text-zinc-400"
          }`}
        >
          {markedCount}
        </span>{" "}
        marcado{markedCount !== 1 ? "s" : ""}
      </span>

      {!disabled && (
        <a
          href="/escucha/informe"
          target="_blank"
          rel="noreferrer"
          className="rounded border border-[oklch(52%_0.13_255)] px-2.5 py-1 text-[11px] font-medium text-[oklch(52%_0.13_255)] transition-colors hover:bg-[oklch(52%_0.13_255)] hover:text-white"
        >
          Generar informe (PDF)
        </a>
      )}

      {disabled && (
        <span
          title="Configurá Supabase para generar informes"
          className="cursor-not-allowed rounded border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-400 dark:border-zinc-700"
        >
          Generar informe (PDF)
        </span>
      )}

      <button
        type="button"
        onClick={handlePopout}
        title="Abrir monitor en ventana nueva"
        className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Abrir en ventana ↗
      </button>
    </div>
  );
}
