import { describe, it, expect } from "vitest";
import { activeSection, type NavGroup } from "@/lib/nav";

const NAV: NavGroup[] = [
  { section: "Operación", items: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/campanas", label: "Campañas", icon: "Megaphone" },
    { href: "/campanas/flows", label: "Flows", icon: "Workflow" },
  ] },
  { section: "Investigación", items: [
    { href: "/respuestas", label: "Respuestas", icon: "MessageSquare" },
  ] },
];

describe("activeSection", () => {
  it("match exacto", () => expect(activeSection("/dashboard", NAV)).toBe("Operación"));
  it("match por subruta (startsWith)", () => expect(activeSection("/campanas/flows", NAV)).toBe("Operación"));
  it("otra sección", () => expect(activeSection("/respuestas", NAV)).toBe("Investigación"));
  it("ruta desconocida → null", () => expect(activeSection("/nope", NAV)).toBeNull());
});
