// Opt-out global cross-channel. Regla dura: una baja saca a la persona de
// TODOS los canales y se respeta para siempre (ARCHITECTURE §5.5). Se consulta
// ANTES de cada envío, en la cola.
// F6: store en memoria; en producción es la hoja `opt_outs`.
export interface OptOut {
  dni: string;
  at: string;
  reason?: string;
}

type Store = Map<string, OptOut>;
const g = globalThis as unknown as { __optOuts?: Store };
const store: Store = (g.__optOuts ??= new Map());

export function optOut(dni: string, reason?: string): OptOut {
  const existing = store.get(dni);
  if (existing) return existing; // no expira, no se pisa
  const rec: OptOut = { dni, at: new Date().toISOString(), reason };
  store.set(dni, rec);
  return rec;
}

export function isOptedOut(dni: string): boolean {
  return store.has(dni);
}

export function listOptOuts(): OptOut[] {
  return [...store.values()].sort((a, b) => b.at.localeCompare(a.at));
}
