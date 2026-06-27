// tests/nvidia-connector.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NVIDIA_API_KEY;
});

describe("nvidiaConnector", () => {
  it("test() sin key → ok con aviso de mock/fallback", async () => {
    const { nvidiaConnector } = await import("@/lib/connectors/nvidia");
    const r = await nvidiaConnector.test({});
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/fallback|sin key/i);
  });

  it("test() con key hace un chat mínimo y reporta el modelo", async () => {
    vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat").mockResolvedValue({
      text: "OK", inputTokens: 1, outputTokens: 1,
    });
    const { nvidiaConnector } = await import("@/lib/connectors/nvidia");
    const r = await nvidiaConnector.test({ NVIDIA_API_KEY: "k" });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("meta/llama-3.3-70b-instruct");
  });

  it("está registrado con categoría analysis", async () => {
    const { getConnector } = await import("@/lib/connectors/registry");
    const c = getConnector("nvidia");
    expect(c?.category).toBe("analysis");
    expect(c?.vendor).toBe("NVIDIA");
  });
});
