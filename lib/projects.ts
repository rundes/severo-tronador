// Proyectos/workspaces (multi-tenant) — CRUD sobre projects + project_members.
// La identidad es el email de la sesión (sin user_id). Roles: owner > editor >
// viewer. Mismo patrón que lib/segments-store: getSupabase directo + fallback
// en memoria (globalThis) para dev/tests sin Supabase.
//
// Funciones PURAS (sin deps de Next) para que los tests puedan importarlas.
// La resolución del proyecto activo (cookie + sesión) vive en lib/workspace.ts.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

// Proyecto default (creado en migración 0017): aloja la data single-tenant
// previa y es el fallback cuando un caller aún no thread-ea project_id.
export const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

export type Role = "owner" | "editor" | "viewer";

export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

// True si `role` alcanza el nivel mínimo `min`.
export function roleAllows(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface Project {
  id: string;
  nombre: string;
  slug: string;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Membership {
  project_id: string;
  email: string;
  role: Role;
  created_at: string;
}

export type ProjectWithRole = Project & { role: Role };

interface Mem {
  __projects?: Project[];
  __projectMembers?: Membership[];
}
const g = globalThis as unknown as Mem;
const memProjects = (g.__projects ??= []);
const memMembers = (g.__projectMembers ??= []);

function slugify(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "proyecto"}-${crypto.randomUUID().slice(0, 8)}`;
}

const lc = (e: string) => e.trim().toLowerCase();

// ── Lectura ──────────────────────────────────────────────────────────────

export async function listActiveProjects(): Promise<Project[]> {
  if (!dbConfigured()) {
    return memProjects.filter((p) => !p.archived_at);
  }
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | undefined> {
  if (!dbConfigured()) return memProjects.find((p) => p.id === id);
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? undefined) as Project | undefined;
}

// Proyectos (no archivados) de los que el email es miembro, con su rol.
export async function listProjectsForEmail(
  email: string,
): Promise<ProjectWithRole[]> {
  const e = lc(email);
  if (!dbConfigured()) {
    return memMembers
      .filter((m) => m.email === e)
      .map((m) => ({ project: memProjects.find((p) => p.id === m.project_id), role: m.role }))
      .filter((x): x is { project: Project; role: Role } => Boolean(x.project) && !x.project!.archived_at)
      .map(({ project, role }) => ({ ...project, role }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const sb = getSupabase();
  const { data: mems, error: mErr } = await sb
    .from("project_members")
    .select("project_id, role")
    .eq("email", e);
  if (mErr) throw mErr;
  const ids = (mems ?? []).map((m) => m.project_id as string);
  if (ids.length === 0) return [];
  const { data: projs, error: pErr } = await sb
    .from("projects")
    .select("*")
    .in("id", ids)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;
  const roleById = new Map((mems ?? []).map((m) => [m.project_id, m.role as Role]));
  return (projs ?? []).map((p) => ({
    ...(p as Project),
    role: roleById.get((p as Project).id) ?? "viewer",
  }));
}

export async function getMembership(
  projectId: string,
  email: string,
): Promise<Membership | undefined> {
  const e = lc(email);
  if (!dbConfigured()) {
    return memMembers.find((m) => m.project_id === projectId && m.email === e);
  }
  const { data, error } = await getSupabase()
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .eq("email", e)
    .maybeSingle();
  if (error) throw error;
  return (data ?? undefined) as Membership | undefined;
}

export async function listMembers(projectId: string): Promise<Membership[]> {
  if (!dbConfigured()) {
    return memMembers.filter((m) => m.project_id === projectId);
  }
  const { data, error } = await getSupabase()
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Membership[];
}

// ── Escritura ────────────────────────────────────────────────────────────

// Crea proyecto + membresía owner del creador, atómicamente desde la app.
export async function createProject(input: {
  nombre: string;
  ownerEmail: string;
}): Promise<Project> {
  const owner = lc(input.ownerEmail);
  if (!dbConfigured()) {
    const proj: Project = {
      id: crypto.randomUUID(),
      nombre: input.nombre,
      slug: slugify(input.nombre),
      created_by: owner,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    memProjects.push(proj);
    memMembers.push({
      project_id: proj.id,
      email: owner,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    return proj;
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from("projects")
    .insert({ nombre: input.nombre, slug: slugify(input.nombre), created_by: owner })
    .select()
    .single();
  if (error) throw error;
  const proj = data as Project;
  const { error: mErr } = await sb
    .from("project_members")
    .insert({ project_id: proj.id, email: owner, role: "owner" });
  if (mErr) throw mErr;
  return proj;
}

export async function addMember(
  projectId: string,
  email: string,
  role: Role,
): Promise<void> {
  const e = lc(email);
  if (!dbConfigured()) {
    const existing = memMembers.find((m) => m.project_id === projectId && m.email === e);
    if (existing) existing.role = role;
    else
      memMembers.push({
        project_id: projectId,
        email: e,
        role,
        created_at: new Date().toISOString(),
      });
    return;
  }
  const { error } = await getSupabase()
    .from("project_members")
    .upsert({ project_id: projectId, email: e, role }, { onConflict: "project_id,email" });
  if (error) throw error;
}

export async function updateRole(
  projectId: string,
  email: string,
  role: Role,
): Promise<void> {
  const e = lc(email);
  if (!dbConfigured()) {
    const m = memMembers.find((x) => x.project_id === projectId && x.email === e);
    if (m) m.role = role;
    return;
  }
  const { error } = await getSupabase()
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("email", e);
  if (error) throw error;
}

export async function removeMember(projectId: string, email: string): Promise<void> {
  const e = lc(email);
  if (!dbConfigured()) {
    const idx = memMembers.findIndex((m) => m.project_id === projectId && m.email === e);
    if (idx >= 0) memMembers.splice(idx, 1);
    return;
  }
  const { error } = await getSupabase()
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("email", e);
  if (error) throw error;
}

export async function renameProject(id: string, nombre: string): Promise<void> {
  if (!dbConfigured()) {
    const p = memProjects.find((x) => x.id === id);
    if (p) p.nombre = nombre;
    return;
  }
  const { error } = await getSupabase().from("projects").update({ nombre }).eq("id", id);
  if (error) throw error;
}
