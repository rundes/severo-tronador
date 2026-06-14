"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoLoader } from "@/components/video-loader";

// Pantalla intermedia tras volver de Google: reproduce el video de marca
// COMPLETO y recién entonces, con un fade, entra al panel. `router.replace`
// evita que "atrás" vuelva acá. El backstop por stall vive en VideoLoader;
// prefers-reduced-motion dispara onEnded enseguida (sin esperar 10s).
const FADE_MS = 520;

export function ReturnTransition({ to }: { to: string }) {
  const router = useRouter();
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(() => router.replace(to), FADE_MS);
  }

  return <VideoLoader label="Ingresando" onEnded={finish} fading={fading} />;
}
