import { createHmac, timingSafeEqual } from "node:crypto";

// AES-GCM con CONFIG_MASTER_KEY (32 bytes base64). Para credenciales de conectores.
function keyBytes(): Uint8Array {
  const b64 = process.env.CONFIG_MASTER_KEY;
  if (!b64) throw new Error("CONFIG_MASTER_KEY ausente");
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (bytes.length !== 32) {
    throw new Error("CONFIG_MASTER_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)");
  }
  return bytes;
}

async function importKey() {
  return crypto.subtle.importKey("raw", keyBytes() as unknown as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(), data);
  return Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString("base64");
}

export async function decryptJson<T = unknown>(enc: string): Promise<T> {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await importKey(), ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// Verifica HMAC-SHA256 hex de `body` contra `header` (formato "sha256=<hex>").
// Constant-time. Devuelve false si secret/header faltan o length difiere.
export function verifyHmacSha256(
  body: Buffer | string,
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!header || !secret) return false;
  const [scheme, hex] = header.split("=");
  if (scheme !== "sha256" || !hex) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  let a: Buffer;
  try {
    a = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Compara dos strings en tiempo constante. Devuelve false si lengths difieren.
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
