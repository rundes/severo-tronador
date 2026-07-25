import { describe, it, expect } from "vitest";
import {
  OUTREACH_CHANNELS,
  SURVEY_SEND_CHANNELS,
  outreachConnectorFor,
  outreachConnectorById,
} from "@/lib/campaigns";

// SMS y Voz (Telnyx) retirados de los canales ofrecidos (decisión 2026-07-24:
// mal servicio del gateway). Se reactivan al cablear un proveedor nuevo en
// CONNECTOR_BY_CHANNEL. El histórico y la cola legacy no se tocan.

describe("canales retirados (sms/voice)", () => {
  it("OUTREACH_CHANNELS no ofrece sms ni voice", () => {
    expect(OUTREACH_CHANNELS).not.toContain("sms");
    expect(OUTREACH_CHANNELS).not.toContain("voice");
    expect(OUTREACH_CHANNELS).toEqual(
      expect.arrayContaining(["email", "whatsapp", "telegram"]),
    );
  });

  it("SURVEY_SEND_CHANNELS no ofrece sms", () => {
    expect(SURVEY_SEND_CHANNELS).not.toContain("sms");
    expect(SURVEY_SEND_CHANNELS).toEqual(
      expect.arrayContaining(["email", "whatsapp", "telegram"]),
    );
  });

  it("outreachConnectorFor devuelve undefined para canales retirados", () => {
    expect(outreachConnectorFor("sms")).toBeUndefined();
    expect(outreachConnectorFor("voice")).toBeUndefined();
  });

  it("la cola legacy sigue drenable por connector_id", () => {
    expect(outreachConnectorById("telnyx-sms")).toBeDefined();
    expect(outreachConnectorById("telnyx-voice")).toBeDefined();
  });
});
