import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

// El zip de la extensión tiene que ser PLANO: manifest.json en la raíz.
// Con una carpeta contenedora, "Extraer todo" de Windows anida
// Downloads\escucha-extension\escucha-extension\ y Chrome rechaza la carpeta
// de afuera con "Falta el archivo de manifiesto" (2026-08-25).
vi.mock("@/lib/workspace", () => ({
  getActiveProject: async () => ({ id: "p1", role: "owner" }),
}));

import { GET } from "@/app/api/extension/download/route";

describe("GET /api/extension/download", () => {
  it("devuelve un zip plano con manifest.json y el service worker en la raíz", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain('filename="escucha-extension.zip"');

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names).toContain("manifest.json");
    expect(names).toContain("sw.js");
    // Iconos declarados en el manifest (sin ellos Chrome muestra un cuadrado gris).
    expect(names).toContain("icons/icon128.png");
    expect(names).toContain("icons/icon16.png");
    expect(names.some((n) => n.startsWith("escucha-extension/"))).toBe(false);

    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.manifest_version).toBe(3);
  });
});
