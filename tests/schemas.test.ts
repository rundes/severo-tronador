import { describe, it, expect } from "vitest";
import {
  CrearCampanaSchema,
  NuevaPlantillaSchema,
  RegistrarLlamadaSchema,
  TokenSchema,
  GuardarEscuchaSchema,
  SegmentFilterSchema,
  formToObject,
  summarizeZodError,
} from "@/lib/schemas";

describe("formToObject", () => {
  it("convierte entries simples a string", () => {
    const fd = new FormData();
    fd.set("a", "1");
    fd.set("b", "x");
    expect(formToObject(fd)).toEqual({ a: "1", b: "x" });
  });

  it("agrupa keys repetidas en array (checkboxes)", () => {
    const fd = new FormData();
    fd.append("ch", "email");
    fd.append("ch", "sms");
    fd.append("ch", "voice");
    expect(formToObject(fd)).toEqual({ ch: ["email", "sms", "voice"] });
  });

  it("ignora entries File", () => {
    const fd = new FormData();
    fd.set("name", "x");
    fd.set("file", new File(["data"], "f.txt"));
    expect(formToObject(fd)).toEqual({ name: "x" });
  });
});

describe("SegmentFilterSchema", () => {
  it("normaliza string vacío a undefined", () => {
    const out = SegmentFilterSchema.parse({
      sexo: "",
      edadMin: "",
      edadMax: "",
      barrio: "",
      healthMin: "",
    });
    expect(out).toEqual({
      sexo: undefined,
      edadMin: undefined,
      edadMax: undefined,
      barrio: undefined,
      healthMin: undefined,
    });
  });

  it("coerce strings a número con rango", () => {
    const out = SegmentFilterSchema.parse({
      sexo: "F",
      edadMin: "18",
      edadMax: "60",
      barrio: "Centro",
      healthMin: "80",
    });
    expect(out).toEqual({
      sexo: "F",
      edadMin: 18,
      edadMax: 60,
      barrio: "Centro",
      healthMin: 80,
    });
  });

  it("rechaza edadMin > 120", () => {
    const r = SegmentFilterSchema.safeParse({ edadMin: "150" });
    expect(r.success).toBe(false);
  });

  it("rechaza healthMin > 100", () => {
    const r = SegmentFilterSchema.safeParse({ healthMin: "200" });
    expect(r.success).toBe(false);
  });

  it("rechaza sexo distinto de F/M", () => {
    const r = SegmentFilterSchema.safeParse({ sexo: "X" });
    expect(r.success).toBe(false);
  });
});

describe("CrearCampanaSchema", () => {
  it("happy path con todos los campos", () => {
    const out = CrearCampanaSchema.parse({
      nombre: "Campaña Mayo",
      templateId: "tpl-1",
      channel: "whatsapp",
      preguntas: ["q1", "q2"],
      segmentFilter: { sexo: "F", edadMin: "18", barrio: "Centro" },
    });
    expect(out.nombre).toBe("Campaña Mayo");
    expect(out.channel).toBe("whatsapp");
    expect(out.preguntas).toEqual(["q1", "q2"]);
  });

  it("templateId vacío → falla", () => {
    const r = CrearCampanaSchema.safeParse({
      templateId: "",
      segmentFilter: {},
    });
    expect(r.success).toBe(false);
  });

  it("channel inválido → cae a default email vía catch", () => {
    const out = CrearCampanaSchema.parse({
      templateId: "tpl-1",
      channel: "fax",
      segmentFilter: {},
    });
    expect(out.channel).toBe("email");
  });

  it("preguntas con strings vacíos → falla", () => {
    const r = CrearCampanaSchema.safeParse({
      templateId: "tpl-1",
      preguntas: ["valida", ""],
      segmentFilter: {},
    });
    expect(r.success).toBe(false);
  });
});

describe("NuevaPlantillaSchema", () => {
  it("happy path con asunto cuando channel=email", () => {
    const out = NuevaPlantillaSchema.parse({
      nombre: "Bienvenida",
      asunto: "Hola",
      cuerpo: "Mensaje",
      channel: "email",
    });
    expect(out.asunto).toBe("Hola");
  });

  it("descarta asunto si channel no es email", () => {
    const out = NuevaPlantillaSchema.parse({
      nombre: "WA Tpl",
      asunto: "ignorado",
      cuerpo: "Hola",
      channel: "whatsapp",
    });
    expect(out.asunto).toBeUndefined();
  });

  it("nombre vacío → falla", () => {
    const r = NuevaPlantillaSchema.safeParse({
      nombre: "",
      cuerpo: "x",
      channel: "email",
    });
    expect(r.success).toBe(false);
  });

  it("cuerpo vacío → falla", () => {
    const r = NuevaPlantillaSchema.safeParse({
      nombre: "x",
      cuerpo: "",
      channel: "email",
    });
    expect(r.success).toBe(false);
  });
});

describe("RegistrarLlamadaSchema", () => {
  it("happy path", () => {
    const out = RegistrarLlamadaSchema.parse({
      dni: "12345",
      outcome: "contactado",
      notes: "habló 5 min",
    });
    expect(out).toEqual({
      dni: "12345",
      outcome: "contactado",
      notes: "habló 5 min",
    });
  });

  it("outcome inválido → falla", () => {
    const r = RegistrarLlamadaSchema.safeParse({
      dni: "1",
      outcome: "invalido",
    });
    expect(r.success).toBe(false);
  });

  it("dni vacío → falla", () => {
    const r = RegistrarLlamadaSchema.safeParse({
      dni: "",
      outcome: "contactado",
    });
    expect(r.success).toBe(false);
  });

  it("notes vacío → undefined", () => {
    const out = RegistrarLlamadaSchema.parse({
      dni: "1",
      outcome: "contactado",
      notes: "",
    });
    expect(out.notes).toBeUndefined();
  });
});

describe("TokenSchema", () => {
  it("acepta UUID v4", () => {
    const out = TokenSchema.parse({
      token: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(out.token).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rechaza token no-UUID", () => {
    const r = TokenSchema.safeParse({ token: "abc123" });
    expect(r.success).toBe(false);
  });

  it("rechaza vacío", () => {
    const r = TokenSchema.safeParse({ token: "" });
    expect(r.success).toBe(false);
  });
});

describe("GuardarEscuchaSchema", () => {
  it("happy path", () => {
    const out = GuardarEscuchaSchema.parse({
      zona: "AMBA",
      pais: "AR",
      radioKm: "50",
      keywords: ["luz", "agua"],
      fuentes: ["gdelt"],
    });
    expect(out.pais).toBe("AR");
    expect(out.radioKm).toBe(50);
  });

  it("normaliza pais a mayúsculas", () => {
    const out = GuardarEscuchaSchema.parse({ pais: "ar" });
    expect(out.pais).toBe("AR");
  });

  it("país inválido → cae a default AR vía catch", () => {
    const out = GuardarEscuchaSchema.parse({ pais: "Argentina" });
    expect(out.pais).toBe("AR");
  });

  it("radioKm vacío → null", () => {
    const out = GuardarEscuchaSchema.parse({ radioKm: "" });
    expect(out.radioKm).toBeNull();
  });

  it("keywords con elemento vacío → falla", () => {
    const r = GuardarEscuchaSchema.safeParse({ keywords: ["valida", ""] });
    expect(r.success).toBe(false);
  });
});

describe("summarizeZodError", () => {
  it("formato 'campo: mensaje, otro: mensaje'", () => {
    const r = TokenSchema.safeParse({ token: "no-es-uuid" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = summarizeZodError(r.error);
      expect(msg).toContain("token");
    }
  });
});
