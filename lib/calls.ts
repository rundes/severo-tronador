// Registro manual de llamadas (ARCHITECTURE / PLAN F5): cuando un encuestador
// llama desde su celular, carga el resultado acá — no se necesita provider de
// voz. F9: store via repo (Supabase en prod, memoria en dev).
import { repo } from "@/lib/db";

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
  id?: string;
  dni: string;
  at: string; // ISO
  outcome: CallOutcome;
  notes?: string;
}

const r = () => repo<ManualCall>("llamadas", true);

export async function addManualCall(
  input: Omit<ManualCall, "at" | "id">,
): Promise<ManualCall> {
  return r().upsert({ ...input, at: new Date().toISOString() });
}

export async function listCallsFor(dni: string): Promise<ManualCall[]> {
  const all = await r().list();
  return all
    .filter((c) => c.dni === dni)
    .sort((a, b) => b.at.localeCompare(a.at));
}
