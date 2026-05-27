import { describe, it, expect } from "vitest";
import { memoryRepo } from "@/lib/db/memory";

type Row = { id?: string; n: number };

describe("memoryRepo", () => {
  it("upsert + list + get + remove", async () => {
    const r = memoryRepo<Row>("test");
    const a = await r.upsert({ id: "1", n: 1 });
    expect(a.id).toBe("1");
    await r.upsert({ id: "2", n: 2 });
    expect((await r.list()).length).toBe(2);
    expect((await r.get("1"))?.n).toBe(1);
    await r.remove("1");
    expect(await r.get("1")).toBeUndefined();
  });
});
