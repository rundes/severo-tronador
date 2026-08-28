// Token bucket en memoria por token de conector: 60 req/min (spec §1).
//
// CAVEAT SERVERLESS: el contador vive en la memoria de la instancia. En Vercel
// hay varias instancias y se reciclan, así que el límite real es "60/min por
// instancia", no global — alcanza para frenar un bucle de un cliente MCP
// enloquecido, que es para lo que está, y no pretende ser una defensa contra
// un atacante distribuido. Si alguna vez hace falta el límite duro, va con
// Upstash/Redis; hoy no se justifica la dependencia.
export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;

// Tope de baldes vivos: sin esto un atacante que rota tokens inválidos haría
// crecer el Map sin techo. (Los tokens inválidos no llegan acá — la ruta
// verifica primero — pero el tope es barato y evita depender de eso.)
const MAX_BUCKETS = 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitOk(key: string, now = Date.now()): boolean {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT) return false;
  buckets.set(key, { count: b.count + 1, resetAt: b.resetAt });
  return true;
}
