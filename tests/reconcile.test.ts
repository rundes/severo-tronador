import { describe, it, expect, beforeEach, vi } from "vitest";

// Reconciliación activa de entregas de email: para envíos sent sin delivery,
// consulta la API de Resend (GET /emails/{id}) y corrige `delivery` en envios.
// WhatsApp no tiene endpoint de pull (webhook-only) → queda fuera.

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("mapResendEvent", () => {
  it("mapea eventos de Resend a delivery", async () => {
    const { mapResendEvent } = await import("@/lib/reconcile");
    expect(mapResendEvent("delivered")).toBe("delivered");
    expect(mapResendEvent("opened")).toBe("read");
    expect(mapResendEvent("clicked")).toBe("read");
    expect(mapResendEvent("bounced")).toBe("failed");
    expect(mapResendEvent("complained")).toBe("failed");
    expect(mapResendEvent("failed")).toBe("failed");
  });

  it("eventos no terminales no corrigen nada", async () => {
    const { mapResendEvent } = await import("@/lib/reconcile");
    expect(mapResendEvent("sent")).toBeNull();
    expect(mapResendEvent("delivery_delayed")).toBeNull();
    expect(mapResendEvent("queued")).toBeNull();
    expect(mapResendEvent(undefined)).toBeNull();
  });
});

function stubDb(rows: { provider_message_id: string }[]) {
  const qb: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not", "is", "lte", "order"]) {
    qb[m] = vi.fn(() => qb);
  }
  qb.limit = vi.fn(async () => ({ data: rows, error: null }));
  vi.doMock("@/lib/db/supabase", () => ({
    dbConfigured: () => true,
    getSupabase: () => qb,
  }));
  return qb;
}

describe("reconcileResendDeliveries", () => {
  it("consulta Resend por cada envío dudoso y corrige los terminales", async () => {
    stubDb([
      { provider_message_id: "re-1" },
      { provider_message_id: "re-2" },
      { provider_message_id: "re-3" },
    ]);
    vi.doMock("@/lib/connectors/config", () => ({
      getConnectorConfig: vi.fn(async () => ({ RESEND_API_KEY: "re_test" })),
    }));
    const updateEnvioStatus = vi.fn(async () => true);
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus }));

    const events: Record<string, string> = {
      "re-1": "delivered",
      "re-2": "bounced",
      "re-3": "sent", // aún en tránsito: no se corrige
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = String(url).split("/").pop() as string;
        return {
          ok: true,
          json: async () => ({ last_event: events[id] }),
        } as Response;
      }),
    );

    const { reconcileResendDeliveries } = await import("@/lib/reconcile");
    const r = await reconcileResendDeliveries();
    expect(r).toMatchObject({ checked: 3, corrected: 2 });
    expect(updateEnvioStatus).toHaveBeenCalledWith("re-1", "delivered");
    expect(updateEnvioStatus).toHaveBeenCalledWith("re-2", "failed");
    expect(updateEnvioStatus).not.toHaveBeenCalledWith("re-3", expect.anything());
  });

  it("sin RESEND_API_KEY no consulta nada", async () => {
    stubDb([{ provider_message_id: "re-1" }]);
    vi.doMock("@/lib/connectors/config", () => ({
      getConnectorConfig: vi.fn(async () => ({})),
    }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { reconcileResendDeliveries } = await import("@/lib/reconcile");
    const r = await reconcileResendDeliveries();
    expect(r).toMatchObject({ checked: 0, corrected: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("un error de la API de Resend no corta el lote", async () => {
    stubDb([
      { provider_message_id: "re-err" },
      { provider_message_id: "re-ok" },
    ]);
    vi.doMock("@/lib/connectors/config", () => ({
      getConnectorConfig: vi.fn(async () => ({ RESEND_API_KEY: "re_test" })),
    }));
    const updateEnvioStatus = vi.fn(async () => true);
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("re-err")) return { ok: false, status: 500 } as Response;
        return { ok: true, json: async () => ({ last_event: "delivered" }) } as Response;
      }),
    );

    const { reconcileResendDeliveries } = await import("@/lib/reconcile");
    const r = await reconcileResendDeliveries();
    expect(r).toMatchObject({ checked: 2, corrected: 1 });
    expect(updateEnvioStatus).toHaveBeenCalledWith("re-ok", "delivered");
  });

  it("sin DB configurada devuelve ceros", async () => {
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => false,
      getSupabase: () => {
        throw new Error("no db");
      },
    }));
    const { reconcileResendDeliveries } = await import("@/lib/reconcile");
    const r = await reconcileResendDeliveries();
    expect(r).toMatchObject({ checked: 0, corrected: 0 });
  });
});
