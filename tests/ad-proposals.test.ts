import { describe, it, expect, beforeAll } from "vitest";
import { availableModels, generateProposals } from "@/lib/ad-proposals";
import { siliconflowModels } from "@/lib/siliconflow";

// Sin credenciales: no hay modelos disponibles → generateProposals lanza.
beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_MODEL_FAST;
  delete process.env.NVIDIA_MODEL_DEEP;
});

describe("siliconflowModels", () => {
  it("usa default sin lista; parsea la lista provista", () => {
    expect(siliconflowModels()).toContain("deepseek-ai/DeepSeek-V3");
    expect(siliconflowModels("a/b, c/d ,, e/f")).toEqual(["a/b", "c/d", "e/f"]);
  });
});

describe("ad-proposals", () => {
  it("sin proveedores configurados no hay modelos", async () => {
    expect(await availableModels()).toEqual([]);
  });

  it("generateProposals sin proveedores lanza error claro", async () => {
    await expect(generateProposals("brief", ["facebook"])).rejects.toThrow(
      /No hay proveedores/,
    );
  });
});

describe("ad-proposals + NVIDIA", () => {
  it("incluye los modelos NVIDIA configurados en el fan-out", async () => {
    process.env.NVIDIA_API_KEY = "nk";
    process.env.NVIDIA_MODEL_FAST = "meta/llama-3.3-70b-instruct";
    process.env.NVIDIA_MODEL_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
    const { availableModels } = await import("@/lib/ad-proposals");
    const labels = await availableModels();
    expect(labels.some((l) => /llama-3.3-70b|nemotron-ultra/.test(JSON.stringify(l)))).toBe(true);
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_MODEL_FAST;
    delete process.env.NVIDIA_MODEL_DEEP;
  });
});
