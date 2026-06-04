"use server";

// Acciones de proyectos: crear y cambiar el proyecto activo (cookie).
// La gestión de miembros (invitar/rol/quitar) se suma en Fase 5.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createProject,
  getMembership,
  addMember,
  updateRole,
  removeMember,
  renameProject,
  type Role,
} from "@/lib/projects";
import { ACTIVE_PROJECT_COOKIE, requireMember } from "@/lib/workspace";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

async function sessionEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

// Cambia el proyecto activo (valida membresía antes de setear la cookie).
export async function setActiveProject(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const email = await sessionEmail();
  if (!email || !projectId) redirect("/proyectos?error=invalid");
  const member = await getMembership(projectId, email);
  if (!member) redirect("/proyectos?error=forbidden");
  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, projectId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Crea un proyecto nuevo (el creador queda owner) y lo deja activo.
export async function crearProyecto(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = await sessionEmail();
  if (!email) redirect("/onboarding?error=auth");
  if (nombre.length < 2) redirect("/onboarding?error=nombre");
  const proj = await createProject({ nombre, ownerEmail: email });
  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, proj.id, COOKIE_OPTS);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ── Gestión de miembros del proyecto ACTIVO (solo owner) ─────────────────

function parseRole(v: unknown): Role {
  return v === "owner" || v === "editor" || v === "viewer" ? v : "viewer";
}

export async function invitarMiembro(formData: FormData) {
  const { id: projectId } = await requireMember("owner");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  if (!email || !email.includes("@")) redirect("/proyectos?error=email");
  await addMember(projectId, email, role);
  revalidatePath("/proyectos");
  redirect("/proyectos?ok=invite");
}

export async function cambiarRol(formData: FormData) {
  const { id: projectId } = await requireMember("owner");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  if (!email) redirect("/proyectos?error=email");
  await updateRole(projectId, email, role);
  revalidatePath("/proyectos");
  redirect("/proyectos?ok=rol");
}

export async function quitarMiembro(formData: FormData) {
  const { id: projectId } = await requireMember("owner");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/proyectos?error=email");
  await removeMember(projectId, email);
  revalidatePath("/proyectos");
  redirect("/proyectos?ok=quitar");
}

export async function renombrarProyecto(formData: FormData) {
  const { id: projectId } = await requireMember("owner");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (nombre.length < 2) redirect("/proyectos?error=nombre");
  await renameProject(projectId, nombre);
  revalidatePath("/", "layout");
  redirect("/proyectos?ok=rename");
}
