import { describe, it, expect } from "vitest";
import { getUsage, incrementUsage, resetUsage } from "@/lib/quota";

describe("quota", () => {
  it("increment acumula y reset vuelve a 0", async () => {
    await resetUsage("c1");
    expect(await getUsage("c1")).toBe(0);
    await incrementUsage("c1", 3);
    await incrementUsage("c1");
    expect(await getUsage("c1")).toBe(4);
    await resetUsage("c1");
    expect(await getUsage("c1")).toBe(0);
  });

  it("cuota aislada por proyecto", async () => {
    await resetUsage("cx", "pA");
    await resetUsage("cx", "pB");
    await incrementUsage("cx", 5, "pA");
    expect(await getUsage("cx", "pA")).toBe(5);
    // Mismo connector, otro proyecto → cuenta independiente
    expect(await getUsage("cx", "pB")).toBe(0);
  });

  it("getOrgUsage suma el uso de todos los proyectos del connector", async () => {
    const { getOrgUsage } = await import("@/lib/quota");
    await resetUsage("org-c", "p1");
    await resetUsage("org-c", "p2");
    await incrementUsage("org-c", 4, "p1");
    await incrementUsage("org-c", 6, "p2");
    expect(await getOrgUsage("org-c")).toBe(10);
    // No mezcla otros connectors.
    await incrementUsage("otra-c", 99, "p1");
    expect(await getOrgUsage("org-c")).toBe(10);
  });

  it("la clave de cuota de Brevo lleva la fecha (tope diario)", async () => {
    // El guard org-wide de la cola tiene que preguntar por ESTA clave: pedir
    // "brevo" a secas devolvía 0 y el tope compartido nunca frenaba nada.
    const { brevoConnector } = await import("@/lib/connectors/brevo");
    const { dailyQuotaKey } = await import("@/lib/quota");
    expect(brevoConnector.quotaKey?.()).toBe(dailyQuotaKey("brevo"));
    expect(brevoConnector.quotaKey?.()).toMatch(/^brevo:\d{4}-\d{2}-\d{2}$/);
  });
});
