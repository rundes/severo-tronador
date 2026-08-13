import { describe, it, expect } from "vitest";
import {
  partitionFeeds,
  normalizeFbUrl,
  normalizeTgChannel,
  statsKeyFor,
} from "@/lib/escucha-fuentes";

describe("partitionFeeds", () => {
  it("separa medios, facebook y telegram por host", () => {
    const p = partitionFeeds([
      "https://diario.com.ar/feed",
      "https://www.facebook.com/MunicipioIbicuy",
      "https://facebook.com/groups/vecinos",
      "https://t.me/canalpueblo",
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC1",
    ]);
    expect(p.medios).toHaveLength(2);
    expect(p.facebook).toHaveLength(2);
    expect(p.telegram).toEqual(["https://t.me/canalpueblo"]);
  });
});

describe("normalizeFbUrl", () => {
  it("acepta con y sin esquema; rechaza no-facebook", () => {
    expect(normalizeFbUrl("facebook.com/MiPagina")).toBe("https://facebook.com/MiPagina");
    expect(normalizeFbUrl("https://www.facebook.com/groups/g1")).toContain("/groups/g1");
    expect(normalizeFbUrl("https://diario.com/nota")).toBeNull();
    expect(normalizeFbUrl("")).toBeNull();
  });
});

describe("normalizeTgChannel", () => {
  it("acepta @canal, canal, t.me/canal y URL completa", () => {
    for (const raw of ["@pueblo_hoy", "pueblo_hoy", "t.me/pueblo_hoy", "https://t.me/s/pueblo_hoy"]) {
      expect(normalizeTgChannel(raw)).toBe("https://t.me/pueblo_hoy");
    }
    expect(normalizeTgChannel("ab")).toBeNull();
  });
});

describe("statsKeyFor", () => {
  it("mapea cada URL a la clave con la que aparece en listening_items.source", () => {
    expect(statsKeyFor("https://www.diario.com.ar/feed")).toBe("diario.com.ar");
    expect(statsKeyFor("https://www.facebook.com/MunicipioIbicuy")).toBe(
      "facebook/MunicipioIbicuy",
    );
    expect(statsKeyFor("https://facebook.com/groups/vecinos")).toBe("facebook/vecinos");
    expect(statsKeyFor("https://t.me/canalpueblo")).toBe("t.me/canalpueblo");
  });
});
