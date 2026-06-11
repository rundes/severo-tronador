"use client";

import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

// Abre la página actual sin chrome (?solo=1) en una ventana nueva, para
// arrastrar a un segundo monitor.
export function PopOutButton({ label = "Abrir en ventana" }: { label?: string }) {
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={() => window.open(`${pathname}?solo=1`, "_blank", "popup=yes,width=1100,height=820")}
      className={buttonClass("secondary", "sm")}
      title={label}
    >
      <ExternalLink size={14} className="mr-1.5 inline" />
      Ventana
    </button>
  );
}
