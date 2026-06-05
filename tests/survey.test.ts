import { describe, it, expect } from "vitest";
import {
  createToken,
  resolveToken,
  addResponse,
  hasResponded,
  listResponses,
} from "@/lib/survey";

const P = "p1";

describe("survey", () => {
  it("token resuelve; respuesta se guarda; dedupe bloquea la 2da", async () => {
    const tok = await createToken(P, "camp-1", "777");
    const ref = await resolveToken(tok);
    expect(ref?.dni).toBe("777");
    expect(ref?.projectId).toBe(P);
    const r1 = await addResponse(tok, [{ pregunta: "p", respuesta: "r" }]);
    expect(r1).not.toBeNull();
    expect(await hasResponded(tok)).toBe(true);
    const r2 = await addResponse(tok, [{ pregunta: "p", respuesta: "otra" }]);
    expect(r2).toBeNull();
  });

  it("token con encuestaId resuelve a la encuesta (atribución por destinatario)", async () => {
    const tok = await createToken(P, "camp-enc", "888", "enc-xyz");
    const ref = await resolveToken(tok);
    expect(ref?.encuestaId).toBe("enc-xyz");
    expect(ref?.dni).toBe("888");
    // token legacy (sin encuesta) → encuestaId undefined.
    const legacy = await resolveToken(await createToken(P, "camp-leg", "999"));
    expect(legacy?.encuestaId).toBeUndefined();
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
    const tok = await createToken(P, "camp-new", "neva");
    expect(await hasResponded(tok)).toBe(false);
  });

  it("tokens distintos son independientes (cada uno acepta su respuesta)", async () => {
    const tA = await createToken(P, "camp-ind", "ind-a");
    const tB = await createToken(P, "camp-ind", "ind-b");
    expect(
      await addResponse(tA, [{ pregunta: "p", respuesta: "a" }]),
    ).not.toBeNull();
    expect(
      await addResponse(tB, [{ pregunta: "p", respuesta: "b" }]),
    ).not.toBeNull();
    expect(await hasResponded(tA)).toBe(true);
    expect(await hasResponded(tB)).toBe(true);
  });

  it("listResponses filtra por proyecto + campaignId", async () => {
    const camp = `camp-list-${P}`;
    const tok = await createToken(P, camp, "list-dni");
    await addResponse(tok, [{ pregunta: "p", respuesta: "r" }]);
    const filtered = await listResponses(P, camp);
    expect(filtered.some((r) => r.token === tok)).toBe(true);
    expect(filtered.every((r) => r.campaignId === camp)).toBe(true);
    // Otro proyecto no ve esa respuesta.
    expect((await listResponses("pB", camp)).length).toBe(0);
  });
});
