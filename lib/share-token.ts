// Tokens firmados para tableros embebidos públicos (Plan 03 F6.3).
// HMAC-SHA256 con CONFIG_MASTER_KEY (32 bytes ya configurados para el
// AES-GCM de credenciales). Devuelven base64url(payload + signature).
//
// Formato: <payload-b64url>.<signature-b64url>
//   payload = JSON { t: "campaign"|"dashboard", id?: string, exp: number }
//
// Sin renovación automática: el operador genera un link con duración
// explícita (1 día, 7 días, 30 días). Para revocar, regenerar
// CONFIG_MASTER_KEY (todas las links rompen).

import { createHmac, timingSafeEqual } from "node:crypto";

export type ShareScope = "campaign" | "dashboard";

export interface SharePayload {
  t: ShareScope;
  id?: string; // campaign_id si t=campaign
  exp: number; // ms epoch
}

function keyBytes(): Buffer {
  const b64 = process.env.CONFIG_MASTER_KEY;
  if (!b64) throw new Error("CONFIG_MASTER_KEY no configurado");
  return Buffer.from(b64, "base64");
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function signShareToken(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64url(Buffer.from(json, "utf8"));
  const sig = createHmac("sha256", keyBytes()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export interface VerifyResult {
  ok: boolean;
  payload?: SharePayload;
  reason?: "bad_format" | "bad_signature" | "expired" | "no_key";
}

export function verifyShareToken(token: string, now = Date.now()): VerifyResult {
  if (!process.env.CONFIG_MASTER_KEY) return { ok: false, reason: "no_key" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "bad_format" };
  const [payloadB64, sigB64] = parts;
  try {
    const expected = createHmac("sha256", keyBytes())
      .update(payloadB64)
      .digest();
    const provided = fromB64url(sigB64);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return { ok: false, reason: "bad_signature" };
    }
    const payload = JSON.parse(
      fromB64url(payloadB64).toString("utf8"),
    ) as SharePayload;
    if (payload.exp < now) return { ok: false, reason: "expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "bad_format" };
  }
}

// Duraciones predefinidas en ms.
export const SHARE_DURATIONS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;
