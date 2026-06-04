// Resolución del proyecto activo del request. Lee el email de la sesión
// (NextAuth) + una cookie `active_project`, valida membresía, y cae al primer
// proyecto del usuario. `null` ⇒ el usuario no tiene proyectos (onboarding).
//
// Importa deps de Next (cookies/redirect) → NO importar desde tests; la lógica
// de roles pura vive en lib/projects.ts (roleAllows).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { authConfigured } from "@/lib/auth-guards";
import {
  listProjectsForEmail,
  roleAllows,
  DEFAULT_PROJECT_ID,
  type Role,
} from "@/lib/projects";

export const ACTIVE_PROJECT_COOKIE = "active_project";

export interface ActiveProject {
  id: string;
  nombre: string;
  role: Role;
}

async function sessionEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

// Memoizado por request (React cache): se llama en layout + páginas + actions
// sin repetir la query de membresía.
export const getActiveProject = cache(async (): Promise<ActiveProject | null> => {
  // Dev sin auth (y normalmente sin Supabase): no hay sesión ni membresías.
  // Devolvemos el proyecto default sintético para que el panel funcione en
  // modo mock sin mandar a onboarding.
  if (!authConfigured) {
    return { id: DEFAULT_PROJECT_ID, nombre: "Proyecto principal", role: "owner" };
  }
  const email = await sessionEmail();
  if (!email) return null;
  const projects = await listProjectsForEmail(email);
  if (projects.length === 0) return null;
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_PROJECT_COOKIE)?.value;
  const chosen =
    (cookieId && projects.find((p) => p.id === cookieId)) || projects[0];
  return { id: chosen.id, nombre: chosen.nombre, role: chosen.role };
});

// Lista de proyectos del usuario logueado (para el switcher).
export async function listMyProjects() {
  if (!authConfigured) {
    return [
      {
        id: DEFAULT_PROJECT_ID,
        nombre: "Proyecto principal",
        slug: "default",
        created_by: null,
        archived_at: null,
        created_at: "",
        role: "owner" as Role,
      },
    ];
  }
  const email = await sessionEmail();
  if (!email) return [];
  return listProjectsForEmail(email);
}

// Exige proyecto activo; si no hay, manda a onboarding.
export async function requireProject(): Promise<ActiveProject> {
  const p = await getActiveProject();
  if (!p) redirect("/onboarding");
  return p;
}

// Exige proyecto + rol mínimo; si el rol no alcanza, 403-ish vía redirect.
export async function requireMember(min: Role): Promise<ActiveProject> {
  const p = await requireProject();
  if (!roleAllows(p.role, min)) redirect("/proyectos?error=forbidden");
  return p;
}
