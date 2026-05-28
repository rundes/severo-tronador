import { describe, it, expect } from "vitest";
import {
  createToken,
  resolveToken,
  addResponse,
  hasResponded,
  listResponses,
} from "@/lib/survey";

describe("survey", () => {
  it("token resuelve; respuesta se guarda; dedupe bloquea la 2da", async () => {
    const tok = await createToken("camp-1", "777");
    expect((await resolveToken(tok))?.dni).toBe("777");
    const r1 = await addResponse(tok, [{ pregunta: "p", respuesta: "r" }]);
    expect(r1).not.toBeNull();
    expect(await hasResponded(tok)).toBe(true);
    const r2 = await addResponse(tok, [{ pregunta: "p", respuesta: "otra" }]);
    expect(r2).toBeNull();
  });

  it("resolveToken con token desconocido → undefined", async () => {
    expect(await resolveToken("no-existe-token-zzz")).toBeUndefined();
  });

  it("addResponse con token desconocido → null sin guardar", async () => {
    const r = await addResponse("token-falso-xxx", [
      { pregunta: "p", respuesta: "r" },
    ]);
    expect(r).toBeNull();
  });

  it("hasResponded sobre token nuevo sin guardar → false", async () => {
    const tok = await createToken("camp-new", "neva");
    expect(await hasResponded(tok)).toBe(false);
  });

  it("tokens distintos son independientes (cada uno acepta su respuesta)", async () => {
    const tA = await createToken("camp-ind", "ind-a");
    const tB = await createToken("camp-ind", "ind-b");
    expect(
      await addResponse(tA, [{ pregunta: "p", respuesta: "a" }]),
    ).not.toBeNull();
    expect(
      await addResponse(tB, [{ pregunta: "p", respuesta: "b" }]),
    ).not.toBeNull();
    expect(await hasResponded(tA)).toBe(true);
    expect(await hasResponded(tB)).toBe(true);
  });

  it("listResponses filtra por campaignId", async () => {
    const camp = `camp-list-${Date.now()}`;
    const tok = await createToken(camp, "list-dni");
    await addResponse(tok, [{ pregunta: "p", respuesta: "r" }]);
    const filtered = await listResponses(camp);
    expect(filtered.some((r) => r.token === tok)).toBe(true);
    expect(filtered.every((r) => r.campaignId === camp)).toBe(true);
  });
});
