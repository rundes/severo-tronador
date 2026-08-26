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
  MASTER_MAX_CHARS,
  setMaster,
  mergeBriefUpdates,
  setBriefUpdateStatus,
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

  it("mergeSuggestions conserva origen, followers y displayName", () => {
    const out = mergeSuggestions(EMPTY_BRIEF, [{ handle: "x", platform: "x", category: "medio", direccion: "?", razon: "r", origen: "barrido", followers: 12, displayName: "X" }], [], NOW);
    expect(out.suggestions[0]).toMatchObject({ origen: "barrido", followers: 12, displayName: "X", status: "pending" });
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

describe("client-brief · brief maestro", () => {
  it("setMaster guarda texto, autor y fecha; briefText pone el maestro antes de los aportes", () => {
    const b0 = addEntry(EMPTY_BRIEF, { by: "ana@x.ar", text: "La lista opositora se llama Verde", at: NOW });
    const b1 = setMaster(b0, { text: "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.", by: "ana@x.ar", at: NOW });
    expect(b1.master).toEqual({ text: "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.", updatedAt: NOW, by: "ana@x.ar" });
    expect(briefText(b1)).toBe("# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.\n\n[2026-08-25 · ana@x.ar] La lista opositora se llama Verde");
    expect(b0.master).toBeUndefined();
  });

  it("setMaster con texto vacío borra el maestro", () => {
    const b = setMaster(setMaster(EMPTY_BRIEF, { text: "x", by: "a", at: NOW }), { text: "   ", by: "a", at: NOW });
    expect(b.master).toBeUndefined();
    expect(briefText(b)).toBe("");
  });

  it("setMaster rechaza más de 60.000 caracteres", () => {
    expect(MASTER_MAX_CHARS).toBe(60000);
    expect(() => setMaster(EMPTY_BRIEF, { text: "x".repeat(60001), by: "a", at: NOW })).toThrow(/60/);
  });

  it("briefHash cambia cuando cambia el maestro", () => {
    expect(briefHash(setMaster(EMPTY_BRIEF, { text: "a", by: "x", at: NOW }))).not.toBe(
      briefHash(setMaster(EMPTY_BRIEF, { text: "b", by: "x", at: NOW })),
    );
  });
});

describe("client-brief · lectura defensiva", () => {
  it("getClientBrief tolera entries/pendingUpdates/suggestions que no son arrays", async () => {
    stored = { entries: "nope", pendingUpdates: { a: 1 }, suggestions: null };
    const b = await getClientBrief("p1");
    expect(b.entries).toEqual([]);
    expect(b.pendingUpdates).toEqual([]);
    expect(b.suggestions).toEqual([]);
  });
});

describe("client-brief · propuestas de actualización", () => {
  it("mergeBriefUpdates agrega con id y status pending, dedupe por sección+texto y corta en 8", () => {
    const incoming = [
      { seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga, 1.2k seguidores" },
      { seccion: "3.5", texto: "  cuenta nueva @IdentidadVerdolaga, 1.2k seguidores  " },
      { seccion: "9", texto: "" },
      ...Array.from({ length: 9 }, (_, i) => ({ seccion: "7", texto: `regla ${i}` })),
    ];
    const out = mergeBriefUpdates(EMPTY_BRIEF, incoming, NOW);
    expect(out.pendingUpdates).toHaveLength(8);
    expect(out.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", status: "pending", reportAt: NOW });
    expect(out.pendingUpdates?.[0].id).toBeTruthy();
    expect(out.pendingUpdates?.map((u) => u.texto)).toEqual([
      "Cuenta nueva @identidadverdolaga, 1.2k seguidores",
      "regla 0", "regla 1", "regla 2", "regla 3", "regla 4", "regla 5", "regla 6",
    ]);
  });

  it("mergeBriefUpdates no repite una propuesta ya resuelta", () => {
    const b1 = mergeBriefUpdates(EMPTY_BRIEF, [{ seccion: "7", texto: "regla nueva" }], NOW);
    const b2 = setBriefUpdateStatus(b1, b1.pendingUpdates![0].id, "dismissed");
    const b3 = mergeBriefUpdates(b2, [{ seccion: "7", texto: "Regla nueva" }], "2026-08-26T00:00:00.000Z");
    expect(b3.pendingUpdates).toHaveLength(1);
    expect(b3.pendingUpdates?.[0].status).toBe("dismissed");
  });

  it("mergeBriefUpdates poda las resueltas más viejas dejando 200; las pendientes nunca se podan", () => {
    const oldPending = { id: "p-old", seccion: "1", texto: "pendiente vieja", reportAt: "2026-01-01T00:00:00.000Z", status: "pending" as const };
    const resolved = Array.from({ length: 205 }, (_, i) => ({
      id: `r${i}`, seccion: "7", texto: `resuelta ${i}`, reportAt: `2026-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      status: (i % 2 ? "accepted" : "dismissed") as "accepted" | "dismissed",
    }));
    const b: ClientBrief = { ...EMPTY_BRIEF, pendingUpdates: [oldPending, ...resolved] };
    const out = mergeBriefUpdates(b, [{ seccion: "9", texto: "nueva" }], NOW);
    const pendientes = out.pendingUpdates!.filter((u) => u.status === "pending");
    const resueltas = out.pendingUpdates!.filter((u) => u.status !== "pending");
    expect(pendientes.map((u) => u.id)).toEqual(["p-old", pendientes[1].id]);
    expect(resueltas).toHaveLength(200);
    expect(resueltas[0].id).toBe("r5");
    expect(resueltas[199].id).toBe("r204");
    expect(b.pendingUpdates).toHaveLength(206);
  });

  it("setBriefUpdateStatus cambia solo la indicada", () => {
    const b = mergeBriefUpdates(EMPTY_BRIEF, [{ seccion: "a", texto: "1" }, { seccion: "b", texto: "2" }], NOW);
    const out = setBriefUpdateStatus(b, b.pendingUpdates![1].id, "accepted");
    expect(out.pendingUpdates?.map((u) => u.status)).toEqual(["pending", "accepted"]);
  });

  it("getClientBrief normaliza con zod: maestro inválido y propuestas rotas se descartan", async () => {
    stored = {
      entries: [],
      master: { text: 42, updatedAt: NOW, by: "a" },
      pendingUpdates: [
        { id: "u1", seccion: "7", texto: "regla", reportAt: NOW, status: "pending" },
        { id: "u2", seccion: "7", texto: "", reportAt: NOW, status: "pending" },
        { id: "u3", seccion: "7", texto: "otra", reportAt: NOW, status: "raro" },
      ],
    };
    const b = await getClientBrief("p1");
    expect(b.master).toBeUndefined();
    expect(b.pendingUpdates).toEqual([{ id: "u1", seccion: "7", texto: "regla", reportAt: NOW, status: "pending" }]);
  });

  it("getClientBrief acepta un maestro válido", async () => {
    stored = { entries: [], master: { text: "# BRIEF", updatedAt: NOW, by: "ana@x.ar" } };
    expect((await getClientBrief("p1")).master).toEqual({ text: "# BRIEF", updatedAt: NOW, by: "ana@x.ar" });
  });
});
