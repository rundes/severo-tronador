"use client";

import { useState, useTransition } from "react";
import type { AdRow } from "@/lib/meta-ads";
import { buttonClass } from "@/components/ui/button";

type EstadoAction = (adId: string, status: "ACTIVE" | "PAUSED") => Promise<{ ok: boolean; msg: string }>;

// `previews` mapea adId → HTML del iframe (placement Feed). Vacío en mock/sin token.
export function MisAnuncios({
  ads,
  previews,
  estadoAction,
}: {
  ads: AdRow[];
  previews: Record<string, string>;
  estadoAction: EstadoAction;
}) {
  if (!ads.length) {
    return <p className="text-sm text-zinc-500">No hay anuncios para este período/estado.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} previewHtml={previews[ad.id]} estadoAction={estadoAction} />
      ))}
    </div>
  );
}

function AdCard({
  ad,
  previewHtml,
  estadoAction,
}: {
  ad: AdRow;
  previewHtml?: string;
  estadoAction: EstadoAction;
}) {
  const [status, setStatus] = useState(ad.status);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const active = status === "ACTIVE";

  function toggle() {
    const next = active ? "PAUSED" : "ACTIVE";
    if (next === "ACTIVE" && !confirm("Activar el anuncio puede empezar a gastar presupuesto. ¿Seguro?")) return;
    start(async () => {
      const r = await estadoAction(ad.id, next);
      setMsg(r.msg);
      if (r.ok) setStatus(next);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 shadow-[var(--shadow-rest)] dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{ad.name}</div>
          <div className="truncate text-xs text-zinc-500">
            {ad.campaign ?? "—"} · {ad.adset ?? "—"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              active
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {active ? "Activo" : "Pausado"}
          </span>
          <button type="button" onClick={toggle} disabled={pending} className={buttonClass("secondary", "sm")}>
            {pending ? "…" : active ? "Pausar" : "Activar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-zinc-100 dark:border-zinc-800">
          {previewHtml ? (
            <iframe
              title={`preview-${ad.id}`}
              sandbox="allow-scripts allow-same-origin allow-popups"
              srcDoc={previewHtml}
              className="h-[420px] w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center p-4 text-center text-xs text-zinc-400">
              Conectá Meta (Conectores → Meta) para ver el preview real.
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 self-start">
          {ad.metrics.map((m) => (
            <div key={m.label} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {m.value.toLocaleString("es-AR")}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      {ad.mode === "mock" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">Datos de ejemplo (modo mock, sin credenciales de Meta).</p>
      )}
      {msg && <p className="text-[11px] text-zinc-500">{msg}</p>}
    </div>
  );
}
