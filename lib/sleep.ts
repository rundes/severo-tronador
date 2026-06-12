// Pausa no bloqueante. ms <= 0 resuelve de inmediato (sin agendar timer).
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
