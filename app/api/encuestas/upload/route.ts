// Subida de imágenes de encuesta (portada / cierre) a Supabase Storage.
// El cliente manda el archivo ya recortado (blob) por multipart; el server
// (service-role) lo sube a un bucket público y devuelve la URL.
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSupabase, dbConfigured } from "@/lib/db/supabase";
import { requireProject } from "@/lib/workspace";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const BUCKET = "encuesta-img";
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

// Firma real del archivo, no el content-type que declara el cliente.
//
// `file.type` viene del navegador y es trivial de falsear: un .html renombrado
// con content-type image/png pasaba el chequeo y quedaba servido desde un bucket
// PÚBLICO. Los magic bytes están en el contenido.
//   PNG:  89 50 4E 47 0D 0A 1A 0A
//   JPEG: FF D8 FF
function sniffImage(bytes: Uint8Array): "png" | "jpg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  ) {
    return "jpg";
  }
  return null;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const sb = getSupabase();
  // Idempotente: si ya existe, ignoramos el error.
  await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg"],
  });
  bucketReady = true;
}

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "storage_no_configurado" }, { status: 503 });
  }
  const { id: projectId } = await requireProject();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "sin_archivo" }, { status: 400 });
  }
  // Descarte temprano por lo que declara el cliente: barato y filtra el 99% de
  // los errores honestos. La validación REAL es la firma del archivo, más abajo.
  if (!EXT[file.type]) {
    return NextResponse.json({ error: "tipo_invalido" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "demasiado_grande" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    log.warn("encuestas.upload.rechazado_por_firma", {
      declarado: file.type,
      size: file.size,
    });
    return NextResponse.json({ error: "tipo_invalido" }, { status: 415 });
  }

  await ensureBucket();
  // Extensión y content-type salen de la firma real, no de lo declarado.
  const realType = sniffed === "png" ? "image/png" : "image/jpeg";
  const path = `${projectId}/${randomUUID()}.${sniffed}`;
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: realType,
    upsert: false,
  });
  if (error) {
    log.error("encuestas.upload.failed", { msg: error.message });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
