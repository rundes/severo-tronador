// Registro manual de llamadas (ARCHITECTURE / PLAN F5): cuando un encuestador
// llama desde su celular, carga el resultado acá — no se necesita provider de
// voz. F5: store en memoria; en producción es una hoja más.
export type CallOutcome =
  | "contactado"
  | "no_atendio"
  | "rechazo"
  | "numero_invalido";

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "contactado", label: "Contactado / respondió" },
  { value: "no_atendio", label: "No atendió" },
  { value: "rechazo", label: "Rechazó / no quiere" },
  { value: "numero_invalido", label: "Número inválido" },
];

export interface ManualCall {
  dni: string;
  at: string; // ISO
  outcome: CallOutcome;
  notes?: string;
}

type Store = ManualCall[];
const g = globalThis as unknown as { __manualCalls?: Store };
const store: Store = (g.__manualCalls ??= []);

export function addManualCall(input: Omit<ManualCall, "at">): ManualCall {
  const call: ManualCall = { ...input, at: new Date().toISOString() };
  store.push(call);
  return call;
}

export function listCallsFor(dni: string): ManualCall[] {
  return store
    .filter((c) => c.dni === dni)
    .sort((a, b) => b.at.localeCompare(a.at));
}
