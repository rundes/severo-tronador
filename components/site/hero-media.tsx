"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

// Media del hero de la landing. Por defecto reproduce el video de marca en
// loop (mudo, sin controles); si el usuario pidió menos movimiento
// (prefers-reduced-motion) o el video no carga, cae al logo estático.
// El poster es el mismo logo: si todavía no existe public/brand/hero.mp4,
// el hero muestra el logo y "se actualiza" solo al sumar el archivo.
const POSTER = "/brand/tronador-logo.jpeg";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false, // SSR: asumir que el movimiento está permitido
  );
}

export function HeroMedia() {
  const reduced = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const staticOnly = reduced || videoFailed;

  return (
    <div className="hidden w-full max-w-[480px] items-center justify-end md:flex">
      {staticOnly ? (
        <Image
          src={POSTER}
          alt="Tronador · Estudios Electorales"
          width={1043}
          height={1042}
          className="h-auto w-full rounded-xl"
          priority
        />
      ) : (
        <video
          className="aspect-square w-full rounded-xl object-cover"
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-label="Tronador · Estudios Electorales"
          onError={() => setVideoFailed(true)}
        >
          <source src="/brand/hero.webm" type="video/webm" />
          <source src="/brand/hero.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
