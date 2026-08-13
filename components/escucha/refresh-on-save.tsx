"use client";

// Tras guardar (?guardado=1) la carga inicial corre en background (after()).
// Refresca la página a los 20s y 50s para que el resumen por fuente aparezca
// sin que el operador tenga que recargar a mano.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
