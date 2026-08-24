// GDELT limita a 1 request cada 5 segundos por IP. El cron listening-pull
// recorre N proyectos en serie y cada uno pegaba a GDELT sin pausa: desde el
// segundo proyecto todo volvía 429 y el conector lo tragaba como "fetched: 0"
// sin error visible (Ibicuy: 0 noticias de prensa durante días).
//
// Contrato:
//   - dos fetches consecutivos se espacian >= MIN_GAP_MS
//   - un 429 se reintenta una vez tras la pausa
//   - si igual falla, el error se reporta en query.diagnostics (no silencio)
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/connectors/demo", () => ({ demoData: () => false }));
const fetchMock = vi.fn();
vi.mock("@/lib/net/safe-fetch", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchMock(...args),
}));

import { gdeltConnector, GDELT_MIN_GAP_MS, __resetGdeltThrottle } from "@/lib/connectors/gdelt";

function jsonResp(articles: { title: string; url: string; domain: string; seendate: string }[]) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ articles }),
    text: async () => "",
  } as unknown as Response;
}
function resp429() {
  return {
    ok: false,
    status: 429,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => "Please limit requests to one every 5 seconds",
  } as unknown as Response;
}
const ART = { title: "Crecida del Paraná", url: "https://d/1", domain: "d", seendate: "20260824T120000Z" };
const QUERY = { keywords: ["Ibicuy"], pais: "AR" };

describe("gdelt connector · throttle y retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    __resetGdeltThrottle();
  });

  it("espacia dos fetches consecutivos al menos GDELT_MIN_GAP_MS", async () => {
    fetchMock.mockResolvedValue(jsonResp([ART]));
    const p1 = gdeltConnector.fetch({ ...QUERY });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await p1;

    const p2 = gdeltConnector.fetch({ ...QUERY });
    await vi.advanceTimersByTimeAsync(GDELT_MIN_GAP_MS - 100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await p2).toHaveLength(1);
  });

  it("reintenta una vez tras 429 y devuelve los artículos", async () => {
    fetchMock.mockResolvedValueOnce(resp429()).mockResolvedValueOnce(jsonResp([ART]));
    const p = gdeltConnector.fetch({ ...QUERY });
    await vi.advanceTimersByTimeAsync(GDELT_MIN_GAP_MS + 100);
    const items = await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items.map((i) => i.text)).toEqual(["Crecida del Paraná"]);
  });

  it("si el retry también falla, reporta en diagnostics y devuelve []", async () => {
    fetchMock.mockResolvedValue(resp429());
    const diagnostics: { source: string; detail: string }[] = [];
    const p = gdeltConnector.fetch({ ...QUERY, diagnostics });
    await vi.advanceTimersByTimeAsync(GDELT_MIN_GAP_MS * 2 + 100);
    expect(await p).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].source).toBe("gdelt");
    expect(diagnostics[0].detail).toMatch(/429/);
  });
});
