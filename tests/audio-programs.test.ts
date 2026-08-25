import { describe, it, expect } from "vitest";
import {
  normalizeAudioProgram,
  hasValidSlot,
  isValidUrlFor,
  type AudioProgram,
} from "@/lib/audio-programs";
import { programsToRecord, nextOccurrences } from "@/lib/radio";
import { AudioProgramSchema } from "@/lib/schemas";

const base: AudioProgram = {
  kind: "radio", url: "https://stream.lu30.com/live.mp3", station: "LU30", programa: "La mañana",
  days: [1, 2, 3, 4, 5], start: "08:00", end: "10:00",
};

describe("audio-programs", () => {
  it("normaliza filas viejas sin kind como radio y recorta strings", () => {
    const p = normalizeAudioProgram({ url: " https://x/y ", station: " R ", programa: "P", days: [1], start: "08:00", end: "09:00" });
    expect(p.kind).toBe("radio");
    expect(p.url).toBe("https://x/y");
    expect(p.station).toBe("R");
  });

  it("hasValidSlot: franja vacía o invertida no es válida", () => {
    expect(hasValidSlot(base)).toBe(true);
    expect(hasValidSlot({ ...base, start: "", end: "" })).toBe(false);
    expect(hasValidSlot({ ...base, start: "10:00", end: "08:00" })).toBe(false);
    expect(hasValidSlot({ ...base, days: [] })).toBe(false);
  });

  it("isValidUrlFor por kind", () => {
    expect(isValidUrlFor("radio", "https://stream.lu30.com/live.mp3")).toBe(true);
    expect(isValidUrlFor("radio", "http://127.0.0.1/x")).toBe(false);
    expect(isValidUrlFor("youtube", "https://www.youtube.com/@canal/live")).toBe(true);
    expect(isValidUrlFor("youtube", "https://kick.com/canal")).toBe(false);
    expect(isValidUrlFor("kick", "https://kick.com/canal")).toBe(true);
    expect(isValidUrlFor("kick", "https://youtu.be/abc")).toBe(false);
  });

  it("los helpers de franja ignoran programas sin franja", () => {
    const sinFranja = { ...base, start: "", end: "" };
    expect(programsToRecord([sinFranja], 1, 8 * 60, 15)).toEqual([]);
    expect(nextOccurrences([sinFranja], Date.UTC(2026, 7, 24, 12), 2, -180)).toEqual([]);
  });

  it("AudioProgramSchema acepta franja vacía, kind default radio y nota; rechaza url de otro kind", () => {
    const ok = AudioProgramSchema.safeParse({ url: "https://kick.com/canal", station: "K", programa: "Vivo", days: [1], start: "", end: "", kind: "kick", nota: "verificar url" });
    expect(ok.success).toBe(true);
    const legacy = AudioProgramSchema.safeParse({ url: "https://stream/x", station: "R", programa: "P", days: [1], start: "08:00", end: "09:00" });
    expect(legacy.success && legacy.data.kind).toBe("radio");
    const bad = AudioProgramSchema.safeParse({ ...base, kind: "youtube", url: "https://kick.com/canal" });
    expect(bad.success).toBe(false);
  });
});
