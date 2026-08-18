// Mapa explícito nombre → ícono de la navegación.
//
// El sidebar hacía `import * as Icons from "lucide-react"` y resolvía por
// nombre. Eso trae la LIBRERÍA COMPLETA (más de mil íconos) al bundle del
// cliente, y como el sidebar está en el layout del dashboard, la paga TODA
// ruta del panel. El nombre del ícono venía como string desde el server, así
// que el bundler no podía saber cuáles se usaban.
//
// Los nombres los define app/(dashboard)/layout.tsx: es un set cerrado. Con el
// mapa, el import es estático y el tree-shaking deja sólo estos.
//
// Al agregar un ítem al nav hay que sumar su ícono acá; si falta, cae a Circle
// (y el test de nav lo detecta).
import {
  Circle,
  ClipboardList,
  Ear,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
  Megaphone,
  MessageSquare,
  PenTool,
  PieChart,
  Plug,
  ScrollText,
  Search,
  Send,
  Users,
  UserX,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  ClipboardList,
  Ear,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  Mail,
  Megaphone,
  MessageSquare,
  PenTool,
  PieChart,
  Plug,
  ScrollText,
  Search,
  Send,
  Users,
  UserX,
  Workflow,
};

export const FALLBACK_ICON = Circle;
