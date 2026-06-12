import { describe, it, expect } from "vitest";
import { platformOf } from "@/lib/listening";

// Agrupa connector_id en categorías humanas para filtrar el feed.
describe("platformOf", () => {
  it("medios = gdelt + rss", () => {
    expect(platformOf("gdelt")).toBe("medios");
    expect(platformOf("rss-medios")).toBe("medios");
  });
  it("x, radio, reddit directos", () => {
    expect(platformOf("x-api")).toBe("x");
    expect(platformOf("radio")).toBe("radio");
    expect(platformOf("reddit-api")).toBe("reddit");
  });
  it("meta = ad library + content library", () => {
    expect(platformOf("meta-ad-library")).toBe("meta");
    expect(platformOf("meta-content-library")).toBe("meta");
  });
  it("desconocido/null → otros", () => {
    expect(platformOf("loquesea")).toBe("otros");
    expect(platformOf(null)).toBe("otros");
    expect(platformOf(undefined)).toBe("otros");
  });
});
