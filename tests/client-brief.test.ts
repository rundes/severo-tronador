import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
let stored: unknown = null;
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored ? { config: stored } : null }) }) }),
    }),
  }),
}));

import {
  EMPTY_BRIEF,
  addEntry,
  removeEntry,
  briefText,
  briefHash,
  mergeSuggestions,
  setSuggestionStatus,
  getClientBrief,
  saveClientBrief,
  appliedCount,
  type ClientBrief,
  type ActorSuggestion,
} from "@/lib/client-brief";

const NOW = "2026-08-25T12:00:00.000Z";

describe("client-brief · helpers puros", () => {
  it("addEntry agrega al final con fecha y autor; removeEntry quita por id", () => {
    const b1 = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "Club de Caballito, elecciones en septiembre", at: NOW });
    const b2 = addEntry(b1, { by: "juan@x.ar", text: "La lista opositora se llama Verde", at: "2026-08-26T09:00:00.000Z" });
    expect(b2.entries.map((e) => e.by)).toEqual(["ana@x.ar", "juan@x.ar"]);
    expect(b2.entries[0].id).toBeTruthy();
    const b3 = removeEntry(b2, b2.entries[0].id);
    expect(b3.entries.map((e) => e.text)).toEqual(["La lista opositora se llama Verde"]);
    expect(b2.entries).toHaveLength(2);
  });

  it("addEntry rechaza texto vacío", () => {
    expect(() => addEntry(EMPTY_BRIEF, { by: "a", text: "   ", at: NOW })).toThrow(/vacío/);
  });

  it("briefText formatea [fecha · autor] texto en orden; briefHash es estable", () => {
    const b = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "Club de Caballito", at: NOW });
    expect(briefText(b)).toBe("[2026-08-25 · ana@x.ar] Club de Caballito");
    expect(briefHash(b)).toBe(briefHash({ ...b }));
    expect(briefHash(b)).not.toBe(briefHash(EMPTY_BRIEF));
  });

  it("mergeSuggestions dedupe contra cuentas del plan, aceptadas y descartadas", () => {
    const prev: ClientBrief = {
      ...EMPTY_BRIEF,
      suggestions: [
        { id: "x:viejo", handle: "viejo", platform: "x", category: "individual", direccion: "?", razon: "r", suggestedAt: NOW, status: "dismissed" },
        { id: "instagram:ok", handle: "ok", platform: "instagram", category: "medio", direccion: "A", razon: "r", suggestedAt: NOW, status: "accepted" },
      ],
    };
    const incoming: Omit<ActorSuggestion, "id" | "status" | "suggestedAt">[] = [
      { handle: "@Viejo", platform: "x", category: "individual", direccion: "?", razon: "reaparece" },
      { handle: "ok", platform: "instagram", category: "medio", direccion: "A", razon: "ya aceptada" },
      { handle: "enplan", platform: "x", category: "organizacion", direccion: "B", razon: "está en accounts" },
      { handle: "nuevo", platform: "tiktok", category: "opera", direccion: "B", razon: "nuevo", evidencia: "https://t/1" },
      { handle: "nuevo", platform: "tiktok", category: "opera", direccion: "B", razon: "duplicado en la misma barrida" },
    ];
    const out = mergeSuggestions(prev, incoming, [{ handle: "enplan", platform: "x" }], NOW);
    const pending = out.suggestions.filter((s) => s.status === "pending");
    expect(pending.map((s) => s.id)).toEqual(["tiktok:nuevo"]);
    expect(pending[0].evidencia).toBe("https://t/1");
    expect(out.suggestions).toHaveLength(3);
  });

  it("setSuggestionStatus cambia solo la indicada", () => {
    const b: ClientBrief = {
      ...EMPTY_BRIEF,
      suggestions: [
        { id: "x:a", handle: "a", platform: "x", category: "individual", direccion: "?", razon: "", suggestedAt: NOW, status: "pending" },
        { id: "x:b", handle: "b", platform: "x", category: "individual", direccion: "?", razon: "", suggestedAt: NOW, status: "pending" },
      ],
    };
    const out = setSuggestionStatus(b, "x:a", "accepted");
    expect(out.suggestions.map((s) => s.status)).toEqual(["accepted", "pending"]);
  });
});

describe("client-brief · persistencia", () => {
  beforeEach(() => { upsert.mockClear(); stored = null; });

  it("getClientBrief devuelve EMPTY_BRIEF sin fila y normaliza campos faltantes", async () => {
    expect(await getClientBrief("p1")).toEqual(EMPTY_BRIEF);
    stored = { entries: [{ id: "1", at: NOW, by: "a", text: "t" }] };
    const b = await getClientBrief("p1");
    expect(b.entries).toHaveLength(1);
    expect(b.suggestions).toEqual([]);
  });

  it("saveClientBrief upsertea brief:<projectId> con onConflict (connector_id, project_id)", async () => {
    await saveClientBrief("p1", EMPTY_BRIEF);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe("brief:p1");
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
  });
});

describe("client-brief · propuesta por bloque", () => {
  it("getClientBrief mapea propuestas viejas (appliedKeywordsAt/appliedMonitorAt) a applied.*", async () => {
    stored = {
      entries: [],
      proposal: {
        at: NOW, briefHash: "h", tipo: "territorial", resumen: "r", keywords: ["k"], searchesA: [], searchesB: [],
        accounts: [], entidades: {}, calendar: [], appliedKeywordsAt: "2026-08-25T01:00:00.000Z", appliedMonitorAt: "2026-08-25T02:00:00.000Z",
      },
    };
    const b = await getClientBrief("p1");
    expect(b.proposal?.applied).toEqual({
      territorio: "2026-08-25T01:00:00.000Z", redes: "2026-08-25T02:00:00.000Z", reglas: "2026-08-25T02:00:00.000Z",
    });
    expect(b.proposal?.audio).toEqual([]);
  });

  it("appliedCount cuenta bloques aplicados de 4 y lista los faltantes", () => {
    const p = { audio: [], keywords: ["k"], accounts: [], searchesA: [], searchesB: [], entidades: {}, calendar: [], applied: { territorio: NOW } } as unknown as import("@/lib/client-brief").ScenarioProposal;
    expect(appliedCount(p)).toEqual({ done: 1, total: 4, faltan: ["redes", "audio", "reglas"] });
  });

  it("normalizeProposal: applied nuevo queda intacto; legacy solo con appliedMonitorAt marca redes+reglas", async () => {
    stored = { entries: [], proposal: { at: NOW, briefHash: "h", tipo: "territorial", resumen: "", keywords: [], searchesA: [], searchesB: [], accounts: [], entidades: {}, calendar: [], audio: [], applied: { audio: NOW } } };
    expect((await getClientBrief("p1")).proposal?.applied).toEqual({ audio: NOW });
    stored = { entries: [], proposal: { at: NOW, briefHash: "h", tipo: "territorial", resumen: "", keywords: [], searchesA: [], searchesB: [], accounts: [], entidades: {}, calendar: [], appliedMonitorAt: NOW } };
    expect((await getClientBrief("p1")).proposal?.applied).toEqual({ redes: NOW, reglas: NOW });
  });
});
