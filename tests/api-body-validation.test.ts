// Validación de forma en los bordes de API (F4.5 del plan de mejoras).
//
// Ninguna ruta validaba el cuerpo. En los webhooks el HMAC autentica el ORIGEN,
// no el contenido: un cambio de formato del proveedor entraba igual y explotaba
// adentro con un TypeError. Validar convierte eso en un 400 con motivo.
import { describe, it, expect } from "vitest";
import {
  MailInboundSchema,
  parseJsonBody,
  RadioIngestSchema,
} from "@/lib/schemas";

function jsonReq(body: unknown): Request {
  return new Request("https://x/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseJsonBody", () => {
  it("acepta un cuerpo válido y devuelve el dato tipado", async () => {
    const r = await parseJsonBody(
      jsonReq({ projectId: "p1", station: "AM750", isoStart: "2026-08-18T10:00:00Z" }),
      RadioIngestSchema,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.station).toBe("AM750");
  });

  it("400 con motivo cuando falta un campo obligatorio", async () => {
    const r = await parseJsonBody(jsonReq({ station: "AM750" }), RadioIngestSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = (await r.response.json()) as { error: string };
      expect(body.error).toContain("projectId");
    }
  });

  it("400 cuando el tipo no es el esperado", async () => {
    // El caso real: el proveedor cambia el formato y manda un número donde
    // había un string.
    const r = await parseJsonBody(
      jsonReq({ projectId: "p1", station: 42, isoStart: "x" }),
      RadioIngestSchema,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("400 con JSON ilegible", async () => {
    const r = await parseJsonBody(jsonReq("{no json"), RadioIngestSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = (await r.response.json()) as { error: string };
      expect(body.error).toContain("json");
    }
  });

  it("los campos opcionales pueden faltar", async () => {
    const r = await parseJsonBody(
      jsonReq({
        projectId: "p1",
        station: "AM750",
        isoStart: "2026-08-18T10:00:00Z",
        segments: [{ start: 0, end: 3, text: "hola" }],
      }),
      RadioIngestSchema,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.segments).toHaveLength(1);
  });
});

describe("MailInboundSchema", () => {
  it("exige el mail crudo", () => {
    expect(MailInboundSchema.safeParse({ to: "a@b.com" }).success).toBe(false);
    expect(MailInboundSchema.safeParse({ raw: "" }).success).toBe(false);
    expect(MailInboundSchema.safeParse({ raw: "From: x" }).success).toBe(true);
  });
});
