import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

let role: "owner" | "editor" | "viewer" = "owner";
vi.mock("@/lib/workspace", () => ({
  requireMember: async (min: string) => {
    if (min === "owner" && role !== "owner") throw new Error("forbidden");
    return { id: "p1", nombre: "Ferro", role };
  },
  requireProject: async () => ({ id: "p1", nombre: "Ferro", role }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));

const issueMcpToken = vi.fn(async () => "p1.deadbeef");
vi.mock("@/lib/mcp-token", async (orig) => ({
  ...(await orig<typeof import("@/lib/mcp-token")>()),
  issueMcpToken: (...a: unknown[]) => issueMcpToken(...(a as [])),
}));

let link: import("@/lib/claude-link").ClaudeLink = {};
const saveClaudeLink = vi.fn(async (_p: string, l: typeof link) => { link = l; });
vi.mock("@/lib/claude-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/claude-link")>()),
  readClaudeLink: async () => link,
  saveClaudeLink: (p: string, l: typeof link) => saveClaudeLink(p, l),
}));

const importReport = vi.fn(async () => ({ at: "2026-08-26T15:30:00.000Z", titulo: "T", secciones: 4, briefUpdates: 1, mailSent: true }));
vi.mock("@/lib/report-import", async (orig) => ({
  ...(await orig<typeof import("@/lib/report-import")>()),
  importReport: (...a: unknown[]) => importReport(...(a as [])),
}));

import { generarUrlMcp, vincularConversacion, importarInforme } from "@/app/(dashboard)/escucha/actions";

// Las actions terminan en redirect(), que en producción lanza. El mock hace lo
// mismo: capturar el throw es la forma de leer a dónde redirigió.
async function run(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message.replace(/^REDIRECT:/, "");
  }
}

const file = (name: string, body: string) => new File([body], name, { type: name.endsWith(".html") ? "text/html" : "text/markdown" });

describe("generarUrlMcp", () => {
  beforeEach(() => { role = "owner"; issueMcpToken.mockClear(); });

  it("owner: emite el token y devuelve la URL completa del conector", async () => {
    const r = await generarUrlMcp();
    expect(issueMcpToken).toHaveBeenCalledWith("p1");
    expect(r.url).toMatch(/\/api\/mcp\/p1\.deadbeef\/mcp$/);
  });

  it("no owner: no emite nada", async () => {
    role = "editor";
    await expect(generarUrlMcp()).rejects.toThrow();
    expect(issueMcpToken).not.toHaveBeenCalled();
  });
});

describe("vincularConversacion", () => {
  beforeEach(() => { role = "editor"; link = {}; saveClaudeLink.mockClear(); });

  it("guarda la URL de claude.ai y vuelve con claude=1", async () => {
    const fd = new FormData();
    fd.set("conversationUrl", " https://claude.ai/chat/2f0c1f9a ");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude=1");
    expect(link.conversationUrl).toBe("https://claude.ai/chat/2f0c1f9a");
    expect(link.linkedAt).toBeTruthy();
  });

  it("URL de otro dominio: no guarda y avisa", async () => {
    const fd = new FormData();
    fd.set("conversationUrl", "https://chatgpt.com/c/x");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude_error=url");
    expect(saveClaudeLink).not.toHaveBeenCalled();
  });

  it("vacío: desvincula sin error", async () => {
    link = { conversationUrl: "https://claude.ai/chat/x", lastToolAt: "2026-08-26T00:00:00.000Z" };
    const fd = new FormData();
    fd.set("conversationUrl", "   ");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude=1");
    expect(link).toEqual({ lastToolAt: "2026-08-26T00:00:00.000Z" });
  });
});

describe("importarInforme", () => {
  beforeEach(() => { role = "editor"; importReport.mockClear(); importReport.mockResolvedValue({ at: "2026-08-26T15:30:00.000Z", titulo: "T", secciones: 4, briefUpdates: 1, mailSent: true }); });

  it("archivo .html: lo importa como html con origen import y mail activado", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.html", "<h1>Tesis</h1><p>Bajada</p>"));
    fd.set("enviarMail", "on");
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&importado=1");
    const [pid, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(pid).toBe("p1");
    expect(input.html).toContain("<h1>Tesis</h1>");
    expect(input.markdown).toBeUndefined();
    expect(input.origen).toBe("import");
    expect(input.enviarMail).toBe(true);
  });

  it("archivo .md: lo importa como markdown", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.md", "# Tesis\n\nBajada."));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&importado=1");
    const [, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.markdown).toContain("# Tesis");
    expect(input.html).toBeUndefined();
    // Sin el checkbox, no sale mail.
    expect(input.enviarMail).toBe(false);
  });

  it("texto pegado que empieza con <: se trata como HTML aunque no haya archivo", async () => {
    const fd = new FormData();
    fd.set("texto", "  <!doctype html><html><body><h1>T</h1><p>B</p></body></html>");
    await run(() => importarInforme(fd));
    const [, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.html).toContain("<h1>T</h1>");
    expect(input.markdown).toBeUndefined();
  });

  it("texto pegado en markdown: se trata como markdown", async () => {
    const fd = new FormData();
    fd.set("texto", "# Tesis\n\nBajada.");
    await run(() => importarInforme(fd));
    const [, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.markdown).toBe("# Tesis\n\nBajada.");
  });

  it("nada cargado: no importa y avisa", async () => {
    expect(await run(() => importarInforme(new FormData()))).toBe("/escucha?tab=informe&informe_error=vacio");
    expect(importReport).not.toHaveBeenCalled();
  });

  it("por encima del límite: no importa y avisa", async () => {
    const fd = new FormData();
    fd.set("texto", "x".repeat(400_001));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&informe_error=grande");
    expect(importReport).not.toHaveBeenCalled();
  });

  it("archivo con extensión que no es informe: ni siquiera lo lee", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.pdf", "%PDF-1.7"));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&informe_error=tipo");
    expect(importReport).not.toHaveBeenCalled();
  });

  it("archivo .txt: entra como markdown", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.txt", "# Tesis\n\nBajada."));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&importado=1");
    const [, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.markdown).toContain("# Tesis");
  });

  it("archivo por encima del tope: se rechaza por size, sin leerlo a memoria", async () => {
    const grande = file("informe.md", "x");
    // El archivo real pesaría 400 KB: se falsea el size para no construirlo.
    Object.defineProperty(grande, "size", { value: 400_001 });
    const leer = vi.spyOn(grande, "text");
    const fd = new FormData();
    fd.set("archivo", grande);
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&informe_error=grande");
    expect(leer).not.toHaveBeenCalled();
    expect(importReport).not.toHaveBeenCalled();
  });

  it("si la importación falla, vuelve un código y el mensaje queda en el log", async () => {
    const casos: [string, string][] = [
      ["El informe no tiene ninguna sección reconocible", "invalido"],
      ["Fecha inválida: ayer", "invalido"],
      ["Mandá markdown o html: llegaron los dos vacíos", "vacio"],
      ["El informe supera los 400000 caracteres", "grande"],
      ["cualquier cosa rara de adentro", "invalido"],
    ];
    for (const [mensaje, codigo] of casos) {
      importReport.mockRejectedValueOnce(new Error(mensaje));
      const fd = new FormData();
      fd.set("texto", "# T\n\nB.");
      expect(await run(() => importarInforme(fd))).toBe(`/escucha?tab=informe&informe_error=${codigo}`);
    }
  });
});
