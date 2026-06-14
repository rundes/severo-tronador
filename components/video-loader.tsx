"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Loader de pantalla completa con el video de marca (loading.mp4): escena
// oscura del circuito. Compartido por las transiciones de login.
//   - loop:    indeterminado (salida hacia Google, no sabemos cuánto tarda).
//   - onEnded: modo "una vez" — se dispara cuando el video termina (o falla,
//     o stallea), para que el padre haga la transición al destino.
//   - fading:  desvanece todo el overlay (efecto de salida).
// Respeta prefers-reduced-motion: sin video, cae a la marca estática y, en modo
// "una vez", dispara onEnded enseguida para no trabar el flujo.
const REDUCED = "(prefers-reduced-motion: reduce)";
const STALL_FALLBACK_MS = 15000;
const REDUCED_HOLD_MS = 600;

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

type Props = {
  label?: string;
  loop?: boolean;
  onEnded?: () => void;
  fading?: boolean;
};

export function VideoLoader({
  label,
  loop = false,
  onEnded,
  fading = false,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const firedRef = useRef(false);

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onEnded?.();
  }

  // Backstop: si el video no autoplaya o se traba, avanzar igual.
  useEffect(() => {
    if (loop || !onEnded) return;
    const ms = reduced ? REDUCED_HOLD_MS : STALL_FALLBACK_MS;
    const t = setTimeout(fire, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, loop, onEnded]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[oklch(16%_0.03_255)] transition-opacity duration-500 ease-out ${
        fading ? "opacity-0" : "opacity-100"
      }`}
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
          playsInline
          preload="auto"
          loop={loop}
          aria-hidden
          onEnded={loop ? undefined : fire}
          onError={loop ? undefined : fire}
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
