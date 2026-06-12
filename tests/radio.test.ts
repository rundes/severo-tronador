import { describe, it, expect } from "vitest";
import {
  isPublicHttpUrl,
  hhmmToMinutes,
  programsActiveAt,
  programsStartingNow,
  programsToRecord,
  nextOccurrences,
  secondsUntilEnd,
  programDurationSec,
  matchKeywords,
  transcriptToItems,
  segmentsToItems,
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

describe("isPublicHttpUrl", () => {
  it("acepta http(s) público", () => {
    expect(isPublicHttpUrl("https://stream.radio.com.ar/la100")).toBe(true);
    expect(isPublicHttpUrl("http://1.2.3.4:8000/stream")).toBe(true);
  });
  it("rechaza esquemas peligrosos", () => {
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("concat:/etc/passwd")).toBe(false);
  });
  it("rechaza hosts internos/privados/metadata", () => {
    for (const u of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      expect(isPublicHttpUrl(u)).toBe(false);
    }
  });
});

describe("RadioProgramSchema (seguridad de URL)", () => {
  it("rechaza file:// e internos, acepta http(s) público", async () => {
    const { RadioProgramSchema } = await import("@/lib/schemas");
    const base = { station: "R", programa: "P", days: [1], start: "07:00", end: "09:00" };
    expect(RadioProgramSchema.safeParse({ ...base, url: "file:///etc/passwd" }).success).toBe(false);
    expect(RadioProgramSchema.safeParse({ ...base, url: "http://169.254.169.254/x" }).success).toBe(false);
    expect(RadioProgramSchema.safeParse({ ...base, url: "https://stream/radio.mp3" }).success).toBe(true);
  });
});

describe("segmentsToItems (Whisper → offsets)", () => {
  const meta = { station: "Radio X", programa: "Mañanas", isoStart: "2026-06-11T07:00:00Z", audioObject: "radios/x.mp3" };
  const segs = [
    { start: 0, end: 5, text: "Buenos días a todos." },
    { start: 5, end: 12, text: "Hablamos de inseguridad en el barrio." },
    { start: 12, end: 18, text: "Y del transporte." },
  ];
  it("una mención por segmento que matchea, con meta de offsets", () => {
    const items = segmentsToItems(segs, ["inseguridad", "transporte"], meta);
    expect(items).toHaveLength(2);
    expect(items[0].meta).toEqual({ audioObject: "radios/x.mp3", start: 5, end: 12, programa: "Mañanas" });
    expect(items[0].url).toContain("#t5");
    expect(items[1].meta?.start).toBe(12);
  });
  it("sin keywords → vacío (no inunda)", () => {
    expect(segmentsToItems(segs, [], meta)).toEqual([]);
  });
  it("publishedAt = isoStart + offset del segmento (timestamp real de la mención)", () => {
    const items = segmentsToItems(segs, ["inseguridad"], meta);
    // isoStart 07:00:00 + 5s = 07:00:05
    expect(items[0].publishedAt).toBe("2026-06-11T07:00:05.000Z");
  });
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

describe("programsToRecord (pre-roll)", () => {
  const programs = [prog()]; // Lun-Vie 07:00-09:00
  it("captura desde leadMin antes del inicio hasta el fin", () => {
    expect(programsToRecord(programs, 1, 410, 15)).toHaveLength(1); // 06:50 (pre-roll de 15)
    expect(programsToRecord(programs, 1, 420, 15)).toHaveLength(1); // 07:00
    expect(programsToRecord(programs, 1, 535, 15)).toHaveLength(1); // 08:55
  });
  it("no captura antes del pre-roll ni pasado el fin", () => {
    expect(programsToRecord(programs, 1, 400, 15)).toEqual([]); // 06:40 (> 15 antes)
    expect(programsToRecord(programs, 1, 540, 15)).toEqual([]); // 09:00 (fin)
  });
});

describe("nextOccurrences (agenda)", () => {
  it("lista ocurrencias futuras ordenadas dentro del horizonte", () => {
    // Lun-Vie 07:00-09:00. Arrancamos un lunes 2026-06-08 06:00 AR (UTC-3).
    const fromMs = Date.UTC(2026, 5, 8, 9, 0, 0); // 06:00 AR
    const occ = nextOccurrences([prog()], fromMs, 7, -180);
    expect(occ.length).toBeGreaterThanOrEqual(5); // Lun..Vie
    // primera ocurrencia: ese lunes 07:00 AR = 10:00 UTC
    expect(occ[0].startMs).toBe(Date.UTC(2026, 5, 8, 10, 0, 0));
    // ordenadas
    for (let i = 1; i < occ.length; i++) expect(occ[i].startMs).toBeGreaterThan(occ[i - 1].startMs);
  });
  it("no incluye ocurrencias ya terminadas", () => {
    const fromMs = Date.UTC(2026, 5, 8, 13, 0, 0); // 10:00 AR (programa ya terminó 09:00)
    const occ = nextOccurrences([prog()], fromMs, 0, -180); // solo hoy
    expect(occ).toEqual([]);
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
