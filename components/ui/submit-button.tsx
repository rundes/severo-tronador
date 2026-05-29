"use client";

// SubmitButton + FormStatus: feedback consistente para forms server-action.
// SubmitButton usa useFormStatus para deshabilitarse y mostrar spinner
// mientras la action está pending. FormStatus renderiza un mensaje inline
// debajo del botón según ?ok=/?error= en searchParams.

import { useFormStatus } from "react-dom";

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
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const variants = {
    primary:
      "bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700",
    secondary:
      "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
    danger:
      "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  } as const;
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`inline-flex items-center gap-2 rounded px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className ?? ""}`}
    >
      {pending && <Spinner />}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
