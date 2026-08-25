"use client";

// Tras guardar Territorio, Prensa o Redes (?ok=<bloque>) la carga inicial corre
// en background (after()). Refresca la página a los 20 s y 50 s para que el
// banner "Última carga" y los conteos por fuente aparezcan sin recargar a mano.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const PULL_BLOCKS = ["territorio", "prensa", "redes"] as const;

export function RefreshOnSave({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t1 = setTimeout(() => router.refresh(), 20_000);
    const t2 = setTimeout(() => router.refresh(), 50_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, router]);
  return null;
}
