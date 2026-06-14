"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VideoLoader } from "@/components/video-loader";

// Pantalla intermedia tras volver de Google: muestra el loader de marca y
// redirige al destino real. `router.replace` evita que "atrás" vuelva acá.
// El redirect se dispara por timeout para que también funcione con
// prefers-reduced-motion (donde el video no se reproduce).
const HOLD_MS = 1200;
const HOLD_MS_REDUCED = 250;

export function ReturnTransition({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const t = setTimeout(
      () => router.replace(to),
      reduce ? HOLD_MS_REDUCED : HOLD_MS,
    );
    return () => clearTimeout(t);
  }, [router, to]);

  return <VideoLoader label="Ingresando" />;
}
