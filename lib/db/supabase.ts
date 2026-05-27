import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

// Cliente service-role (solo server). Single-tenant, sin RLS.
export function getSupabase(): SupabaseClient {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  if (!cached) {
    cached = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return cached;
}
