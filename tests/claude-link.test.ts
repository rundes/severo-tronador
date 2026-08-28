import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
const maybeSingle = vi.fn().mockResolvedValue({ data: null });
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import {
  isClaudeConversationUrl,
  readClaudeLink,
  saveClaudeLink,
  touchClaudeLink,
} from "@/lib/claude-link";

const PID = "b06f7ba4-3e3e-4392-bde9-a0df600f3cf2";

describe("isClaudeConversationUrl", () => {
  it("acepta conversaciones de claude.ai por https", () => {
    expect(isClaudeConversationUrl("https://claude.ai/chat/2f0c1f9a-6d4e-4f0b-9a1e-3c5b7d9e0a11")).toBe(true);
    expect(isClaudeConversationUrl("https://www.claude.ai/chat/abc")).toBe(true);
    expect(isClaudeConversationUrl("  https://claude.ai/recents  ")).toBe(true);
  });

  it("rechaza cualquier otro host, esquema o basura", () => {
    for (const bad of [
      "",
      "claude.ai/chat/abc",
      "http://claude.ai/chat/abc",
      "https://claude.ai.evil.com/chat/abc",
      "https://chatgpt.com/c/abc",
      "javascript:alert(1)",
      `https://claude.ai/chat/${"a".repeat(600)}`,
    ]) {
      expect(isClaudeConversationUrl(bad)).toBe(false);
    }
  });
});

describe("claude-link persistencia", () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: null });
  });

  it("read: sin fila devuelve el vínculo vacío", async () => {
    expect(await readClaudeLink(PID)).toEqual({});
  });

  it("read: descarta campos que no son string (la fila es JSON libre)", async () => {
    maybeSingle.mockResolvedValue({
      data: { config: { conversationUrl: 42, client: "Claude in Chrome", lastToolAt: "2026-08-28T10:00:00.000Z", basura: true } },
    });
    expect(await readClaudeLink(PID)).toEqual({
      client: "Claude in Chrome",
      lastToolAt: "2026-08-28T10:00:00.000Z",
    });
  });

  it("save: escribe en claude-link:<pid> con project_id null", async () => {
    await saveClaudeLink(PID, { conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-28T10:00:00.000Z" });
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`claude-link:${PID}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
    expect(row.config).toEqual({ conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-28T10:00:00.000Z" });
  });

  it("touch: conserva la conversación y pisa lastToolAt + client", async () => {
    maybeSingle.mockResolvedValue({
      data: { config: { conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-01T00:00:00.000Z", client: "viejo" } },
    });
    await touchClaudeLink(PID, "Claude in Chrome 1.2", { at: "2026-08-28T12:00:00.000Z" });
    expect(upsert.mock.calls[0][0].config).toEqual({
      conversationUrl: "https://claude.ai/chat/x",
      linkedAt: "2026-08-01T00:00:00.000Z",
      client: "Claude in Chrome 1.2",
      lastToolAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("touch con report: además marca lastReportAt", async () => {
    await touchClaudeLink(PID, "Claude Code", { at: "2026-08-28T12:00:00.000Z", report: true });
    expect(upsert.mock.calls[0][0].config).toMatchObject({
      client: "Claude Code",
      lastToolAt: "2026-08-28T12:00:00.000Z",
      lastReportAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("touch: una falla de DB no explota (es telemetría, no el trabajo)", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(touchClaudeLink(PID, "Claude Code")).resolves.toBeUndefined();
  });
});
