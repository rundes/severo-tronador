// Detección de señales anti-bloqueo (spec §3.4) del lado del plugin. Ante
// cualquiera de estas, se corta la plataforma en el acto y se reporta al
// server (que aplica el cooldown). Nunca se reintenta en la misma corrida.

const CHALLENGE = /\/challenge\/|\/checkpoint|captcha|try again later|intent[aá] m[aá]s tarde/i;

export function signalFromResponse(status, bodyText) {
  if (status === 429) return "http_429";
  if (status === 401 || status === 403) return "http_401_403";
  const t = (bodyText || "").slice(0, 4000);
  if (CHALLENGE.test(t)) {
    return /captcha/i.test(t) ? "captcha" : /checkpoint|challenge/i.test(t) ? "checkpoint" : "try_later";
  }
  return null;
}
