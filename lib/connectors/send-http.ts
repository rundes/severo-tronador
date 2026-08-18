// Capa HTTP compartida por los conectores de envío (outreach).
//
// Antes cada conector hablaba con su proveedor a mano: sólo Resend clasificaba
// los fallos transitorios, así que un 429 de Meta/Brevo/Telegram quemaba la
// fila como si el envío hubiera sido rechazado para siempre; y ninguno ponía
// timeout, así que un proveedor colgado se comía el maxDuration de la función
// y se llevaba puesto el resto del lote.
import { fetchWithTimeout } from "@/lib/net/safe-fetch";
import type { SendResult } from "./types";

// Más holgado que el default de escucha (8s): un POST de envío puede tardar,
// pero tiene que cortar MUY por debajo del maxDuration=60 del cron para que un
// proveedor colgado no se lleve puesta la corrida entera.
export const SEND_TIMEOUT_MS = 15_000;

// 429 (rate limit), 408 (timeout del proveedor) y 5xx son transitorios: el cron
// reintenta con backoff. El resto (4xx de validación, auth) es un rechazo
// permanente y reintentarlo sólo gasta cuota.
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function sendFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetchWithTimeout(url, { ...init, timeoutMs: SEND_TIMEOUT_MS });
}

// Un error de red (timeout, ECONNRESET, DNS) no dice si el mensaje salió o no.
// Lo marcamos retryable igual: perder un envío en silencio es peor que el
// riesgo acotado de un duplicado, y MAX_ATTEMPTS lo limita a 3. Los conectores
// que soportan clave de idempotencia (Resend) eliminan ese riesgo del todo.
export function networkFailure(label: string, err: unknown): SendResult {
  const msg = err instanceof Error ? err.message : String(err);
  const aborted = err instanceof Error && err.name === "AbortError";
  return {
    ok: false,
    error: `${label} ${aborted ? `timeout tras ${SEND_TIMEOUT_MS}ms` : msg}`,
    retryable: true,
  };
}

// Telegram devuelve `parameters.retry_after` (segundos) cuando frena por flood
// control. Respetarlo evita reintentar contra una puerta cerrada y que el
// proveedor extienda el bloqueo.
export function parseRetryAfter(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.ceil(n);
}
