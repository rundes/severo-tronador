import { describe, it, expect } from "vitest";
import { dedupeByUrl } from "@/lib/listening-cache";

// Google News arma 4-6 feeds (localidad + localidad×keyword) que devuelven
// el mismo artículo con la misma URL. Un upsert con onConflict (project_id,
// url) y dos filas iguales en el lote falla entero en Postgres ("ON CONFLICT
// DO UPDATE command cannot affect row a second time") → `upserted: 0`
// silencioso (Ibicuy, 2026-08-25: fetched 29, upserted 0).
describe("dedupeByUrl", () => {
  it("conserva la primera aparición de cada url y deja pasar los sin url", () => {
    const items = [
      { source: "a", text: "1", url: "https://x/1" },
      { source: "b", text: "2", url: "https://x/1" },
      { source: "c", text: "3", url: "https://x/2" },
      { source: "d", text: "4" },
      { source: "e", text: "5" },
    ];
    expect(dedupeByUrl(items).map((i) => i.text)).toEqual(["1", "3", "4", "5"]);
  });
});
