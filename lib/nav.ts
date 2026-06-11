import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // nombre de ícono lucide (se resuelve en el cliente)
}
export interface NavGroup {
  section: string;
  items: NavItem[];
}
export type { LucideIcon };

// Devuelve el nombre de la sección que contiene la ruta activa, o null.
// Prioriza match exacto; si no, el item más específico por startsWith.
export function activeSection(pathname: string, nav: NavGroup[]): string | null {
  let best: { section: string; len: number } | null = null;
  for (const g of nav) {
    for (const it of g.items) {
      const exact = pathname === it.href;
      const sub = it.href !== "/" && pathname.startsWith(it.href + "/");
      if (exact) return g.section;
      if (sub && (!best || it.href.length > best.len)) best = { section: g.section, len: it.href.length };
    }
  }
  return best?.section ?? null;
}
