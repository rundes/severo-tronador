import { dbConfigured } from "@/lib/db/supabase";

// Datos demo (mock) solo en dev local (sin Supabase). En producción una fuente
// sin credenciales devuelve vacío en vez de mock, para no mezclar datos falsos
// en la Escucha real.
export function demoData(): boolean {
  return !dbConfigured();
}
