import { describe, it, expect, vi } from "vitest";
import { memoryRepo } from "@/lib/db/memory";

describe("withMirror", () => {
  it("encola tras upsert", async () => {
    const enqueue = vi.fn(async () => {});
    const { withMirror } = await import("@/lib/db/mirror");
    const base = memoryRepo<{ id?: string; n: number }>("m");
    const repo = withMirror(base, { entity: "m", enqueue });
    await repo.upsert({ id: "1", n: 1 });
    expect(enqueue).toHaveBeenCalledWith("m", "upsert", { id: "1", n: 1 });
  });
});
