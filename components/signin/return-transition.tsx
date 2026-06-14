"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginTransition } from "./login-transition";

// Pantalla intermedia tras volver de Google: muestra el overlay de marca y
// redirige al destino real. `router.replace` evita que "atrás" vuelva acá.
// El redirect se dispara por timeout (no por fin de animación) para que también
// funcione con prefers-reduced-motion, donde la barra no anima.
const FILL_MS = 900;

export function ReturnTransition({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const ms = reduce ? 250 : FILL_MS;
    const t = setTimeout(() => router.replace(to), ms);
    return () => clearTimeout(t);
  }, [router, to]);

  return <LoginTransition label="Ingresando" mode="fill" fillMs={FILL_MS} />;
}
