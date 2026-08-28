// Token bucket en memoria: 60 req/min por clave (spec §1). La ruta lo llama
// dos veces por request, con dos claves distintas: `ip:<ip>` antes de verificar
// el token (barato, frena bucles y sondeos) y el token del conector después.
//
// CAVEAT SERVERLESS: el contador vive en la memoria de la instancia. En Vercel
// hay varias instancias y se reciclan, así que el límite real es "60/min por
// instancia", no global — alcanza para frenar un bucle de un cliente MCP
// enloquecido, que es para lo que está, y no pretende ser una defensa contra
// un atacante distribuido. Si alguna vez hace falta el límite duro, va con
// Upstash/Redis; hoy no se justifica la dependencia.
import { createHash } from "node:crypto";

export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;

// Tope a partir del cual se barren los baldes vencidos. La clave `ip:` llega
// ANTES de verificar el token, así que cualquiera puede crear entradas: sin el
// barrido el Map crece con cada IP que golpea la ruta. Ojo con lo que el
// barrido NO hace: solo borra baldes vencidos, así que 1000 claves activas
// dentro de la misma ventana dejan el Map por encima del tope hasta que la
// ventana rota. Es un techo blando a propósito — un techo duro tendría que
// desalojar baldes vivos, y eso es justamente regalar el límite al atacante.
const MAX_BUCKETS = 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

// La clave es una credencial (el token del conector) o un dato personal (la
// IP). El balde solo necesita identidad, no el valor, y el Map vive en memoria
// de un proceso que puede terminar en un heap dump o en un reporte de error:
// guardamos el hash y listo.
function bucketKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function rateLimitOk(key: string, now = Date.now()): boolean {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const hashed = bucketKey(key);
  const b = buckets.get(hashed);
  if (!b || b.resetAt <= now) {
    buckets.set(hashed, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT) return false;
  buckets.set(hashed, { count: b.count + 1, resetAt: b.resetAt });
  return true;
}
