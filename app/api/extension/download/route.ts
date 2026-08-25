// Descarga de la extensión de Chrome como .zip, desde el panel.
//
// Antes la única vía era "carpeta infra/escucha-extension del repo", que
// presupone acceso al código. Ahora cualquier miembro del proyecto la baja
// desde Escucha → Informe, la descomprime y la carga en chrome://extensions
// ("Cargar descomprimida"). Los archivos se empaquetan en cada request desde
// el filesystem del deploy (ver outputFileTracingIncludes en next.config.ts).
//
// GET /api/extension/download → escucha-extension.zip
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getActiveProject } from "@/lib/workspace";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const EXTENSION_DIR = path.join(process.cwd(), "infra", "escucha-extension");
const ZIP_ROOT = "escucha-extension";

async function collectFiles(dir: string, rel = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await collectFiles(path.join(dir, e.name), r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export async function GET() {
  const active = await getActiveProject();
  if (!active) {
    return NextResponse.json({ error: "no_project" }, { status: 403 });
  }

  try {
    const files = await collectFiles(EXTENSION_DIR);
    if (!files.includes("manifest.json")) {
      throw new Error(`manifest.json ausente en ${EXTENSION_DIR}`);
    }
    const zip = new JSZip();
    for (const rel of files) {
      zip.file(`${ZIP_ROOT}/${rel}`, await readFile(path.join(EXTENSION_DIR, rel)));
    }
    const body = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    return new NextResponse(body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${ZIP_ROOT}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    log.error("extension.download.failed", { error: (e as Error).message });
    return NextResponse.json({ error: "zip_failed" }, { status: 500 });
  }
}
