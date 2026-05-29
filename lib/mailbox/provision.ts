// Provisioning de cuenta @tronador.net.ar (Plan 04 F3).
// Si STALWART_URL + STALWART_ADMIN_TOKEN están seteados, intenta crear
// la cuenta vía Stalwart Admin API. Sin esos vars el provisioning corre
// en modo mock: genera la password local, persiste credencial y la UI
// queda igual de funcional (mock JMAP).
//
// Spec admin api: https://stalw.art/docs/api/management/account/create
import { randomBytes } from "node:crypto";
import { saveCredential } from "./credentials";

export interface ProvisionResult {
  ok: boolean;
  address: string;
  mode: "stalwart" | "mock";
  error?: string;
}

const DOMAIN = "tronador.net.ar";

// Deriva un local-part válido desde el email del usuario: "santi.foo@x"
// → "santi.foo". Sanitiza para que solo queden chars permitidos por RFC.
function localPartFor(email: string): string {
  const left = email.split("@")[0] ?? "user";
  return left.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 32);
}

function makePassword(): string {
  return randomBytes(18).toString("base64").replace(/[+/=]/g, "").slice(0, 22);
}

export async function provisionMailbox(
  userEmail: string,
): Promise<ProvisionResult> {
  const local = localPartFor(userEmail);
  const address = `${local}@${DOMAIN}`;
  const password = makePassword();

  const live = process.env.STALWART_URL && process.env.STALWART_ADMIN_TOKEN;

  if (!live) {
    await saveCredential({ userEmail, address, password });
    return { ok: true, address, mode: "mock" };
  }

  try {
    const url = `${process.env.STALWART_URL}/api/principal`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STALWART_ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "individual",
        name: local,
        emails: [address],
        secrets: [password],
        quota: 5_000_000_000, // 5 GB
      }),
    });
    if (!res.ok && res.status !== 409) {
      const body = await res.text();
      return {
        ok: false,
        address,
        mode: "stalwart",
        error: `Stalwart HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    await saveCredential({ userEmail, address, password });
    return { ok: true, address, mode: "stalwart" };
  } catch (err) {
    return {
      ok: false,
      address,
      mode: "stalwart",
      error: (err as Error).message,
    };
  }
}
