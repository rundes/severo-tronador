// CRUD + publicación de encuestas. Patrón calcado de lib/survey.ts y
// lib/campaigns.ts: Supabase directo (camelCase↔snake_case explícito) con
// fallback en memoria (globalThis) para dev/tests sin DB.
import { randomUUID } from "crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import {
  type Encuesta,
  type EncuestaEstado,
  type Question,
  validateQuestions,
} from "@/lib/encuestas/types";
import { normalizeLayout } from "@/lib/encuestas/layouts";

interface EncuestaRow {
  id: string;
  project_id: string;
  titulo: string;
  descripcion: string | null;
  slug: string | null;
  estado: EncuestaEstado;
  layout: string | null;
  preguntas: Question[];
  published_at: string | null;
  created_at: string;
}

const g = globalThis as unknown as { __encuestas?: EncuestaRow[] };
const mem = (g.__encuestas ??= []);

function rowToEncuesta(r: EncuestaRow): Encuesta {
  return {
    id: r.id,
    projectId: r.project_id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    slug: r.slug,
    estado: r.estado,
    layout: normalizeLayout(r.layout),
    preguntas: Array.isArray(r.preguntas) ? r.preguntas : [],
    publishedAt: r.published_at,
    createdAt: r.created_at,
  };
}

function slugify(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes (combining marks)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
  return `${base || "encuesta"}-${suffix}`;
}

// ---- API ----

export async function listEncuestas(projectId: string): Promise<Encuesta[]> {
  if (!dbConfigured()) {
    return mem
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(rowToEncuesta);
  }
  const { data, error } = await getSupabase()
    .from("encuestas")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as EncuestaRow[]).map(rowToEncuesta);
}

export async function getEncuesta(
  projectId: string,
  id: string,
): Promise<Encuesta | null> {
  if (!dbConfigured()) {
    const r = mem.find((x) => x.id === id && x.project_id === projectId);
    return r ? rowToEncuesta(r) : null;
  }
  const { data } = await getSupabase()
    .from("encuestas")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? rowToEncuesta(data as EncuestaRow) : null;
}

// Público (path sin cookie): el slug es único global, no se filtra por proyecto.
export async function getEncuestaBySlug(slug: string): Promise<Encuesta | null> {
  if (!dbConfigured()) {
    const r = mem.find((x) => x.slug?.toLowerCase() === slug.toLowerCase());
    return r ? rowToEncuesta(r) : null;
  }
  const { data } = await getSupabase()
    .from("encuestas")
    .select("*")
    .ilike("slug", slug)
    .maybeSingle();
  return data ? rowToEncuesta(data as EncuestaRow) : null;
}

export async function createEncuesta(
  projectId: string,
  input: { titulo: string; descripcion?: string | null; layout?: string },
): Promise<Encuesta> {
  const now = new Date().toISOString();
  const base: Omit<EncuestaRow, "id"> = {
    project_id: projectId,
    titulo: input.titulo.trim(),
    descripcion: input.descripcion?.trim() || null,
    slug: null,
    estado: "borrador",
    layout: normalizeLayout(input.layout),
    preguntas: [],
    published_at: null,
    created_at: now,
  };
  if (!dbConfigured()) {
    const row: EncuestaRow = { id: randomUUID(), ...base };
    mem.unshift(row);
    return rowToEncuesta(row);
  }
  const { data, error } = await getSupabase()
    .from("encuestas")
    .insert(base)
    .select()
    .single();
  if (error) throw error;
  return rowToEncuesta(data as EncuestaRow);
}

export async function updateEncuesta(
  projectId: string,
  id: string,
  patch: {
    titulo?: string;
    descripcion?: string | null;
    preguntas?: Question[];
    layout?: string;
  },
): Promise<Encuesta | null> {
  if (patch.preguntas) {
    const err = validateQuestions(patch.preguntas);
    if (err) throw new Error(err);
  }
  const upd: Partial<EncuestaRow> = {};
  if (patch.titulo !== undefined) upd.titulo = patch.titulo.trim();
  if (patch.descripcion !== undefined)
    upd.descripcion = patch.descripcion?.trim() || null;
  if (patch.preguntas !== undefined) upd.preguntas = patch.preguntas;
  if (patch.layout !== undefined) upd.layout = normalizeLayout(patch.layout);

  if (!dbConfigured()) {
    const r = mem.find((x) => x.id === id && x.project_id === projectId);
    if (!r) return null;
    Object.assign(r, upd);
    return rowToEncuesta(r);
  }
  const { data, error } = await getSupabase()
    .from("encuestas")
    .update(upd)
    .eq("id", id)
    .eq("project_id", projectId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEncuesta(data as EncuestaRow) : null;
}

export async function publishEncuesta(
  projectId: string,
  id: string,
): Promise<Encuesta | null> {
  const enc = await getEncuesta(projectId, id);
  if (!enc) return null;
  const err = validateQuestions(enc.preguntas);
  if (err) throw new Error(err);
  const slug = enc.slug ?? slugify(enc.titulo);
  const upd: Partial<EncuestaRow> = {
    estado: "publicada",
    slug,
    published_at: new Date().toISOString(),
  };
  if (!dbConfigured()) {
    const r = mem.find((x) => x.id === id && x.project_id === projectId);
    if (!r) return null;
    Object.assign(r, upd);
    return rowToEncuesta(r);
  }
  const { data, error } = await getSupabase()
    .from("encuestas")
    .update(upd)
    .eq("id", id)
    .eq("project_id", projectId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEncuesta(data as EncuestaRow) : null;
}

export async function closeEncuesta(
  projectId: string,
  id: string,
): Promise<Encuesta | null> {
  if (!dbConfigured()) {
    const r = mem.find((x) => x.id === id && x.project_id === projectId);
    if (!r) return null;
    r.estado = "cerrada";
    return rowToEncuesta(r);
  }
  const { data, error } = await getSupabase()
    .from("encuestas")
    .update({ estado: "cerrada" })
    .eq("id", id)
    .eq("project_id", projectId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEncuesta(data as EncuestaRow) : null;
}

// Helper para tests.
export function _clearEncuestasMem() {
  mem.length = 0;
}
