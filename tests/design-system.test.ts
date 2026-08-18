// Invariantes del design system (F5 del plan de mejoras).
//
// No testean estilos —eso es trabajo de revisión visual— sino las dos cosas que
// se rompen en silencio: que un ícono del nav quede sin resolver y que un canal
// falte en un selector.
import { describe, it, expect } from "vitest";
import { NAV_ICONS } from "@/components/dashboard/nav-icons";
import {
  CHANNEL_OPTIONS,
  CHANNEL_UI,
  channelEmoji,
  channelLabel,
} from "@/lib/channels";
import { CHANNELS, type Channel } from "@/lib/relationship";

// Los nombres que usa app/(dashboard)/layout.tsx. Si se agrega un ítem al nav
// hay que sumar su ícono al mapa; este test es el que lo detecta.
const NAV_ICON_NAMES = [
  "LayoutDashboard",
  "Users",
  "PieChart",
  "Megaphone",
  "Workflow",
  "Inbox",
  "UserX",
  "Ear",
  "Search",
  "ClipboardList",
  "MessageSquare",
  "PenTool",
  "LayoutTemplate",
  "Send",
  "Mail",
  "Plug",
  "FolderKanban",
  "ScrollText",
];

describe("mapa de íconos del nav", () => {
  it("resuelve todos los íconos que usa la navegación", () => {
    // El sidebar hacía `import * as Icons from "lucide-react"`, que trae la
    // librería entera al bundle de TODA ruta del panel. Con el mapa explícito el
    // tree-shaking funciona, pero un nombre que falte cae al ícono genérico.
    const faltantes = NAV_ICON_NAMES.filter((n) => !NAV_ICONS[n]);
    expect(faltantes).toEqual([]);
  });

  it("no arrastra íconos que ya nadie usa", () => {
    const sobrantes = Object.keys(NAV_ICONS).filter(
      (n) => !NAV_ICON_NAMES.includes(n),
    );
    expect(sobrantes).toEqual([]);
  });
});

describe("presentación de canales", () => {
  it("cubre todos los canales del modelo", () => {
    const all: Channel[] = [...CHANNELS, "meta-ad"];
    for (const c of all) {
      expect(CHANNEL_UI[c], `falta ${c}`).toBeTruthy();
      expect(CHANNEL_UI[c].label).toBeTruthy();
      expect(CHANNEL_UI[c].emoji).toBeTruthy();
      expect(CHANNEL_UI[c].Icon).toBeTruthy();
    }
  });

  it("las opciones de canal salen de CHANNELS, no de una lista a mano", () => {
    // Era el bug: había cinco copias del mapa y tres se quedaron sin Telegram
    // cuando se sumó el canal.
    expect(CHANNEL_OPTIONS.map((o) => o.value)).toEqual(CHANNELS);
    expect(CHANNEL_OPTIONS.some((o) => o.value === "telegram")).toBe(true);
  });

  it("meta-ad queda fuera de los selectores de canal preferido", () => {
    // No es un canal de mensajería: no tiene conector de envío.
    expect(CHANNEL_OPTIONS.some((o) => o.value === "meta-ad")).toBe(false);
  });

  it("los helpers no explotan con un canal desconocido", () => {
    const raro = "carrier-pigeon" as Channel;
    expect(channelEmoji(raro)).toBe("•");
    expect(channelLabel(raro)).toBe("carrier-pigeon");
  });
});
