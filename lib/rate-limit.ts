// Rate limit por clave, en memoria del proceso. Ventana deslizante simple.
//
// No es un limitador distribuido: en serverless cada instancia lleva su propio
// contador, así que el techo real es N_instancias × límite. Alcanza para lo que
// tiene que frenar acá — que una acción de envío puntual (pruebas de encuesta,
// mails sueltos) se convierta en un canal de spam desde el panel —, no para
// proteger un endpoint público de alto volumen. Para eso hace falta Redis o el
// rate limit del propio proveedor.
const g = globalThis as unknown as { __rateBuckets?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__rateBuckets ??= new Map());

export interface RateLimitResult {
  ok: boolean;
  // Segundos hasta que se libere un cupo. 0 cuando ok.
  retryAfterSeconds: number;
}

// Consume un cupo de `key`. Devuelve ok=false si ya se agotaron `limit` intentos
// en los últimos `windowMs`.
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    const oldest = hits[0];
    buckets.set(key, hits);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSeconds: 0 };
}

// Sólo para tests: vacía el estado entre casos.
export function resetRateLimits(): void {
  buckets.clear();
}
