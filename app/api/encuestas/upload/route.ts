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
  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "tipo_invalido" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "demasiado_grande" }, { status: 413 });
  }

  await ensureBucket();
  const path = `${projectId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    log.error("encuestas.upload.failed", { msg: error.message });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
