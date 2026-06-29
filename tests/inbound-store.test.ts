import { describe, it, expect, beforeEach } from "vitest";

// Sin SUPABASE_* en env → dbConfigured()=false → store en memoria.
beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("inbound_messages");
});

const base = {
  project_id: "proj-1",
  channel: "whatsapp",
  sender_external_id: "5491122223333",
  dni: "30111222",
  body: "hola",
  provider_message_id: "wamid.X",
  campaign_id: null,
  respuesta_token: null,
  is_opt_out: false,
  raw: null,
} as const;

describe("inbound-store (memoria)", () => {
  it("inserta una fila nueva", async () => {
    const { recordInbound } = await import("@/lib/inbound-store");
    const r = await recordInbound({ ...base });
    expect(r.inserted).toBe(true);
  });

  it("es idempotente por (channel, provider_message_id)", async () => {
    const { recordInbound, inboundExists } = await import("@/lib/inbound-store");
    await recordInbound({ ...base });
    expect(await inboundExists("whatsapp", "wamid.X")).toBe(true);
    const dup = await recordInbound({ ...base });
    expect(dup.inserted).toBe(false);
  });

  it("inboundExists devuelve false para id desconocido", async () => {
    const { inboundExists } = await import("@/lib/inbound-store");
    expect(await inboundExists("sms", "nope")).toBe(false);
  });
});
