import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate, createTemplate } from "@/lib/templates";

describe("templates", () => {
  it("seed presente; create agrega y get lo encuentra", async () => {
    expect((await listTemplates()).length).toBeGreaterThan(0);
    const t = await createTemplate({ channel: "email", nombre: "X", asunto: "a", cuerpo: "b", estado: "activo" });
    expect(await getTemplate(t.id)).toBeTruthy();
  });
});
