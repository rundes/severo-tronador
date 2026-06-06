"use client";

// SubmitButton + FormStatus: feedback consistente para forms server-action.
// SubmitButton usa useFormStatus para deshabilitarse y mostrar spinner
// mientras la action está pending. FormStatus renderiza un mensaje inline
// debajo del botón según ?ok=/?error= en searchParams.

import { useFormStatus } from "react-dom";
import { buttonClass, Spinner } from "./button";

export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "accent";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${buttonClass(variant)} disabled:cursor-not-allowed ${className ?? ""}`}
    >
      {pending && <Spinner />}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
}

export function FormStatus({
  ok,
  error,
  detalle,
}: {
  ok?: string | null;
  error?: string | null;
  detalle?: string | null;
}) {
  if (!ok && !error) return null;
  if (ok) {
    return (
      <div
        role="status"
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
      >
        ✓ {ok}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300"
    >
      <div>✕ {error}</div>
      {detalle && (
        <div className="mt-1 font-mono text-[11px] text-red-700 dark:text-red-400">
          {detalle}
        </div>
      )}
    </div>
  );
}
