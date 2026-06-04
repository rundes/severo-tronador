import { describe, it, expect, beforeEach } from "vitest";
import {
  recordEvent,
  campaignTracking,
  trackedLink,
  decodeTarget,
  openPixel,
} from "@/lib/tracking";
import { createToken } from "@/lib/survey";

const P = "proj-track";

beforeEach(() => {
  const g = globalThis as unknown as {
    __emailEvents?: unknown[];
    __tokensMem?: Map<string, unknown>;
  };
  if (g.__emailEvents) g.__emailEvents.length = 0;
});

describe("tracking helpers (puros)", () => {
  it("trackedLink + decodeTarget round-trip http(s)", () => {
    const base = "https://app.x";
    const target = "https://app.x/encuesta/abc?x=1&y=2";
    const link = trackedLink(base, "tok1", target);
    expect(link.startsWith("https://app.x/api/track/c/tok1?u=")).toBe(true);
    const u = link.split("u=")[1];
    expect(decodeTarget(u)).toBe(target);
  });

  it("decodeTarget rechaza no-http (anti open-redirect)", () => {
    const bad = Buffer.from("javascript:alert(1)", "utf8").toString("base64");
    expect(decodeTarget(bad)).toBeNull();
  });

  it("openPixel apunta a la ruta de apertura con el token", () => {
    expect(openPixel("https://app.x", "tok9")).toContain(
      "https://app.x/api/track/o/tok9",
    );
  });
});

describe("recordEvent + campaignTracking (memory, por proyecto)", () => {
  it("cuenta aperturas (únicas + totales) y clicks de la campaña", async () => {
    const tokA = await createToken(P, "camp-X", "dni-a");
    const tokB = await createToken(P, "camp-X", "dni-b");
    await recordEvent("open", tokA);
    await recordEvent("open", tokA); // misma persona reabre
    await recordEvent("open", tokB);
    await recordEvent("click", tokA, { url: "https://x/y" });

    const t = await campaignTracking(P, "camp-X");
    expect(t.opens).toBe(3); // aperturas totales
    expect(t.openedRecipients).toBe(2); // únicos (dni-a, dni-b)
    expect(t.clicks).toBe(1);
  });

  it("aislamiento: otra campaña/proyecto no ve los eventos", async () => {
    const tok = await createToken(P, "camp-Y", "dni-z");
    await recordEvent("open", tok);
    expect((await campaignTracking(P, "camp-otra")).opens).toBe(0);
    expect((await campaignTracking("otro-proj", "camp-Y")).opens).toBe(0);
  });

  it("token desconocido no rompe (best-effort)", async () => {
    await expect(recordEvent("open", "token-fantasma")).resolves.toBeUndefined();
  });
});
