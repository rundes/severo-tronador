// Detección de señales anti-bloqueo (spec §3.4) del lado del plugin. Ante
// cualquiera de estas, se corta la plataforma en el acto y se reporta al
// server (que aplica el cooldown). Nunca se reintenta en la misma corrida.
//
// En las plataformas DOM (X/FB/TikTok) el bloqueo no llega como status: llega
// como muro de login o pantalla de error adentro de un 200. Por eso el content
// script manda `body` y acá también se buscan esos textos.

const HARD = /\/challenge\/|\/checkpoint|captcha/i;
const LOGIN = /\/i\/flow\/login|inicia sesi[oó]n|log in to x/i;
const SOFT_ERROR = /try again later|intent[aá] m[aá]s tarde|something went wrong|algo sali[oó] mal/i;

// Devuelve una señal del enum de lib/monitor-breaker (el server la valida) o null.
export function signalFromResponse(status, bodyText) {
  if (status === 429) return "http_429";
  if (status === 401 || status === 403) return "http_401_403";
  const t = (bodyText || "").slice(0, 4000);
  if (HARD.test(t)) {
    return /captcha/i.test(t) ? "captcha" : "checkpoint";
  }
  // Muro de login: la sesión se cayó o nos la cortaron. Mismo trato que un 401.
  if (LOGIN.test(t)) return "http_401_403";
  if (SOFT_ERROR.test(t)) return "try_later";
  return null;
}
