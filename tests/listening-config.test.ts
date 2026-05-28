import { describe, it, expect } from "vitest";
import { getListeningConfig } from "@/lib/listening-config";

describe("listening-config", () => {
  it("sin Supabase devuelve el default (pais AR, listas vacías)", async () => {
    const cfg = await getListeningConfig();
    expect(cfg.pais).toBe("AR");
    expect(cfg.keywords).toEqual([]);
    expect(cfg.fuentes).toEqual([]);
    expect(cfg.zona).toBe("");
    expect(cfg.radioKm).toBeNull();
  });
});
