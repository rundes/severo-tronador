"use client";

import Image from "next/image";

// Overlay de pantalla completa para los dos saltos del OAuth:
//   - "indeterminate": salida (click → Google), duración desconocida.
//   - "fill": regreso (Google → panel), barra que se llena en `fillMs`.
// Superficie de marca (var(--background)) para empalmar sin salto con el panel.
// Movimiento sobrio: la marca entra, una barra índigo marca el avance.
type Props = {
  label: string;
  mode: "indeterminate" | "fill";
  fillMs?: number;
};

export function LoginTransition({ label, mode, fillMs = 900 }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background"
    >
      <Image
        src="/brand/tronador-mark.jpeg"
        alt=""
        width={72}
        height={72}
        priority
        aria-hidden
        className="login-mark h-16 w-16 rounded-md"
      />

      <div className="login-text flex flex-col items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
          {label}
        </span>

        <div className="h-[2px] w-44 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          {mode === "indeterminate" ? (
            <div className="login-bar-indeterminate h-full w-full" />
          ) : (
            <div
              className="login-bar-fill h-full w-full bg-accent"
              style={{ "--login-fill": `${fillMs}ms` } as React.CSSProperties}
            />
          )}
        </div>
      </div>
    </div>
  );
}
