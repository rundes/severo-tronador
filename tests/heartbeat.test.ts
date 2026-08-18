// Dead-man's switch de los crons (F4.1 del plan de mejoras).
//
// La falla que esto detecta no produce un run en rojo: si GitHub deshabilita el
// schedule por 60 días sin actividad, si rota el CRON_SECRET o si el workflow
// se borra, no hay error que reportar — sólo silencio. La ausencia de latido ES
// la señal.
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = { job: string; last_seen_at: string };
let rows: Row[] = [];

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: rows, error: null }),
      upsert: (payload: Row) => {
        rows = rows.filter((r) => r.job !== payload.job);
        rows.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

beforeEach(() => {
  rows = [];
});

describe("staleCrons", () => {
  it("un job que nunca latió cuenta como atrasado", async () => {
    // Puede que nunca se haya llegado a agendar.
    const { staleCrons } = await import("@/lib/heartbeat");
    const stale = await staleCrons(NOW);
    expect(stale.some((s) => s.job === "send-queue")).toBe(true);
    expect(stale.find((s) => s.job === "send-queue")?.lastSeenAt).toBeNull();
  });

  it("un latido reciente no reporta nada", async () => {
    const { staleCrons, CRON_INTERVALS_MIN } = await import("@/lib/heartbeat");
    for (const job of Object.keys(CRON_INTERVALS_MIN)) {
      rows.push({ job, last_seen_at: minutesAgo(1) });
    }
    expect(await staleCrons(NOW)).toEqual([]);
  });

  it("tolera un tick perdido suelto, no una parada", async () => {
    // send-queue corre cada 5 min; la tolerancia es 3× (15 min).
    const { staleCrons, CRON_INTERVALS_MIN } = await import("@/lib/heartbeat");
    for (const job of Object.keys(CRON_INTERVALS_MIN)) {
      rows.push({ job, last_seen_at: minutesAgo(1) });
    }

    rows = rows.map((r) =>
      r.job === "send-queue" ? { ...r, last_seen_at: minutesAgo(10) } : r,
    );
    expect(await staleCrons(NOW)).toEqual([]);

    rows = rows.map((r) =>
      r.job === "send-queue" ? { ...r, last_seen_at: minutesAgo(40) } : r,
    );
    const stale = await staleCrons(NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].job).toBe("send-queue");
    expect(stale[0].minutesSince).toBe(40);
  });

  it("cada job usa su propio intervalo", async () => {
    // 90 min de silencio es una parada para send-queue (cada 5) pero normal
    // para retencion (cada 24h).
    const { staleCrons, CRON_INTERVALS_MIN } = await import("@/lib/heartbeat");
    for (const job of Object.keys(CRON_INTERVALS_MIN)) {
      rows.push({ job, last_seen_at: minutesAgo(90) });
    }
    const stale = (await staleCrons(NOW)).map((s) => s.job);
    expect(stale).toContain("send-queue");
    expect(stale).toContain("sheets-sync");
    expect(stale).not.toContain("retencion");
  });
});

describe("recordHeartbeat", () => {
  it("deja la marca del job", async () => {
    const { recordHeartbeat, staleCrons } = await import("@/lib/heartbeat");
    await recordHeartbeat("send-queue", { done: 3 });
    const stale = await staleCrons(Date.now());
    expect(stale.some((s) => s.job === "send-queue")).toBe(false);
  });

  it("no tira si la escritura falla: el cron que sí funcionó no se cae por el latido", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => true,
      getSupabase: () => ({
        from: () => ({
          upsert: () => Promise.reject(new Error("db caída")),
        }),
      }),
    }));
    const { recordHeartbeat } = await import("@/lib/heartbeat");
    await expect(recordHeartbeat("send-queue")).resolves.toBeUndefined();
  });
});
