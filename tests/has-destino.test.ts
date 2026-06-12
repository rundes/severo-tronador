import { describe, it, expect } from "vitest";
import { hasDestino } from "@/lib/campaigns";
import type { Contact } from "@/lib/connectors/types";

function c(partial: Partial<Contact>): Contact {
  return { dni: "1", nombre: "A", apellido: "B", ...partial } as Contact;
}

// Un contacto sin destino para el canal no debe encolarse: hoy se encola y
// falla en el envío con "Contacto sin email". hasDestino lo detecta antes.
describe("hasDestino", () => {
  it("email: true solo con email no vacío", () => {
    expect(hasDestino("email", c({ email: "a@x.com" }))).toBe(true);
    expect(hasDestino("email", c({ email: "" }))).toBe(false);
    expect(hasDestino("email", c({ email: "   " }))).toBe(false);
    expect(hasDestino("email", c({ email: undefined }))).toBe(false);
  });

  it("whatsapp/sms/voice: true solo con telefono no vacío", () => {
    expect(hasDestino("whatsapp", c({ telefono: "555" }))).toBe(true);
    expect(hasDestino("sms", c({ telefono: "" }))).toBe(false);
    expect(hasDestino("voice", c({ telefono: undefined }))).toBe(false);
    // email presente no habilita un canal de teléfono
    expect(hasDestino("sms", c({ email: "a@x.com" }))).toBe(false);
  });
});
