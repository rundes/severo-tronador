import { describe, it, expect, beforeEach } from "vitest";

// listInbound: lectura para la bandeja de entrantes (memoria, sin Supabase).

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("inbound_messages");
});

const base = {
  project_id: "proj-1",
  dni: "30111222",
  body: "hola",
  campaign_id: null,
  respuesta_token: null,
  is_opt_out: false,
  raw: null,
} as const;

async function seed() {
  const { recordInbound } = await import("@/lib/inbound-store");
  await recordInbound({ ...base, channel: "whatsapp", sender_external_id: "549111", provider_message_id: "w1" });
  await recordInbound({ ...base, channel: "telegram", sender_external_id: "987", provider_message_id: "t1", dni: null });
  await recordInbound({ ...base, channel: "whatsapp", sender_external_id: "549222", provider_message_id: "w2", dni: null });
}

describe("listInbound (memoria)", () => {
  it("devuelve todas las filas del proyecto, recientes primero", async () => {
    await seed();
    const { listInbound } = await import("@/lib/inbound-store");
    const rows = await listInbound({ projectId: "proj-1" });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => typeof r.received_at === "string")).toBe(true);
    const times = rows.map((r) => +new Date(r.received_at as string));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("filtra por canal", async () => {
    await seed();
    const { listInbound } = await import("@/lib/inbound-store");
    const rows = await listInbound({ projectId: "proj-1", channel: "telegram" });
    expect(rows).toHaveLength(1);
    expect(rows[0].sender_external_id).toBe("987");
  });

  it("filtra huérfanos (dni null)", async () => {
    await seed();
    const { listInbound } = await import("@/lib/inbound-store");
    const rows = await listInbound({ projectId: "proj-1", onlyOrphans: true });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.dni === null)).toBe(true);
  });

  it("respeta limit", async () => {
    await seed();
    const { listInbound } = await import("@/lib/inbound-store");
    const rows = await listInbound({ projectId: "proj-1", limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it("no mezcla proyectos", async () => {
    await seed();
    const { listInbound } = await import("@/lib/inbound-store");
    const rows = await listInbound({ projectId: "proj-2" });
    expect(rows).toHaveLength(0);
  });
});
