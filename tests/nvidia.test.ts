// tests/nvidia.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nvidiaChat, listNvidiaModels } from "@/lib/nvidia";

beforeEach(() => { vi.restoreAllMocks(); });

describe("nvidiaChat", () => {
  it("parsea choices[0].message.content y usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  hola  " } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await nvidiaChat({ apiKey: "k", model: "meta/llama-3.3-70b-instruct", prompt: "hi" });
    expect(r.text).toBe("hola");
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/chat/completions");
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });

  it("lanza con el mensaje del error de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad model" } }), { status: 400 }),
    ));
    await expect(
      nvidiaChat({ apiKey: "k", model: "x", prompt: "hi" }),
    ).rejects.toThrow("bad model");
  });
});

describe("listNvidiaModels", () => {
  it("devuelve los ids de data[]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "a/b" }, { id: "c/d" }] }), { status: 200 }),
    ));
    expect(await listNvidiaModels("k")).toEqual(["a/b", "c/d"]);
  });
});
