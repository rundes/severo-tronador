"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

// Loader de pantalla completa basado en el video de marca (loading.mp4):
// escena oscura del circuito en loop. Compartido por las transiciones de login
// y el loading.tsx del panel. Respeta prefers-reduced-motion cayendo a la marca
// estática (sin video). El fondo iguala el navy del video para no dejar bordes.
const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

export function VideoLoader({ label }: { label?: string }) {
  const reduced = usePrefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[oklch(16%_0.03_255)]"
    >
      {reduced ? (
        <Image
          src="/brand/tronador-mark.jpeg"
          alt=""
          aria-hidden
          width={72}
          height={72}
          priority
          className="login-mark h-16 w-16 rounded-md"
        />
      ) : (
        <video
          className="max-h-full max-w-full object-contain"
          src="/brand/loading.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
        />
      )}

      {label && (
        <span className="login-text absolute bottom-[11%] font-mono text-[10px] uppercase tracking-[0.22em] text-white/80">
          {label}
        </span>
      )}
    </div>
  );
}
