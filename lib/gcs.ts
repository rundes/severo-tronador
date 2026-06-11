// Google Cloud Storage: firma URLs de lectura para reproducir los audios de
// radio guardados en gs://<bucket>/radios/... Server-only. La service-account
// va en env GCS_SERVICE_ACCOUNT_KEY (JSON). Sin credenciales → null (mock).
import { Storage } from "@google-cloud/storage";

const BUCKET = process.env.GCS_BUCKET || "maipu-pba";

let cached: Storage | null | undefined;
function getStorage(): Storage | null {
  if (cached !== undefined) return cached;
  const raw = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    const creds = JSON.parse(raw) as { project_id?: string };
    cached = new Storage({ projectId: creds.project_id, credentials: creds as object });
  } catch {
    cached = null;
  }
  return cached;
}

export function gcsConfigured(): boolean {
  return getStorage() !== null;
}

// URL firmada V4 de lectura (válida `expiresSec`). null si no hay credenciales
// o el objeto es inválido.
export async function signedReadUrl(object: string, expiresSec = 3600): Promise<string | null> {
  const storage = getStorage();
  if (!storage || !object) return null;
  try {
    const [url] = await storage
      .bucket(BUCKET)
      .file(object)
      .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + expiresSec * 1000 });
    return url;
  } catch {
    return null;
  }
}
