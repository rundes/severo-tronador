// tests/nvidia-models.test.ts
import { describe, it, expect, vi } from "vitest";
import { classify, curatedModels } from "@/lib/ai/nvidia-models";

describe("classify", () => {
  it("clasifica por patrones de id", () => {
    expect(classify("meta/llama-3.3-70b-instruct")).toBe("text");
    expect(classify("nvidia/nv-embedqa-e5-v5")).toBe("embedding");
    expect(classify("baai/bge-m3")).toBe("embedding");
    expect(classify("meta/llama-3.2-90b-vision-instruct")).toBe("vision");
    expect(classify("nvidia/vila")).toBe("vision");
    expect(classify("mistralai/codestral-22b-instruct-v0.1")).toBe("code");
    expect(classify("bigcode/starcoder2-15b")).toBe("code");
    expect(classify("meta/llama-guard-4-12b")).toBe("safety");
    expect(classify("nvidia/nemotron-4-340b-reward")).toBe("safety");
    expect(classify("nvidia/riva-translate-4b-instruct")).toBe("translate");
    expect(classify("totally/unknown-model-xyz")).toBe("other");
  });
});

describe("curatedModels", () => {
  it("solo expone text/code/vision, ordenado", async () => {
    vi.spyOn(await import("@/lib/nvidia"), "listNvidiaModels").mockResolvedValue([
      "meta/llama-3.3-70b-instruct",
      "nvidia/nv-embedqa-e5-v5",       // embedding → oculto
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-guard-4-12b",        // safety → oculto
    ]);
    const out = await curatedModels("k");
    expect(out.map((m) => m.id)).toEqual([
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-3.3-70b-instruct",
    ]);
    expect(out.every((m) => ["text", "code", "vision"].includes(m.capability))).toBe(true);
    expect(out[0].label).toBe("llama-3.2-90b-vision-instruct");
  });
});
