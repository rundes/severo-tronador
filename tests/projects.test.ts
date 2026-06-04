import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  roleAllows,
  createProject,
  listProjectsForEmail,
  listActiveProjects,
  getMembership,
  listMembers,
  addMember,
  updateRole,
  removeMember,
  renameProject,
} from "@/lib/projects";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(() => {
  const g = globalThis as unknown as {
    __projects?: unknown[];
    __projectMembers?: unknown[];
  };
  if (g.__projects) g.__projects.length = 0;
  if (g.__projectMembers) g.__projectMembers.length = 0;
});

describe("roleAllows (jerarquía de roles)", () => {
  it("owner alcanza todo, viewer solo viewer", () => {
    expect(roleAllows("owner", "viewer")).toBe(true);
    expect(roleAllows("owner", "editor")).toBe(true);
    expect(roleAllows("owner", "owner")).toBe(true);
    expect(roleAllows("editor", "viewer")).toBe(true);
    expect(roleAllows("editor", "owner")).toBe(false);
    expect(roleAllows("viewer", "editor")).toBe(false);
    expect(roleAllows("viewer", "viewer")).toBe(true);
  });
});

describe("createProject (memory)", () => {
  it("crea proyecto + membresía owner del creador", async () => {
    const p = await createProject({ nombre: "Estudio A", ownerEmail: "Ana@X.com" });
    expect(p.nombre).toBe("Estudio A");
    expect(p.slug).toMatch(/^estudio-a-[0-9a-f]{8}$/);
    const m = await getMembership(p.id, "ana@x.com");
    expect(m?.role).toBe("owner");
    // email se normaliza a lowercase
    expect(m?.email).toBe("ana@x.com");
  });
});

describe("listProjectsForEmail (aislamiento)", () => {
  it("cada email ve solo sus proyectos, con su rol", async () => {
    const a = await createProject({ nombre: "A", ownerEmail: "ana@x.com" });
    const b = await createProject({ nombre: "B", ownerEmail: "beto@x.com" });
    await addMember(b.id, "ana@x.com", "viewer");

    const anaP = await listProjectsForEmail("ana@x.com");
    expect(anaP.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(anaP.find((p) => p.id === a.id)?.role).toBe("owner");
    expect(anaP.find((p) => p.id === b.id)?.role).toBe("viewer");

    const betoP = await listProjectsForEmail("beto@x.com");
    expect(betoP.map((p) => p.id)).toEqual([b.id]);
  });

  it("no incluye proyectos donde no es miembro", async () => {
    await createProject({ nombre: "Solo Beto", ownerEmail: "beto@x.com" });
    expect(await listProjectsForEmail("ana@x.com")).toEqual([]);
  });
});

describe("membresía: add/update/remove", () => {
  it("addMember idempotente (actualiza rol si ya existe)", async () => {
    const p = await createProject({ nombre: "A", ownerEmail: "ana@x.com" });
    await addMember(p.id, "beto@x.com", "viewer");
    await addMember(p.id, "beto@x.com", "editor"); // re-add → update
    const members = await listMembers(p.id);
    expect(members.filter((m) => m.email === "beto@x.com")).toHaveLength(1);
    expect((await getMembership(p.id, "beto@x.com"))?.role).toBe("editor");
  });

  it("updateRole y removeMember", async () => {
    const p = await createProject({ nombre: "A", ownerEmail: "ana@x.com" });
    await addMember(p.id, "beto@x.com", "viewer");
    await updateRole(p.id, "beto@x.com", "owner");
    expect((await getMembership(p.id, "beto@x.com"))?.role).toBe("owner");
    await removeMember(p.id, "beto@x.com");
    expect(await getMembership(p.id, "beto@x.com")).toBeUndefined();
  });
});

describe("listActiveProjects + renameProject", () => {
  it("rename cambia el nombre; lista activos los creados", async () => {
    const p = await createProject({ nombre: "Viejo", ownerEmail: "ana@x.com" });
    await renameProject(p.id, "Nuevo");
    const active = await listActiveProjects();
    expect(active.find((x) => x.id === p.id)?.nombre).toBe("Nuevo");
  });
});
