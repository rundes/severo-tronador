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
