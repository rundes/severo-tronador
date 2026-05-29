import { describe, it, expect, beforeAll, beforeEach } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.META_CL_TOKEN;
  delete process.env.META_CL_ACCOUNT_ID;
});

beforeEach(() => {
  delete process.env.META_CL_TOKEN;
});

describe("meta-content-library connector (mock mode)", () => {
  it("declara id, categoría listening y campos secretos", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    expect(metaContentLibraryConnector.id).toBe("meta-content-library");
    expect(metaContentLibraryConnector.category).toBe("listening");
    const tokenField = metaContentLibraryConnector.configSchema.find(
      (f) => f.key === "META_CL_TOKEN",
    );
    expect(tokenField?.type).toBe("secret");
    expect(tokenField?.required).toBe(true);
  });

  it("status sin token = configuring; con token = enabled", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    expect(await metaContentLibraryConnector.getStatus()).toBe("configuring");
    process.env.META_CL_TOKEN = "fake-token";
    expect(await metaContentLibraryConnector.getStatus()).toBe("enabled");
  });

  it("test() sin token = ok modo mock", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    const res = await metaContentLibraryConnector.test();
    expect(res.ok).toBe(true);
    expect(res.details?.mode).toBe("mock");
  });

  it("fetch() sin keywords devuelve items mock IG + FB", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    const items = await metaContentLibraryConnector.fetch({ keywords: [] });
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.source === "meta-ig")).toBe(true);
    expect(items.some((i) => i.source === "meta-fb")).toBe(true);
  });

  it("fetch() con keyword filtra", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    const items = await metaContentLibraryConnector.fetch({
      keywords: ["inseguridad"],
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.text.toLowerCase()).toContain("inseguridad");
    }
  });

  it("filtro geo: lat/lng cercanos devuelven items, lejanos vacío", async () => {
    const { metaContentLibraryConnector } = await import(
      "@/lib/connectors/meta-content-library"
    );
    // AMBA aprox (los mocks están en -34.6 / -58.4)
    const cerca = await metaContentLibraryConnector.fetch({
      keywords: [],
      lat: -34.6,
      lng: -58.4,
      radioKm: 10,
    });
    expect(cerca.length).toBeGreaterThan(0);
    // Bahía Blanca, ~640km de AMBA
    const lejos = await metaContentLibraryConnector.fetch({
      keywords: [],
      lat: -38.7,
      lng: -62.27,
      radioKm: 10,
    });
    expect(lejos.length).toBe(0);
  });

  it("queda registrado en el registry", async () => {
    const { connectors, getConnector } = await import(
      "@/lib/connectors/registry"
    );
    const ids = connectors.map((c) => c.id);
    expect(ids).toContain("meta-content-library");
    const c = getConnector("meta-content-library");
    expect(c?.category).toBe("listening");
  });
});

describe("meta-content-library en runListening", () => {
  it("agrega items meta-ig/meta-fb al bySource", async () => {
    const { runListening } = await import("@/lib/listening");
    const result = await runListening();
    const igCount = result.bySource["meta-ig"] ?? 0;
    const fbCount = result.bySource["meta-fb"] ?? 0;
    expect(igCount + fbCount).toBeGreaterThan(0);
  });
});
