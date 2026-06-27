// tests/ai-generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (const k of ["NVIDIA_API_KEY", "GOOGLE_AI_API_KEY", "ANTHROPIC_API_KEY", "SILICONFLOW_API_KEY"]) delete process.env[k];
});

describe("generateAssist", () => {
  it("usa NVIDIA primero cuando hay key", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    const nv = vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat")
      .mockResolvedValue({ text: "desde nvidia", inputTokens: 3, outputTokens: 4 });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1" });
    expect(r.provider).toBe("nvidia");
    expect(r.text).toBe("desde nvidia");
    expect(nv).toHaveBeenCalledOnce();
  });

  it("cae a Gemini si NVIDIA no tiene key", async () => {
    process.env.GOOGLE_AI_API_KEY = "gk";
    const gem = vi.spyOn(await import("@/lib/gemini"), "generateGeminiText")
      .mockResolvedValue({ text: "desde gemini" });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1" });
    expect(r.provider).toBe("google-ai");
    expect(gem).toHaveBeenCalledOnce();
  });

  it("tier deep usa NVIDIA_MODEL_DEEP", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    process.env.NVIDIA_MODEL_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
    const nv = vi.spyOn(await import("@/lib/nvidia"), "nvidiaChat")
      .mockResolvedValue({ text: "x", inputTokens: 1, outputTokens: 1 });
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", tier: "deep", projectId: "p1" });
    expect(r.model).toBe("nvidia/llama-3.1-nemotron-ultra-253b-v1");
    expect(nv.mock.calls[0][0].model).toBe("nvidia/llama-3.1-nemotron-ultra-253b-v1");
  });

  it("sin ninguna key y con fallback → devuelve heurística", async () => {
    const { generateAssist } = await import("@/lib/ai/generate");
    const r = await generateAssist({ prompt: "hola", projectId: "p1", fallback: "heur" });
    expect(r.provider).toBe("heuristic");
    expect(r.text).toBe("heur");
  });

  it("sin ninguna key y sin fallback → lanza", async () => {
    const { generateAssist } = await import("@/lib/ai/generate");
    await expect(generateAssist({ prompt: "hola", projectId: "p1" })).rejects.toThrow(/proveedor/i);
  });
});
