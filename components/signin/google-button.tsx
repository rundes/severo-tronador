"use client";

import { useFormStatus } from "react-dom";

// Botón de Google con spinner mientras el server action redirige al
// OAuth flow. Antes parecía colgado en la primera vez porque NextAuth
// hace fetch del CSRF cookie + redirect — toma ~1s. Sin estado visible
// el usuario apretaba dos veces.
export function GoogleSignInButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-[oklch(28%_0.06_250)] px-6 py-3.5 text-sm font-medium text-[oklch(96%_0.01_80)] shadow-sm hover:bg-[oklch(20%_0.06_250)] active:scale-[0.99] disabled:opacity-70"
    >
      {pending ? (
        <Spinner />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="currentColor"
          aria-hidden
        >
          <path d="M21.35 11.1H12v2.9h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95S8.78 6.2 12 6.2c1.84 0 3.07.78 3.77 1.45l2.57-2.48C16.71 3.6 14.55 2.7 12 2.7 6.92 2.7 2.8 6.8 2.8 12s4.12 9.3 9.2 9.3c5.32 0 8.83-3.74 8.83-9 0-.6-.07-1.05-.15-1.5z" />
        </svg>
      )}
      <span>{pending ? "Conectando con Google…" : "Continuar con Google"}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
