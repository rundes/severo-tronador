import { describe, it, expect } from "vitest";
import { optOut, isOptedOut, optedOutSet, listOptOuts } from "@/lib/optout";

describe("optout", () => {
  it("optOut marca y no se pisa; isOptedOut true; set contiene dni", async () => {
    await optOut("999", "test");
    await optOut("999", "otra"); // no debe pisar
    expect(await isOptedOut("999")).toBe(true);
    expect(await isOptedOut("000")).toBe(false);
    expect((await optedOutSet()).has("999")).toBe(true);
  });

  it("preserva el reason del primer optOut (no pisa)", async () => {
    await optOut("opt-keep-1", "razon-original");
    await optOut("opt-keep-1", "razon-nueva");
    const all = await listOptOuts();
    const target = all.find((o) => o.dni === "opt-keep-1");
    expect(target?.reason).toBe("razon-original");
  });

  it("listOptOuts ordena por `at` descendente", async () => {
    const dnis = ["sort-a", "sort-b", "sort-c"];
    for (const d of dnis) {
      await optOut(d);
      await new Promise((r) => setTimeout(r, 5));
    }
    const list = await listOptOuts();
    const filtered = list
      .filter((o) => dnis.includes(o.dni))
      .map((o) => o.dni);
    expect(filtered).toEqual(["sort-c", "sort-b", "sort-a"]);
  });

  it("optedOutSet aggrega todos los DNIs", async () => {
    await optOut("set-x");
    await optOut("set-y");
    const set = await optedOutSet();
    expect(set.has("set-x")).toBe(true);
    expect(set.has("set-y")).toBe(true);
  });
});
