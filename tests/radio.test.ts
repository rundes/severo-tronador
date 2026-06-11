import { describe, it, expect } from "vitest";
import {
  hhmmToMinutes,
  programsActiveAt,
  programsStartingNow,
  secondsUntilEnd,
  programDurationSec,
  matchKeywords,
  transcriptToItems,
  radioItemUrl,
  type RadioProgram,
} from "@/lib/radio";

const prog = (over: Partial<RadioProgram> = {}): RadioProgram => ({
  url: "http://stream/radio",
  station: "Radio X",
  programa: "Mañanas",
  days: [1, 2, 3, 4, 5],
  start: "07:00",
  end: "09:00",
  ...over,
});

describe("hhmmToMinutes", () => {
  it("parsea HH:MM", () => {
    expect(hhmmToMinutes("07:00")).toBe(420);
    expect(hhmmToMinutes("09:30")).toBe(570);
  });
  it("inválido → NaN", () => {
    expect(Number.isNaN(hhmmToMinutes("25:00"))).toBe(true);
    expect(Number.isNaN(hhmmToMinutes("nope"))).toBe(true);
  });
});

describe("programsActiveAt", () => {
  const programs = [prog(), prog({ programa: "Tarde", start: "14:00", end: "16:00" })];
  it("al aire dentro de la franja y el día", () => {
    // Lunes (1), 07:30 → 450 min
    expect(programsActiveAt(programs, 1, 450).map((p) => p.programa)).toEqual(["Mañanas"]);
  });
  it("fuera de hora → vacío", () => {
    expect(programsActiveAt(programs, 1, 600)).toEqual([]); // 10:00
  });
  it("fuera de día → vacío", () => {
    expect(programsActiveAt(programs, 0, 450)).toEqual([]); // Domingo
  });
  it("el borde end es exclusivo", () => {
    expect(programsActiveAt(programs, 1, 540)).toEqual([]); // 09:00 exacto
  });
});

describe("programsStartingNow", () => {
  const programs = [prog()]; // Lun-Vie 07:00-09:00
  it("captura el programa cerca de su inicio (ventana 35min)", () => {
    expect(programsStartingNow(programs, 1, 420, 35)).toHaveLength(1); // 07:00
    expect(programsStartingNow(programs, 1, 450, 35)).toHaveLength(1); // 07:30 (dentro de 35)
  });
  it("no lo captura pasada la ventana de inicio", () => {
    expect(programsStartingNow(programs, 1, 460, 35)).toEqual([]); // 07:40 > 07:00+35
  });
  it("no lo captura otro día", () => {
    expect(programsStartingNow(programs, 0, 420, 35)).toEqual([]); // Domingo
  });
});

describe("secondsUntilEnd", () => {
  it("devuelve lo que resta hasta el fin", () => {
    expect(secondsUntilEnd(prog(), 450)).toBe((540 - 450) * 60); // 07:30 → 1.5h
  });
  it("0 si ya terminó", () => {
    expect(secondsUntilEnd(prog(), 600)).toBe(0);
  });
});

describe("programDurationSec", () => {
  it("franja válida", () => expect(programDurationSec(prog())).toBe(2 * 3600));
  it("end <= start → 0", () => expect(programDurationSec(prog({ end: "07:00" }))).toBe(0));
});

describe("matchKeywords", () => {
  it("case-insensitive, múltiples, sin duplicar", () => {
    expect(matchKeywords("Hablan de Inseguridad y transporte", ["inseguridad", "Transporte", "salud"]))
      .toEqual(["inseguridad", "Transporte"]);
  });
});

describe("transcriptToItems", () => {
  const meta = { station: "Radio X", programa: "Mañanas", isoStart: "2026-06-11T07:00:00Z" };
  it("sin keywords → un item con el transcript completo", () => {
    const items = transcriptToItems("Buenos días. Arrancamos.", [], meta);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe(radioItemUrl("Radio X", meta.isoStart));
    expect(items[0].source).toBe("Radio X");
  });
  it("con keywords → un item por oración que matchea", () => {
    const t = "Hoy hablamos de inseguridad en el barrio. El clima está lindo. Más sobre transporte.";
    const items = transcriptToItems(t, ["inseguridad", "transporte"], meta);
    expect(items).toHaveLength(2);
    expect(items[0].matched).toContain("inseguridad");
    expect(items[1].matched).toContain("transporte");
    // urls únicas (dedup-ables)
    expect(new Set(items.map((i) => i.url)).size).toBe(2);
  });
  it("keywords sin match → vacío", () => {
    expect(transcriptToItems("Nada relevante acá.", ["inseguridad"], meta)).toEqual([]);
  });
  it("transcript vacío → vacío", () => {
    expect(transcriptToItems("   ", ["x"], meta)).toEqual([]);
  });
});
