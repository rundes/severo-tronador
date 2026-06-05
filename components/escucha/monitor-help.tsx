"use client";

import { useState } from "react";

// Recordatorio de los pasos para que el monitoreo de X (worker twscrape) corra.
// El worker NO vive en la nube: corre en la PC del usuario (Task Scheduler).
// Este botón solo muestra la guía; no dispara nada remoto.
const STEPS: { t: string; d: React.ReactNode }[] = [
  {
    t: "Dónde corre",
    d: (
      <>
        En tu PC, no en la nube. Carpeta <code>infra/twikit-worker</code>. Lo
        agenda la tarea programada <code>TronadorXWorker</code> (cada 8&nbsp;h).
      </>
    ),
  },
  {
    t: "Correr ahora (manual)",
    d: (
      <>
        PowerShell: <code>Start-ScheduledTask -TaskName TronadorXWorker</code>{" "}
        — o doble clic en <code>infra/twikit-worker/run.cmd</code>.
      </>
    ),
  },
  {
    t: "Sumar cuentas a monitorear",
    d: (
      <>
        Cargá los handles públicos (intendente, medios, concejales) en el campo
        <strong> &ldquo;Handles públicos de X a monitorear&rdquo;</strong> de
        arriba y Guardá. La próxima corrida los incluye.
      </>
    ),
  },
  {
    t: "Si X pide re-login (cookies vencidas)",
    d: (
      <>
        En <code>worker.log</code> ves errores de auth. Solución: en{" "}
        <code>x.com</code> logueado → F12 → Application → Cookies → copiá{" "}
        <code>auth_token</code> y <code>ct0</code>, y actualizalos en{" "}
        <code>infra/twikit-worker/.env</code>.
      </>
    ),
  },
  {
    t: "Que corra siempre",
    d: (
      <>
        La tarea corre cuando estás logueado en Windows. Si querés que ande con
        la sesión cerrada, en Task Scheduler →{" "}
        <em>Ejecutar aunque el usuario no haya iniciado sesión</em> (pide tu
        contraseña de Windows).
      </>
    ),
  },
];

export function MonitorHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        {open ? "Ocultar pasos" : "¿Cómo actualizo el monitoreo de X?"}
      </button>
      {open && (
        <ol className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {i + 1}
              </span>
              <div>
                <div className="font-medium text-zinc-800 dark:text-zinc-100">{s.t}</div>
                <div className="mt-0.5 text-zinc-600 dark:text-zinc-300 [&_code]:rounded [&_code]:bg-zinc-200/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] dark:[&_code]:bg-zinc-800">
                  {s.d}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
