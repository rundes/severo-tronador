import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate, createTemplate } from "@/lib/templates";

const P1 = "proyecto-uno";
const P2 = "proyecto-dos";

describe("templates", () => {
  it("seed presente; create agrega y get lo encuentra", async () => {
    expect((await listTemplates(P1)).length).toBeGreaterThan(0);
    const t = await createTemplate(P1, {
      channel: "email",
      nombre: "X",
      asunto: "a",
      cuerpo: "b",
      estado: "activo",
    });
    expect(await getTemplate(t.id, P1)).toBeTruthy();
  });

  it("filtra por canal dentro del proyecto", async () => {
    const emails = await listTemplates(P1, "email");
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((t) => t.channel === "email")).toBe(true);
  });
});

describe("templates · aislamiento entre proyectos", () => {
  it("una plantilla creada en un proyecto no la ve el otro", async () => {
    // Era la fuga activa: listTemplates no filtraba y createTemplate caía al
    // DEFAULT de project_id, así que toda plantilla nueva la veía todo el mundo.
    const t = await createTemplate(P1, {
      channel: "email",
      nombre: "Solo de P1",
      cuerpo: "x",
      estado: "activo",
    });
    const p2 = await listTemplates(P2);
    expect(p2.some((x) => x.id === t.id)).toBe(false);
  });

  it("getTemplate con el proyecto ajeno la trata como inexistente", async () => {
    const t = await createTemplate(P1, {
      channel: "sms",
      nombre: "Privada",
      cuerpo: "x",
      estado: "activo",
    });
    expect(await getTemplate(t.id, P1)).toBeTruthy();
    expect(await getTemplate(t.id, P2)).toBeUndefined();
  });

  it("cada proyecto arranca con su propia semilla, con ids que no colisionan", async () => {
    const [a, b] = await Promise.all([listTemplates(P1), listTemplates(P2)]);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const idsA = new Set(a.map((t) => t.id));
    expect(b.every((t) => !idsA.has(t.id))).toBe(true);
    expect(a.every((t) => t.projectId === P1)).toBe(true);
    expect(b.every((t) => t.projectId === P2)).toBe(true);
  });
});
