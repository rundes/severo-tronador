import { describe, it, expect } from "vitest";
import { optOut, isOptedOut, optedOutSet, listOptOuts } from "@/lib/optout";

const P = "p1";

describe("optout (por proyecto)", () => {
  it("optOut marca y no se pisa; isOptedOut true; set contiene dni", async () => {
    await optOut(P, "999", "test");
    await optOut(P, "999", "otra"); // no debe pisar
    expect(await isOptedOut(P, "999")).toBe(true);
    expect(await isOptedOut(P, "000")).toBe(false);
    expect((await optedOutSet(P)).has("999")).toBe(true);
  });

  it("preserva el reason del primer optOut (no pisa)", async () => {
    await optOut(P, "opt-keep-1", "razon-original");
    await optOut(P, "opt-keep-1", "razon-nueva");
    const all = await listOptOuts(P);
    const target = all.find((o) => o.dni === "opt-keep-1");
    expect(target?.reason).toBe("razon-original");
  });

  it("listOptOuts ordena por `at` descendente", async () => {
    const dnis = ["sort-a", "sort-b", "sort-c"];
    for (const d of dnis) {
      await optOut(P, d);
      await new Promise((r) => setTimeout(r, 5));
    }
    const list = await listOptOuts(P);
    const filtered = list
      .filter((o) => dnis.includes(o.dni))
      .map((o) => o.dni);
    expect(filtered).toEqual(["sort-c", "sort-b", "sort-a"]);
  });

  it("optedOutSet aggrega todos los DNIs", async () => {
    await optOut(P, "set-x");
    await optOut(P, "set-y");
    const set = await optedOutSet(P);
    expect(set.has("set-x")).toBe(true);
    expect(set.has("set-y")).toBe(true);
  });

  it("aislamiento: opt-out en un proyecto no afecta a otro", async () => {
    await optOut("pA", "iso-dni");
    expect(await isOptedOut("pA", "iso-dni")).toBe(true);
    expect(await isOptedOut("pB", "iso-dni")).toBe(false);
  });
});
