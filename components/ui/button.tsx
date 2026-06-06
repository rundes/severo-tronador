import * as React from "react";

// Botón base del sistema. Vocabulario único de acción para toda la app.
// Variantes: primary (tinta), accent (índigo, acción generativa/avance),
// secondary (borde), ghost (sin caja), danger. Todos con hover, active
// (presión táctil), focus (foco global del :focus-visible) y disabled.
type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-[background-color,transform,box-shadow] duration-150 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-1.5 text-sm",
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  accent:
    "bg-[var(--accent)] text-white shadow-[var(--shadow-rest)] hover:bg-[var(--accent-strong)]",
  secondary:
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
  ghost:
    "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md"): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}`;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${buttonClass(variant, size)} ${className}`}
    >
      {loading && <Spinner />}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}

export function Spinner() {
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
