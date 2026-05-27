import { describe, it, expect } from "vitest";
import { createToken, resolveToken, addResponse, hasResponded } from "@/lib/survey";

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
});
