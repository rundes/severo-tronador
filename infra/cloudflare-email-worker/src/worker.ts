// Cloudflare Email Worker — recibe mail dirigido a @tronador.net.ar
// (vía Cloudflare Email Routing) y lo postea con HMAC al webhook
// Vercel /api/webhooks/mail-in. Replaces Stalwart cuando montamos
// stack open-source serverless (Plan 04 F5 alternativo).
//
// Docs API: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/

interface Env {
  VERCEL_WEBHOOK_URL: string;
  MAIL_INBOUND_SECRET: string;
}

interface CloudflareEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream;
  rawSize: number;
  headers: Headers;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  setReject(reason: string): void;
}

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let read;
  while (!(read = await reader.read()).done) {
    out += decoder.decode(read.value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async email(message: CloudflareEmailMessage, env: Env): Promise<void> {
    // Tope defensivo: Cloudflare permite hasta 25MB; nuestros replies
    // no deberían pasar de 1MB. Más arriba, rechazamos.
    if (message.rawSize > 5 * 1024 * 1024) {
      message.setReject("Message exceeds 5MB limit");
      return;
    }

    const raw = await streamToString(message.raw);
    const body = JSON.stringify({
      from: message.from,
      to: message.to,
      raw,
    });
    const sig = await hmacSha256Hex(env.MAIL_INBOUND_SECRET, body);

    const res = await fetch(env.VERCEL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tronador-signature": `sha256=${sig}`,
        "user-agent": "tronador-mail-worker/1.0",
      },
      body,
    });

    if (!res.ok) {
      // Si Vercel responde error, no rechazamos el mail: Cloudflare
      // hace retry exponencial por su cuenta si lanzamos. Throwing
      // → mail vuelve a la cola del routing.
      const detail = await res.text();
      throw new Error(`Vercel webhook ${res.status}: ${detail.slice(0, 200)}`);
    }
  },
};
