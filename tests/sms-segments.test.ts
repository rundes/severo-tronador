import { describe, it, expect } from "vitest";
import { countSmsSegments } from "@/lib/sms-segments";

describe("countSmsSegments — GSM-7", () => {
  it("texto corto ASCII → 1 parte, 160 perPart", () => {
    const r = countSmsSegments("Hola, soy del equipo de relevamiento.");
    expect(r.encoding).toBe("GSM-7");
    expect(r.parts).toBe(1);
    expect(r.perPart).toBe(160);
    expect(r.length).toBe(37);
    expect(r.remaining).toBe(160 - 37);
  });

  it("exactamente 160 chars → 1 parte, 0 remaining", () => {
    const r = countSmsSegments("a".repeat(160));
    expect(r.parts).toBe(1);
    expect(r.remaining).toBe(0);
  });

  it("161 chars → 2 partes con perPart=153", () => {
    const r = countSmsSegments("a".repeat(161));
    expect(r.parts).toBe(2);
    expect(r.perPart).toBe(153);
    expect(r.length).toBe(161);
    expect(r.remaining).toBe(153 * 2 - 161); // 145
  });

  it("char extendido cuenta como 2 en GSM-7", () => {
    const r = countSmsSegments("hola€"); // €=2
    expect(r.encoding).toBe("GSM-7");
    expect(r.length).toBe(6);
  });
});

describe("countSmsSegments — UCS-2", () => {
  it("emoji fuerza UCS-2 con perPart=70", () => {
    const r = countSmsSegments("Hola 👋");
    expect(r.encoding).toBe("UCS-2");
    expect(r.parts).toBe(1);
    expect(r.perPart).toBe(70);
  });

  it("acento agudo regular (á) no está en GSM-7 reducido → UCS-2", () => {
    const r = countSmsSegments("á");
    // 'á' minúscula con acento agudo no está en el subset GSM-7 que listamos.
    expect(r.encoding).toBe("UCS-2");
  });

  it("UCS-2 > 70 chars → 2 partes con perPart=67", () => {
    const r = countSmsSegments("👋" + "a".repeat(70));
    expect(r.encoding).toBe("UCS-2");
    expect(r.parts).toBeGreaterThanOrEqual(2);
    expect(r.perPart).toBe(67);
  });
});

describe("countSmsSegments — bordes", () => {
  it("string vacío → 1 parte, length 0", () => {
    const r = countSmsSegments("");
    expect(r.length).toBe(0);
    expect(r.parts).toBe(1);
    expect(r.remaining).toBe(160);
  });
});
